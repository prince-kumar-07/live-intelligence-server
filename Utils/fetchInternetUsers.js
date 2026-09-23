const axios = require("axios");
const mongoose = require("mongoose");
const Country = require("../Model/Country");

async function fetchInternetUsers() {

  const res = await axios.get(
    `${process.env.WORLD_BANK_API_BASE}/IT.NET.USER.ZS?format=json&per_page=20000`,
    { timeout: 20000 }
  );

  const data = res.data[1];

  const latestInternet = {};

  for (const item of data) {

    if (!item.countryiso3code || !item.value) continue;

    const iso = item.countryiso3code;

    // keep first valid value (latest year)
    if (!latestInternet[iso]) {
      latestInternet[iso] = item.value;
    }
  }

  let updated = 0;

  for (const iso in latestInternet) {

    await Country.updateOne(
      { iso3: iso },
      { $set: { "infrastructure.internetPenetration": latestInternet[iso] } }
    );

    updated++;

  }

  console.log("Internet penetration updated");

  return { updated, total: Object.keys(latestInternet).length };
}

module.exports = fetchInternetUsers;

if (require.main === module) {
  require("dotenv").config();
  require("./database")();
  mongoose.connection.once("open", () => {
    fetchInternetUsers()
      .then((summary) => { console.log(summary); process.exit(0); })
      .catch((err) => { console.error("Fatal:", err); process.exit(1); });
  });
}