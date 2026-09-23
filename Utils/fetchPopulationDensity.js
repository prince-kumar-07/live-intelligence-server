const axios = require("axios");
const mongoose = require("mongoose");
const Country = require("../Model/Country");

async function fetchPopulationDensity() {

  const res = await axios.get(
    `${process.env.WORLD_BANK_API_BASE}/EN.POP.DNST?format=json&per_page=20000`,
    { timeout: 20000 }
  );

  const data = res.data[1];

  const latestDensity = {};

  for (const item of data) {

    if (!item.countryiso3code || !item.value) continue;

    const iso = item.countryiso3code;

    // keep first valid value (latest year)
    if (!latestDensity[iso]) {
      latestDensity[iso] = item.value;
    }
  }

  let updated = 0;

  for (const iso in latestDensity) {

    await Country.updateOne(
      { iso3: iso },
      { $set: { "demographics.populationDensity": latestDensity[iso] } }
    );

    updated++;

  }

  console.log("Population density updated");

  return { updated, total: Object.keys(latestDensity).length };
}

module.exports = fetchPopulationDensity;

if (require.main === module) {
  require("dotenv").config();
  require("./database")();
  mongoose.connection.once("open", () => {
    fetchPopulationDensity()
      .then((summary) => { console.log(summary); process.exit(0); })
      .catch((err) => { console.error("Fatal:", err); process.exit(1); });
  });
}