const axios = require("axios");
const mongoose = require("mongoose");
const Country = require("../Model/Country");

// World Bank indicator EN.GHG.CO2.PC.CE.AR5 — CO2 emissions per capita
// (the older EN.ATM.CO2E.PC indicator was retired). climateRiskIndex and
// naturalDisastersPerYear have no free global data source and are left
// untouched.
async function fetchClimateData() {

  const res = await axios.get(
    `${process.env.WORLD_BANK_API_BASE}/EN.GHG.CO2.PC.CE.AR5?format=json&per_page=20000`,
    { timeout: 20000 }
  );

  const data = res.data[1];

  const latestCO2 = {};

  for (const item of data) {
    if (!item.countryiso3code || item.value === null || item.value === undefined) continue;
    const iso = item.countryiso3code;
    if (!(iso in latestCO2)) {
      latestCO2[iso] = item.value;
    }
  }

  let updated = 0;

  for (const iso in latestCO2) {
    await Country.updateOne(
      { iso3: iso },
      { $set: { "climate.co2Emissions": latestCO2[iso] } }
    );
    updated++;
  }

  console.log("CO2 emissions updated:", updated);

  return { updated, total: Object.keys(latestCO2).length };
}

module.exports = fetchClimateData;

if (require.main === module) {
  require("dotenv").config();
  require("./database")();
  mongoose.connection.once("open", () => {
    fetchClimateData()
      .then((summary) => { console.log(summary); process.exit(0); })
      .catch((err) => { console.error("Fatal:", err); process.exit(1); });
  });
}
