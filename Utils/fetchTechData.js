const axios = require("axios");
const mongoose = require("mongoose");
const Country = require("../Model/Country");

// World Bank indicator GB.XPD.RSDV.GD.ZS — research & development
// expenditure, % of GDP. startups/unicorns/techTalentRank have no free
// global data source and are left untouched.
async function fetchTechData() {

  const res = await axios.get(
    `${process.env.WORLD_BANK_API_BASE}/GB.XPD.RSDV.GD.ZS?format=json&per_page=20000`,
    { timeout: 20000 }
  );

  const data = res.data[1];

  const latestRD = {};

  for (const item of data) {
    if (!item.countryiso3code || item.value === null || item.value === undefined) continue;
    const iso = item.countryiso3code;
    if (!(iso in latestRD)) {
      latestRD[iso] = item.value;
    }
  }

  let updated = 0;

  for (const iso in latestRD) {
    await Country.updateOne(
      { iso3: iso },
      { $set: { "tech.rdExpenditurePercentGDP": latestRD[iso] } }
    );
    updated++;
  }

  console.log("R&D expenditure updated:", updated);

  return { updated, total: Object.keys(latestRD).length };
}

module.exports = fetchTechData;

if (require.main === module) {
  require("dotenv").config();
  require("./database")();
  mongoose.connection.once("open", () => {
    fetchTechData()
      .then((summary) => { console.log(summary); process.exit(0); })
      .catch((err) => { console.error("Fatal:", err); process.exit(1); });
  });
}
