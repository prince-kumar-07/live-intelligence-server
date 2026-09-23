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

async function fetchIndependenceYear() {

  const countries = await Country.find({}, { iso3: 1 }).lean();
  const isoCodes = countries.map(c => c.iso3).filter(Boolean);

  // One batched query for every country instead of one request per country
  // (Wikidata's rate limits make ~250 sequential requests unreliable/slow).
  const values = isoCodes.map(iso => `"${iso}"`).join(" ");
  const query = `
    SELECT ?iso3 ?year WHERE {
      VALUES ?iso3 { ${values} }
      ?country wdt:P298 ?iso3 .
      OPTIONAL { ?country wdt:P571 ?date1 }
      OPTIONAL { ?country wdt:P8328 ?date2 }
      BIND(COALESCE(?date1, ?date2) AS ?date)
      BIND(YEAR(?date) AS ?year)
    }
  `;

  const res = await axios.post(
    WIKIDATA_URL,
    new URLSearchParams({ query, format: "json" }).toString(),
    { timeout: 60000, headers: HEADERS }
  );

  // Countries can have several inception/founding dates on Wikidata —
  // keep the first one seen per country.
  const byIso = {};
  for (const row of res.data.results.bindings) {
    const iso3 = row.iso3?.value;
    if (!iso3 || byIso[iso3] !== undefined || !row.year) continue;
    byIso[iso3] = row.year.value;
  }

  let updated = 0;
  let skipped = 0;

  for (const iso3 of isoCodes) {
    const year = byIso[iso3];
    if (year === undefined) { skipped++; continue; }

    await Country.updateOne(
      { iso3 },
      { $set: { "government.independenceYear": Number(year) } }
    );
    console.log(iso3, year);
    updated++;
  }

  console.log("Independence years updated");

  return { updated, skipped, total: isoCodes.length };
}

module.exports = fetchIndependenceYear;

if (require.main === module) {
  require("dotenv").config();
  require("./database")();
  mongoose.connection.once("open", () => {
    fetchIndependenceYear()
      .then((summary) => { console.log(summary); process.exit(0); })
      .catch((err) => { console.error("Fatal:", err); process.exit(1); });
  });
}
