const axios = require("axios");
const csv = require("csv-parser");
const { Readable } = require("stream");

async function fetchPeaceIndex() {

  const res = await axios.get(
    "https://raw.githubusercontent.com/datasets/global-peace-index/master/data/gpi.csv"
  );

  const rows = [];

  return new Promise((resolve, reject) => {

    Readable.from(res.data)
      .pipe(csv())
      .on("data", (data) => rows.push(data))
      .on("end", () => {
        console.log(rows.slice(0,5)); // first 5 rows
        resolve(rows);
      })
      .on("error", reject);

  });

}

fetchPeaceIndex();