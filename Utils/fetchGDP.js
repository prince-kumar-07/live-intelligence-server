const axios = require("axios");
const mongoose = require("mongoose");
const Country = require("../Model/Country");

async function fetchGDP() {

  const res = await axios.get(
    `${process.env.WORLD_BANK_API_BASE}/NY.GDP.MKTP.CD?format=json&per_page=20000`,
    { timeout: 20000 }
  );

  const data = res.data[1];

  const latestGDP = {};

  for (const item of data) {

    if (!item.countryiso3code || !item.value) continue;

    const iso = item.countryiso3code;

    // store first valid value (latest year)
    if (!latestGDP[iso]) {
      latestGDP[iso] = item.value;
    }
  }

  let updated = 0;

  for (const iso in latestGDP) {

    await Country.updateOne(
      { iso3: iso },
      { $set: { "economy.gdp": latestGDP[iso] } }
    );

    updated++;

  }

  console.log("GDP data updated");

  return { updated, total: Object.keys(latestGDP).length };
}

module.exports = fetchGDP;

if (require.main === module) {
  require("dotenv").config();
  require("./database")();
  mongoose.connection.once("open", () => {
    fetchGDP()
      .then((summary) => { console.log(summary); process.exit(0); })
      .catch((err) => { console.error("Fatal:", err); process.exit(1); });
  });
}