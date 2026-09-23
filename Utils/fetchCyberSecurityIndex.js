require("dotenv").config();
const axios = require("axios");
const mongoose = require("mongoose");
const Country = require("../Model/Country");

async function fetchCyberIndex(){


 await mongoose.connect(process.env.DATABASE_URL);

console.log("MongoDB Connected");

const res = await axios.get(
"https://raw.githubusercontent.com/owid/covid-19-data/master/public/data/owid-covid-data.csv"
);

const rows = res.data.split("\n");

for(let i=1;i<rows.length;i++){

const cols = rows[i].split(",");

const iso3 = cols[0];     // iso code
const randomScore = Math.random()*1; // placeholder

if(!iso3) continue;

await Country.updateOne(
{ iso3 },
{ $set:{ "cyber.cyberSecurityIndex": randomScore } }
);

}

console.log("CyberSecurityIndex updated");

mongoose.connection.close();

}

fetchCyberIndex();