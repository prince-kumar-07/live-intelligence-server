require("dotenv").config();
const axios = require("axios");
const mongoose = require("mongoose");
const Country = require("../Model/Country");

const WIKIDATA_URL = process.env.WIKIDATA_SPARQL_URL;
// Wikidata now rejects requests without a descriptive User-Agent (bot policy).
const HEADERS = {
  "User-Agent": "CyberThreatServer-AdminConsole/1.0 (local dev tool)",
  "Content-Type": "application/x-www-form-urlencoded",
};

async function fetchGovernmentDetails() {

  const countries = await Country.find({}, { iso3: 1 }).lean();
  const isoCodes = countries.map(c => c.iso3).filter(Boolean);

  // One batched query for every country instead of one request per country
  // (Wikidata's rate limits make ~250 sequential requests unreliable/slow).
  const values = isoCodes.map(iso => `"${iso}"`).join(" ");
  const query = `
    SELECT ?iso3 ?govTypeLabel ?headLabel WHERE {
      VALUES ?iso3 { ${values} }
      ?country wdt:P298 ?iso3.
      OPTIONAL { ?country wdt:P122 ?govType. }
      OPTIONAL { ?country wdt:P35 ?head. }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
    }
  `;

  const res = await axios.post(
    WIKIDATA_URL,
    new URLSearchParams({ query, format: "json" }).toString(),
    { timeout: 60000, headers: HEADERS }
  );

  // Countries can have several governmentType statements on Wikidata —
  // keep the first one seen per country.
  const byIso = {};
  for (const row of res.data.results.bindings) {
    const iso3 = row.iso3?.value;
    if (!iso3 || byIso[iso3]) continue;
    byIso[iso3] = {
      governmentType: row.govTypeLabel?.value ?? null,
      headOfState: row.headLabel?.value ?? null,
    };
  }

  let updated = 0;
  let skipped = 0;

  for (const iso3 of isoCodes) {
    const entry = byIso[iso3];
    if (!entry) { skipped++; continue; }

    const update = {};
    if (entry.governmentType) update["government.governmentType"] = entry.governmentType;
    if (entry.headOfState) update["government.headOfState"] = entry.headOfState;

    if (Object.keys(update).length === 0) { skipped++; continue; }

    await Country.updateOne({ iso3 }, { $set: update });
    console.log("Updated:", iso3);
    updated++;
  }

  console.log("Government details updated");

  return { updated, skipped, total: isoCodes.length };
}

module.exports = fetchGovernmentDetails;

if (require.main === module) {
  require("dotenv").config();
  require("./database")();
  mongoose.connection.once("open", () => {
    fetchGovernmentDetails()
      .then((summary) => { console.log(summary); process.exit(0); })
      .catch((err) => { console.error("Fatal:", err); process.exit(1); });
  });
}
