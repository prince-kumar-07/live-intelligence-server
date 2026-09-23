const axios = require("axios");
const mongoose = require("mongoose");
const Country = require("../Model/Country");

// World Bank indicators: EG.FEC.RNEW.ZS (renewable energy consumption, % of
// total final energy consumption), EG.ELC.ACCS.ZS (access to electricity,
// % of population). oilProduction/oilReserves/electricityProduction have
// no free global data source and are left untouched (World Bank retired
// its electricity-production indicator).
async function fetchEnergyData() {

  const [renewRes, accessRes] = await Promise.all([
    axios.get(`${process.env.WORLD_BANK_API_BASE}/EG.FEC.RNEW.ZS?format=json&per_page=20000`, { timeout: 20000 }),
    axios.get(`${process.env.WORLD_BANK_API_BASE}/EG.ELC.ACCS.ZS?format=json&per_page=20000`, { timeout: 20000 }),
  ]);

  const latest = (rows) => {
    const map = {};
    for (const item of rows) {
      if (!item.countryiso3code || item.value === null || item.value === undefined) continue;
      if (!(item.countryiso3code in map)) map[item.countryiso3code] = item.value;
    }
    return map;
  };

  const renewable = latest(renewRes.data[1]);
  const access = latest(accessRes.data[1]);

  const isoCodes = new Set([...Object.keys(renewable), ...Object.keys(access)]);

  let updated = 0;

  for (const iso of isoCodes) {
    const update = {};
    if (renewable[iso] !== undefined) update["energy.renewableEnergyPercent"] = renewable[iso];
    if (access[iso] !== undefined) update["energy.electricityAccessPercent"] = access[iso];

    if (Object.keys(update).length === 0) continue;

    await Country.updateOne({ iso3: iso }, { $set: update });
    updated++;
  }

  console.log("Energy data updated:", updated);

  return { updated, total: isoCodes.size };
}

module.exports = fetchEnergyData;

if (require.main === module) {
  require("dotenv").config();
  require("./database")();
  mongoose.connection.once("open", () => {
    fetchEnergyData()
      .then((summary) => { console.log(summary); process.exit(0); })
      .catch((err) => { console.error("Fatal:", err); process.exit(1); });
  });
}
