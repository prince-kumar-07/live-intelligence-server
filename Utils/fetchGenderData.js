const axios = require("axios");
const mongoose = require("mongoose");
const Country = require("../Model/Country");

// World Bank indicators: SL.TLF.CACT.FE.ZS (female labor force
// participation rate), SG.GEN.PARL.ZS (proportion of seats held by women
// in national parliaments, %).
async function fetchGenderData() {

  const [lfprRes, parlRes] = await Promise.all([
    axios.get(`${process.env.WORLD_BANK_API_BASE}/SL.TLF.CACT.FE.ZS?format=json&per_page=20000`, { timeout: 20000 }),
    axios.get(`${process.env.WORLD_BANK_API_BASE}/SG.GEN.PARL.ZS?format=json&per_page=20000`, { timeout: 20000 }),
  ]);

  const latest = (rows) => {
    const map = {};
    for (const item of rows) {
      if (!item.countryiso3code || item.value === null || item.value === undefined) continue;
      if (!(item.countryiso3code in map)) map[item.countryiso3code] = item.value;
    }
    return map;
  };

  const lfpr = latest(lfprRes.data[1]);
  const parl = latest(parlRes.data[1]);

  const isoCodes = new Set([...Object.keys(lfpr), ...Object.keys(parl)]);

  let updated = 0;

  for (const iso of isoCodes) {
    const update = {};
    if (lfpr[iso] !== undefined) update["gender.femaleLaborForceParticipationRate"] = lfpr[iso];
    if (parl[iso] !== undefined) update["gender.womenInParliamentPercent"] = parl[iso];

    if (Object.keys(update).length === 0) continue;

    await Country.updateOne({ iso3: iso }, { $set: update });
    updated++;
  }

  console.log("Gender data updated:", updated);

  return { updated, total: isoCodes.size };
}

module.exports = fetchGenderData;

if (require.main === module) {
  require("dotenv").config();
  require("./database")();
  mongoose.connection.once("open", () => {
    fetchGenderData()
      .then((summary) => { console.log(summary); process.exit(0); })
      .catch((err) => { console.error("Fatal:", err); process.exit(1); });
  });
}
