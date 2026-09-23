const axios = require("axios");
const mongoose = require("mongoose");
const Country = require("../Model/Country");

async function fetchMilitary() {

  const res = await axios.get(
    `${process.env.WORLD_BANK_API_BASE}/MS.MIL.XPND.GD.ZS?format=json&per_page=20000`,
    { timeout: 20000 }
  );

  const data = res.data[1];

  const latestMilitary = {};

  for (const item of data) {

    if (!item.countryiso3code || !item.value) continue;

    const iso = item.countryiso3code;

    // keep latest value only
    if (!latestMilitary[iso]) {
      latestMilitary[iso] = item.value;
    }
  }

  let updated = 0;

  for (const iso in latestMilitary) {

    await Country.updateOne(
      { iso3: iso },
      { $set: { "military.defenseBudgetPercentGDP": latestMilitary[iso] } }
    );

    updated++;

  }

  console.log("Military spending updated");

  return { updated, total: Object.keys(latestMilitary).length };
}

module.exports = fetchMilitary;

if (require.main === module) {
  require("dotenv").config();
  require("./database")();
  mongoose.connection.once("open", () => {
    fetchMilitary()
      .then((summary) => { console.log(summary); process.exit(0); })
      .catch((err) => { console.error("Fatal:", err); process.exit(1); });
  });
}