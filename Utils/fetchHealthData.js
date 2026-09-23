const axios = require("axios");
const mongoose = require("mongoose");
const Country = require("../Model/Country");

// World Bank indicators: SP.DYN.LE00.IN (life expectancy at birth),
// SH.XPD.CHEX.GD.ZS (health expenditure, % of GDP),
// SH.MED.BEDS.ZS (hospital beds per 1,000 people).
async function fetchHealthData() {

  const [lifeExpRes, healthExpRes, bedsRes] = await Promise.all([
    axios.get(`${process.env.WORLD_BANK_API_BASE}/SP.DYN.LE00.IN?format=json&per_page=20000`, { timeout: 20000 }),
    axios.get(`${process.env.WORLD_BANK_API_BASE}/SH.XPD.CHEX.GD.ZS?format=json&per_page=20000`, { timeout: 20000 }),
    axios.get(`${process.env.WORLD_BANK_API_BASE}/SH.MED.BEDS.ZS?format=json&per_page=20000`, { timeout: 20000 }),
  ]);

  const latest = (rows) => {
    const map = {};
    for (const item of rows) {
      if (!item.countryiso3code || item.value === null || item.value === undefined) continue;
      if (!(item.countryiso3code in map)) map[item.countryiso3code] = item.value;
    }
    return map;
  };

  const lifeExp = latest(lifeExpRes.data[1]);
  const healthExp = latest(healthExpRes.data[1]);
  const beds = latest(bedsRes.data[1]);

  const isoCodes = new Set([...Object.keys(lifeExp), ...Object.keys(healthExp), ...Object.keys(beds)]);

  let updated = 0;

  for (const iso of isoCodes) {
    const update = {};
    if (lifeExp[iso] !== undefined) update["health.lifeExpectancy"] = lifeExp[iso];
    if (healthExp[iso] !== undefined) update["health.healthExpenditurePercentGDP"] = healthExp[iso];
    if (beds[iso] !== undefined) update["health.hospitalBedsPerThousand"] = beds[iso];

    if (Object.keys(update).length === 0) continue;

    await Country.updateOne({ iso3: iso }, { $set: update });
    updated++;
  }

  console.log("Health data updated:", updated);

  return { updated, total: isoCodes.size };
}

module.exports = fetchHealthData;

if (require.main === module) {
  require("dotenv").config();
  require("./database")();
  mongoose.connection.once("open", () => {
    fetchHealthData()
      .then((summary) => { console.log(summary); process.exit(0); })
      .catch((err) => { console.error("Fatal:", err); process.exit(1); });
  });
}
