const axios = require("axios");
const mongoose = require("mongoose");
const Country = require("../Model/Country");

async function fetchEconomyData(){

const countries = await Country.find();

/* WORLD BANK APIs */

const gdpPerCapitaAPI =
`${process.env.WORLD_BANK_API_BASE}/NY.GDP.PCAP.CD?format=json&per_page=20000`;

const inflationAPI =
`${process.env.WORLD_BANK_API_BASE}/FP.CPI.TOTL.ZG?format=json&per_page=20000`;

const unemploymentAPI =
`${process.env.WORLD_BANK_API_BASE}/SL.UEM.TOTL.ZS?format=json&per_page=20000`;

const govDebtAPI =
`${process.env.WORLD_BANK_API_BASE}/GC.DOD.TOTL.GD.ZS?format=json&per_page=20000`;

const [gdpRes, inflationRes, unemploymentRes, govDebtRes] = await Promise.all([
axios.get(gdpPerCapitaAPI, { timeout: 20000 }),
axios.get(inflationAPI, { timeout: 20000 }),
axios.get(unemploymentAPI, { timeout: 20000 }),
axios.get(govDebtAPI, { timeout: 20000 })
]);

const gdpData = gdpRes.data[1];
const inflationData = inflationRes.data[1];
const unemploymentData = unemploymentRes.data[1];
const govDebtData = govDebtRes.data[1];

/* convert API data → fast lookup maps */

const gdpMap = {};
const inflationMap = {};
const unemploymentMap = {};
const govDebtMap = {};

/* World Bank returns one row per country PER YEAR (oldest last) — keep
   only the first (most recent) value per country, same as every other
   fetcher in this project. */

gdpData.forEach(d=>{
if(d.countryiso3code && d.value && !(d.countryiso3code in gdpMap))
gdpMap[d.countryiso3code] = d.value;
});

inflationData.forEach(d=>{
if(d.countryiso3code && d.value && !(d.countryiso3code in inflationMap))
inflationMap[d.countryiso3code] = d.value;
});

unemploymentData.forEach(d=>{
if(d.countryiso3code && d.value && !(d.countryiso3code in unemploymentMap))
unemploymentMap[d.countryiso3code] = d.value;
});

govDebtData.forEach(d=>{
if(d.countryiso3code && d.value && !(d.countryiso3code in govDebtMap))
govDebtMap[d.countryiso3code] = d.value;
});

/* always refresh to the latest value (a "Refresh" click should refresh,
   not just fill gaps left by earlier/partial runs) */

let updates = 0;

for(const c of countries){

const update = {};

if(gdpMap[c.iso3] !== undefined)
update["economy.gdpPerCapita"] = gdpMap[c.iso3];

if(inflationMap[c.iso3] !== undefined)
update["economy.inflationRate"] = inflationMap[c.iso3];

if(unemploymentMap[c.iso3] !== undefined)
update["economy.unemploymentRate"] = unemploymentMap[c.iso3];

if(govDebtMap[c.iso3] !== undefined)
update["economy.governmentDebtPercentGDP"] = govDebtMap[c.iso3];

if(Object.keys(update).length){

await Country.updateOne(
{ iso3:c.iso3 },
{ $set:update }
);

updates++;

}

}

console.log("Countries Updated:",updates);

return { updated: updates, total: countries.length };

}

module.exports = fetchEconomyData;

if (require.main === module) {
  require("dotenv").config();
  require("./database")();
  mongoose.connection.once("open", () => {
    fetchEconomyData()
      .then((summary) => { console.log(summary); process.exit(0); })
      .catch((err) => { console.error("Fatal:", err); process.exit(1); });
  });
}