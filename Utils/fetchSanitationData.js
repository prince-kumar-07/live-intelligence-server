const axios = require("axios");
const mongoose = require("mongoose");
const Country = require("../Model/Country");

// World Bank indicators: SH.H2O.BASW.ZS (access to basic drinking water,
// % of population), SH.STA.BASS.ZS (access to basic sanitation, % of
// population).
async function fetchSanitationData() {

  const [waterRes, sanitationRes] = await Promise.all([
    axios.get(`${process.env.WORLD_BANK_API_BASE}/SH.H2O.BASW.ZS?format=json&per_page=20000`, { timeout: 20000 }),
    axios.get(`${process.env.WORLD_BANK_API_BASE}/SH.STA.BASS.ZS?format=json&per_page=20000`, { timeout: 20000 }),
  ]);

  const latest = (rows) => {
    const map = {};
    for (const item of rows) {
      if (!item.countryiso3code || item.value === null || item.value === undefined) continue;
      if (!(item.countryiso3code in map)) map[item.countryiso3code] = item.value;
    }
    return map;
  };

  const water = latest(waterRes.data[1]);
  const sanitation = latest(sanitationRes.data[1]);

  const isoCodes = new Set([...Object.keys(water), ...Object.keys(sanitation)]);

  let updated = 0;

  for (const iso of isoCodes) {
    const update = {};
    if (water[iso] !== undefined) update["sanitation.cleanWaterAccessPercent"] = water[iso];
    if (sanitation[iso] !== undefined) update["sanitation.basicSanitationAccessPercent"] = sanitation[iso];

    if (Object.keys(update).length === 0) continue;

    await Country.updateOne({ iso3: iso }, { $set: update });
    updated++;
  }

  console.log("Sanitation data updated:", updated);

  return { updated, total: isoCodes.size };
}

module.exports = fetchSanitationData;

if (require.main === module) {
  require("dotenv").config();
  require("./database")();
  mongoose.connection.once("open", () => {
    fetchSanitationData()
      .then((summary) => { console.log(summary); process.exit(0); })
      .catch((err) => { console.error("Fatal:", err); process.exit(1); });
  });
}
