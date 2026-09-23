const axios = require("axios");
const mongoose = require("mongoose");
const Country = require("../Model/Country");

// World Bank indicators: AG.LND.ARBL.ZS (arable land, % of land area),
// AG.LND.AGRI.ZS (agricultural land, % of land area),
// AG.PRD.FOOD.XD (food production index, 2014-2016=100).
async function fetchAgricultureData() {

  const [arableRes, agriLandRes, foodProdRes] = await Promise.all([
    axios.get(`${process.env.WORLD_BANK_API_BASE}/AG.LND.ARBL.ZS?format=json&per_page=20000`, { timeout: 20000 }),
    axios.get(`${process.env.WORLD_BANK_API_BASE}/AG.LND.AGRI.ZS?format=json&per_page=20000`, { timeout: 20000 }),
    axios.get(`${process.env.WORLD_BANK_API_BASE}/AG.PRD.FOOD.XD?format=json&per_page=20000`, { timeout: 20000 }),
  ]);

  const latest = (rows) => {
    const map = {};
    for (const item of rows) {
      if (!item.countryiso3code || item.value === null || item.value === undefined) continue;
      if (!(item.countryiso3code in map)) map[item.countryiso3code] = item.value;
    }
    return map;
  };

  const arable = latest(arableRes.data[1]);
  const agriLand = latest(agriLandRes.data[1]);
  const foodProd = latest(foodProdRes.data[1]);

  const isoCodes = new Set([...Object.keys(arable), ...Object.keys(agriLand), ...Object.keys(foodProd)]);

  let updated = 0;

  for (const iso of isoCodes) {
    const update = {};
    if (arable[iso] !== undefined) update["agriculture.arableLandPercent"] = arable[iso];
    if (agriLand[iso] !== undefined) update["agriculture.agriculturalLandPercent"] = agriLand[iso];
    if (foodProd[iso] !== undefined) update["agriculture.foodProductionIndex"] = foodProd[iso];

    if (Object.keys(update).length === 0) continue;

    await Country.updateOne({ iso3: iso }, { $set: update });
    updated++;
  }

  console.log("Agriculture data updated:", updated);

  return { updated, total: isoCodes.size };
}

module.exports = fetchAgricultureData;

if (require.main === module) {
  require("dotenv").config();
  require("./database")();
  mongoose.connection.once("open", () => {
    fetchAgricultureData()
      .then((summary) => { console.log(summary); process.exit(0); })
      .catch((err) => { console.error("Fatal:", err); process.exit(1); });
  });
}
