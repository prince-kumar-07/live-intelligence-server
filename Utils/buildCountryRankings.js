const axios = require("axios");
const fs = require("fs");
const csv = require("csv-parser");
const { Readable } = require("stream");

async function parseCSV(url) {

  const res = await axios.get(url);

  const rows = [];

  return new Promise((resolve, reject) => {

    Readable.from(res.data)
      .pipe(csv())
      .on("data", (data) => rows.push(data))
      .on("end", () => resolve(rows))
      .on("error", reject);

  });

}

function mapDataset(rows, isoKey, rankKey) {

  const map = {};

  for (const r of rows) {

    const iso = r[isoKey];
    const rank = r[rankKey];

    if (!iso || !rank) continue;

    map[iso] = Number(rank);

  }

  return map;

}

async function buildDataset() {

  console.log("Fetching datasets...");

  const peace = await parseCSV(
    "https://raw.githubusercontent.com/datasets/global-peace-index/master/data/gpi.csv"
  );

  const happiness = await parseCSV(
    "https://raw.githubusercontent.com/plotly/datasets/master/2019_world_happiness.csv"
  );

  const democracy = await parseCSV(
    "https://raw.githubusercontent.com/datasets/democracy-index/master/data/democracy-index.csv"
  );

  const corruption = await parseCSV(
    "https://raw.githubusercontent.com/datasets/corruption-perceptions-index/master/data/cpi.csv"
  );

  const peaceMap = mapDataset(peace, "ISO3", "Rank");
  const happinessMap = mapDataset(happiness, "ISO3", "Overall rank");
  const democracyMap = mapDataset(democracy, "ISO3", "Rank");
  const corruptionMap = mapDataset(corruption, "ISO3", "Rank");

  const countries = Object.keys(peaceMap);

  const dataset = countries.map((iso) => ({

    iso3: iso,

    passportRank: null,
    happinessRank: happinessMap[iso] || null,
    peaceRank: peaceMap[iso] || null,
    militaryRank: null,

    corruptionIndex: corruptionMap[iso] || null,
    democracyIndex: democracyMap[iso] || null,
    hdiIndex: null,
    innovationIndex: null,
    pressFreedomIndex: null,
    cyberSecurityIndexRank: null

  }));

  fs.writeFileSync(
    "./Utils/countryRankings.json",
    JSON.stringify(dataset, null, 2)
  );

  console.log("Dataset created for", dataset.length, "countries");

}

buildDataset();