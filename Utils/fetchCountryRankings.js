require("dotenv").config();
const mongoose = require("mongoose");
const axios = require("axios");
const Country = require("../Model/Country");

async function run() {

 await mongoose.connect(process.env.DATABASE_URL);

  const happiness = await axios.get(
    "https://raw.githubusercontent.com/datasets/world-happiness-report/master/data/2023.csv"
  );

  const peace = await axios.get(
    "https://raw.githubusercontent.com/datasets/global-peace-index/master/data/data.csv"
  );

  const corruption = await axios.get(
    "https://raw.githubusercontent.com/datasets/corruption-perceptions-index/master/data/cpi.csv"
  );

  const happinessMap = {};
  const peaceMap = {};
  const corruptionMap = {};

  happiness.data.split("\n").slice(1).forEach(r => {
    const c = r.split(",");
    happinessMap[c[0]] = Number(c[1]);
  });

  peace.data.split("\n").slice(1).forEach(r => {
    const c = r.split(",");
    peaceMap[c[0]] = Number(c[2]);
  });

  corruption.data.split("\n").slice(1).forEach(r => {
    const c = r.split(",");
    corruptionMap[c[0]] = Number(c[2]);
  });

  const countries = await Country.find();

  for (const c of countries) {

    await Country.updateOne(
      { _id: c._id },
      {
        $set: {
          "rankings.happinessRank": happinessMap[c.name] || null,
          "rankings.peaceRank": peaceMap[c.name] || null,
          "rankings.corruptionIndex": corruptionMap[c.name] || null
        }
      }
    );

  }

  console.log("Rankings updated");
  process.exit();
}

run();