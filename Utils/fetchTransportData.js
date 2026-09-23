const axios = require("axios");
const mongoose = require("mongoose");
const Country = require("../Model/Country");

// World Bank indicator IS.RRS.TOTL.KM — rail lines, total route-km.
// roadLength/airports/seaports have no free, currently-updated global data
// source (World Bank's road-network indicator is stale/retired) and are
// left untouched.
async function fetchTransportData() {

  const res = await axios.get(
    `${process.env.WORLD_BANK_API_BASE}/IS.RRS.TOTL.KM?format=json&per_page=20000`,
    { timeout: 20000 }
  );

  const data = res.data[1];

  const latestRail = {};

  for (const item of data) {
    if (!item.countryiso3code || item.value === null || item.value === undefined) continue;
    const iso = item.countryiso3code;
    if (!(iso in latestRail)) {
      latestRail[iso] = item.value;
    }
  }

  let updated = 0;

  for (const iso in latestRail) {
    await Country.updateOne(
      { iso3: iso },
      { $set: { "transport.railLength": latestRail[iso] } }
    );
    updated++;
  }

  console.log("Rail length updated:", updated);

  return { updated, total: Object.keys(latestRail).length };
}

module.exports = fetchTransportData;

if (require.main === module) {
  require("dotenv").config();
  require("./database")();
  mongoose.connection.once("open", () => {
    fetchTransportData()
      .then((summary) => { console.log(summary); process.exit(0); })
      .catch((err) => { console.error("Fatal:", err); process.exit(1); });
  });
}
