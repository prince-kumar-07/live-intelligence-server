const axios = require("axios");
const mongoose = require("mongoose");
const Country = require("../Model/Country");

// World Bank indicators NE.EXP.GNFS.CD / NE.IMP.GNFS.CD — exports/imports of
// goods and services, current US$. tradeBalance is computed from the two.
// majorExportPartners has no free global data source and is left untouched.
async function fetchTradeData() {

  const [exportsRes, importsRes] = await Promise.all([
    axios.get(
      `${process.env.WORLD_BANK_API_BASE}/NE.EXP.GNFS.CD?format=json&per_page=20000`,
      { timeout: 20000 }
    ),
    axios.get(
      `${process.env.WORLD_BANK_API_BASE}/NE.IMP.GNFS.CD?format=json&per_page=20000`,
      { timeout: 20000 }
    ),
  ]);

  const latestExports = {};
  const latestImports = {};

  for (const item of exportsRes.data[1]) {
    if (!item.countryiso3code || item.value === null || item.value === undefined) continue;
    if (!(item.countryiso3code in latestExports)) latestExports[item.countryiso3code] = item.value;
  }

  for (const item of importsRes.data[1]) {
    if (!item.countryiso3code || item.value === null || item.value === undefined) continue;
    if (!(item.countryiso3code in latestImports)) latestImports[item.countryiso3code] = item.value;
  }

  const isoCodes = new Set([...Object.keys(latestExports), ...Object.keys(latestImports)]);

  let updated = 0;

  for (const iso of isoCodes) {
    const exports = latestExports[iso] ?? null;
    const imports = latestImports[iso] ?? null;

    const update = {};
    if (exports !== null) update["trade.exports"] = exports;
    if (imports !== null) update["trade.imports"] = imports;
    if (exports !== null && imports !== null) update["trade.tradeBalance"] = exports - imports;

    if (Object.keys(update).length === 0) continue;

    await Country.updateOne({ iso3: iso }, { $set: update });
    updated++;
  }

  console.log("Trade data updated:", updated);

  return { updated, total: isoCodes.size };
}

module.exports = fetchTradeData;

if (require.main === module) {
  require("dotenv").config();
  require("./database")();
  mongoose.connection.once("open", () => {
    fetchTradeData()
      .then((summary) => { console.log(summary); process.exit(0); })
      .catch((err) => { console.error("Fatal:", err); process.exit(1); });
  });
}
