require("dotenv").config();
const axios = require("axios");
const mongoose = require("mongoose");
const Country = require("../Model/Country");

async function fetchInflation(){


 await mongoose.connect(process.env.DATABASE_URL);

const res = await axios.get(
"https://api.worldbank.org/v2/country/all/indicator/FP.CPI.TOTL.ZG?format=json&per_page=400"
);

const data = res.data[1];

for(const item of data){

if(!item.countryiso3code || !item.value) continue;

await Country.updateOne(
{ iso3: item.countryiso3code },
{ $set:{ "economy.inflationRate": item.value } }
);

}

console.log("Inflation updated");

mongoose.connection.close();

}

fetchInflation();