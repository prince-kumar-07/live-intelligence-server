const axios = require("axios");
const mongoose = require("mongoose");
const Country = require("../Model/Country");

async function fetchInfrastructureData(){

const countries = await Country.find();

/* WORLD BANK API */

const mobileAPI =
`${process.env.WORLD_BANK_API_BASE}/IT.CEL.SETS.P2?format=json&per_page=20000`;

const broadbandAPI =
`${process.env.WORLD_BANK_API_BASE}/IT.NET.BBND.P2?format=json&per_page=20000`;

const [mobileRes, broadbandRes] = await Promise.all([
  axios.get(mobileAPI, { timeout: 20000 }),
  axios.get(broadbandAPI, { timeout: 20000 }),
]);

/* convert API → fast lookup. World Bank returns one row per country PER
   YEAR (oldest last) — keep only the first (most recent) value. */

const mobileMap = {};

mobileRes.data[1].forEach(d=>{
if(d.countryiso3code && d.value && !(d.countryiso3code in mobileMap))
mobileMap[d.countryiso3code] = d.value;
});

const broadbandMap = {};

broadbandRes.data[1].forEach(d=>{
if(d.countryiso3code && d.value && !(d.countryiso3code in broadbandMap))
broadbandMap[d.countryiso3code] = d.value;
});

let updates = 0;

for(const c of countries){

const update = {};

/* always refresh to the latest value (a "Refresh" click should refresh,
   not just fill gaps left by earlier/partial runs) */

if(mobileMap[c.iso3] !== undefined)
update["infrastructure.mobileSubscriptions"] = mobileMap[c.iso3];

if(broadbandMap[c.iso3] !== undefined)
update["infrastructure.broadbandSubscriptions"] = broadbandMap[c.iso3];

/* dataCenters / submarineCables / cloudRegions: no free, reliable
   global data source found yet — intentionally left untouched rather
   than filled with fabricated placeholder numbers. */

if(Object.keys(update).length){

await Country.updateOne(
{ iso3:c.iso3 },
{ $set:update }
);

updates++;

}

}

console.log("Infrastructure Updated:",updates);

return { updated: updates, total: countries.length };

}

module.exports = fetchInfrastructureData;

if (require.main === module) {
  require("dotenv").config();
  require("./database")();
  mongoose.connection.once("open", () => {
    fetchInfrastructureData()
      .then((summary) => { console.log(summary); process.exit(0); })
      .catch((err) => { console.error("Fatal:", err); process.exit(1); });
  });
}