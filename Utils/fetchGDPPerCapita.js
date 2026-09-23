require("dotenv").config();
const axios = require("axios");
const mongoose = require("mongoose");
const Country = require("../Model/Country");

async function fetchGDPPerCapita(){

await mongoose.connect(process.env.DATABASE_URL);
 

console.log("MongoDB Connected");

const res = await axios.get(
"https://api.worldbank.org/v2/country/all/indicator/NY.GDP.PCAP.CD?format=json&per_page=20000"
);

const data = res.data[1];

let updated = 0;

for(const item of data){

if(!item.countryiso3code || !item.value) continue;

const result = await Country.updateOne(
{ iso3: item.countryiso3code },
{ $set:{ "economy.gdpPerCapita": item.value } }
);

if(result.modifiedCount > 0){
updated++;
console.log("Updated:", item.countryiso3code);
}

}

console.log("Total Updated:", updated);

mongoose.connection.close();

}

fetchGDPPerCapita();