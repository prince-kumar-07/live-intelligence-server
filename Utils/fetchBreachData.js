const axios = require("axios");

async function fetchBreachData() {

  const res = await axios.get(
    "https://raw.githubusercontent.com/danielmiessler/SecLists/master/Fuzzing/Databases/breach-compilation.txt"
  );

  const breaches = {};

  const lines = res.data.split("\n");

  for (const line of lines) {

    const parts = line.split("@");

    if (parts.length < 2) continue;

    const domain = parts[1];

    breaches[domain] = (breaches[domain] || 0) + 1;

  }

  return breaches;
}

module.exports = fetchBreachData;