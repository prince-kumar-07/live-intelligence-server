const axios = require("axios");
const mongoose = require("mongoose");
const Country = require("../Model/Country");

// World Bank indicators: ST.INT.ARVL (international tourist arrivals),
// ST.INT.RCPT.CD (international tourism receipts, current US$).
// Note: many countries' most recent data point is from 2020 (COVID-era
// reporting gap) — this is the latest World Bank actually has, not a bug.
async function fetchTourismData() {

  const [arrivalsRes, receiptsRes] = await Promise.all([
    axios.get(`${process.env.WORLD_BANK_API_BASE}/ST.INT.ARVL?format=json&per_page=20000`, { timeout: 20000 }),
    axios.get(`${process.env.WORLD_BANK_API_BASE}/ST.INT.RCPT.CD?format=json&per_page=20000`, { timeout: 20000 }),
  ]);

  const latest = (rows) => {
    const map = {};
    for (const item of rows) {
      if (!item.countryiso3code || item.value === null || item.value === undefined) continue;
      if (!(item.countryiso3code in map)) map[item.countryiso3code] = item.value;
    }
    return map;
  };

  const arrivals = latest(arrivalsRes.data[1]);
  const receipts = latest(receiptsRes.data[1]);

  const isoCodes = new Set([...Object.keys(arrivals), ...Object.keys(receipts)]);

  let updated = 0;

  for (const iso of isoCodes) {
    const update = {};
    if (arrivals[iso] !== undefined) update["tourism.touristArrivals"] = arrivals[iso];
    if (receipts[iso] !== undefined) update["tourism.tourismReceipts"] = receipts[iso];

    if (Object.keys(update).length === 0) continue;

    await Country.updateOne({ iso3: iso }, { $set: update });
    updated++;
  }

  console.log("Tourism data updated:", updated);

  return { updated, total: isoCodes.size };
}

module.exports = fetchTourismData;

if (require.main === module) {
  require("dotenv").config();
  require("./database")();
  mongoose.connection.once("open", () => {
    fetchTourismData()
      .then((summary) => { console.log(summary); process.exit(0); })
      .catch((err) => { console.error("Fatal:", err); process.exit(1); });
  });
}
