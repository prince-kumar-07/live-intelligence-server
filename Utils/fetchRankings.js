require("dotenv").config();
const mongoose = require("mongoose");
const axios = require("axios");
const Country = require("../Model/Country");

async function fetchRankings(){

 await mongoose.connect(process.env.DATABASE_URL);

console.log("MongoDB Connected");

/* ---------------- PASSPORT RANK ---------------- */

const passport = await axios.get(
"https://raw.githubusercontent.com/ilyankou/passport-index-dataset/master/passport-index-tidy-iso3.csv"
);
const passportLines = passport.data.split("\n").slice(1);

for(const row of passportLines){

const [iso3, year, mobility, rank] = row.split(",");

if(!iso3 || !rank) continue;

await Country.updateOne(
{ iso3 },
{ $set: { "rankings.passportRank": Number(rank) } }
);

}

/* ---------------- HAPPINESS RANK ---------------- */

const happiness = await axios.get(
"https://raw.githubusercontent.com/plotly/datasets/master/world-happiness-report-2021.csv"
);


const happinessLines = happiness.data.split("\n").slice(1);

for(const row of happinessLines){

const parts = row.split(",");

const country = parts[0];
const rank = parts[2];

await Country.updateOne(
{ name: country },
{ $set: { "rankings.happinessRank": Number(rank) } }
);

}

/* ---------------- PEACE RANK ---------------- */

const peace = await axios.get(
"https://raw.githubusercontent.com/datasets/global-peace-index/master/data/gpi.csv"
);

const peaceLines = peace.data.split("\n").slice(1);

for(const row of peaceLines){

const parts = row.split(",");

const country = parts[0];
const rank = parts[1];

await Country.updateOne(
{ name: country },
{ $set: { "rankings.peaceRank": Number(rank) } }
);

}

/* ---------------- MILITARY RANK ---------------- */

const military = await axios.get(
"https://raw.githubusercontent.com/plotly/datasets/master/global-firepower-2023.csv"
);

const militaryLines = military.data.split("\n").slice(1);

for(const row of militaryLines){

const parts = row.split(",");

const country = parts[0];
const rank = parts[1];

await Country.updateOne(
{ name: country },
{ $set: { "rankings.militaryRank": Number(rank) } }
);

}

console.log("All rankings updated");

mongoose.connection.close();

}

fetchRankings();