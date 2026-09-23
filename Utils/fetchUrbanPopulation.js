const axios = require("axios");
const mongoose = require("mongoose");
const Country = require("../Model/Country");

async function fetchUrbanPopulation(){

const res = await axios.get(
`${process.env.WORLD_BANK_API_BASE}/SP.URB.TOTL.IN.ZS?format=json&per_page=20000`,
{ timeout: 20000 }
);

const data = res.data[1];

// World Bank returns one row per country PER YEAR (thousands of rows) —
// keep only the first (most recent) value per country before writing,
// same pattern as the other World Bank fetchers.
const latestUrban = {};

for (const item of data) {
  if (!item.countryiso3code || !item.value) continue;
  const iso = item.countryiso3code;
  if (!latestUrban[iso]) {
    latestUrban[iso] = item.value;
  }
}

let updated = 0;

for (const iso in latestUrban) {

  await Country.updateOne(
    { iso3: iso },
    { $set: { "demographics.urbanPopulation": latestUrban[iso] } }
  );

  updated++;

}

console.log("Urban population updated:",updated);

return { updated, total: Object.keys(latestUrban).length };

}

module.exports = fetchUrbanPopulation;

if (require.main === module) {
  require("dotenv").config();
  require("./database")();
  mongoose.connection.once("open", () => {
    fetchUrbanPopulation()
      .then((summary) => { console.log(summary); process.exit(0); })
      .catch((err) => { console.error("Fatal:", err); process.exit(1); });
  });
}