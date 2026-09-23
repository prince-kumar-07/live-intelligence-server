const axios = require("axios");
const mongoose = require("mongoose");
const Country = require("../Model/Country");

// World Bank indicators: SI.POV.DDAY (poverty headcount ratio at $2.15/day),
// SI.DST.10TH.10 (income share held by highest 10%),
// SI.DST.FRST.10 (income share held by lowest 10%).
async function fetchPovertyData() {

  const [povertyRes, top10Res, bottom10Res] = await Promise.all([
    axios.get(`${process.env.WORLD_BANK_API_BASE}/SI.POV.DDAY?format=json&per_page=20000`, { timeout: 20000 }),
    axios.get(`${process.env.WORLD_BANK_API_BASE}/SI.DST.10TH.10?format=json&per_page=20000`, { timeout: 20000 }),
    axios.get(`${process.env.WORLD_BANK_API_BASE}/SI.DST.FRST.10?format=json&per_page=20000`, { timeout: 20000 }),
  ]);

  const latest = (rows) => {
    const map = {};
    for (const item of rows) {
      if (!item.countryiso3code || item.value === null || item.value === undefined) continue;
      if (!(item.countryiso3code in map)) map[item.countryiso3code] = item.value;
    }
    return map;
  };

  const poverty = latest(povertyRes.data[1]);
  const top10 = latest(top10Res.data[1]);
  const bottom10 = latest(bottom10Res.data[1]);

  const isoCodes = new Set([...Object.keys(poverty), ...Object.keys(top10), ...Object.keys(bottom10)]);

  let updated = 0;

  for (const iso of isoCodes) {
    const update = {};
    if (poverty[iso] !== undefined) update["poverty.povertyHeadcountRatio"] = poverty[iso];
    if (top10[iso] !== undefined) update["poverty.incomeShareTop10"] = top10[iso];
    if (bottom10[iso] !== undefined) update["poverty.incomeShareBottom10"] = bottom10[iso];

    if (Object.keys(update).length === 0) continue;

    await Country.updateOne({ iso3: iso }, { $set: update });
    updated++;
  }

  console.log("Poverty data updated:", updated);

  return { updated, total: isoCodes.size };
}

module.exports = fetchPovertyData;

if (require.main === module) {
  require("dotenv").config();
  require("./database")();
  mongoose.connection.once("open", () => {
    fetchPovertyData()
      .then((summary) => { console.log(summary); process.exit(0); })
      .catch((err) => { console.error("Fatal:", err); process.exit(1); });
  });
}
