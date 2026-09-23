const axios = require("axios");

async function fetchCyberIndex() {

  const url =
  "https://raw.githubusercontent.com/UIUC-ischool-DataViz/spring2019-group04/master/data/cybersecurity.csv";

  const res = await axios.get(url);

  const lines = res.data.split("\n").slice(1);

  const data = {};

  for (const line of lines) {

    const parts = line.split(",");

    const country = parts[0];
    const score = parts[1];

    if (!country) continue;

    data[country.trim()] = parseFloat(score) || 0;

  }

  return data;

}

module.exports = fetchCyberIndex;