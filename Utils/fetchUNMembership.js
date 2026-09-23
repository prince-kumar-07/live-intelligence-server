const axios = require("axios");
const mongoose = require("mongoose");
const Country = require("../Model/Country");

async function fetchUNMembership() {

  // REST Countries' free API was deprecated (now requires a paid key), so
  // this pulls from the same open dataset it used to mirror — the
  // mledoze/countries project, served free via jsDelivr, no key needed.
  const res = await axios.get(
    process.env.COUNTRIES_DATASET_URL,
    { timeout: 20000 }
  );

  const countries = res.data;

  if (!Array.isArray(countries)) {
    throw new Error(
      "Countries dataset did not return a list. Response: " + JSON.stringify(countries).slice(0, 200)
    );
  }

  let updated = 0;

  for (const c of countries) {

    if (!c.cca3) continue;

    await Country.updateOne(
      { iso3: c.cca3 },
      { $set: { "government.unMember": c.unMember } }
    );

    updated++;

  }

  console.log("UN membership updated");

  return { updated, total: countries.length };
}

module.exports = fetchUNMembership;

if (require.main === module) {
  require("dotenv").config();
  require("./database")();
  mongoose.connection.once("open", () => {
    fetchUNMembership()
      .then((summary) => { console.log(summary); process.exit(0); })
      .catch((err) => { console.error("Fatal:", err); process.exit(1); });
  });
}