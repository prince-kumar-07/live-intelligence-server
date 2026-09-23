const axios = require("axios");
const mongoose = require("mongoose");
const Country = require("../Model/Country");

// World Bank indicator GC.XPN.TOTL.GD.ZS — government total expense,
// % of GDP (this is the broad "how much does this government spend in
// total" figure; health/education/military/R&D spend already have their
// own more specific % GDP fields elsewhere in the schema).
async function fetchGovernmentExpenditure() {

  const res = await axios.get(
    `${process.env.WORLD_BANK_API_BASE}/GC.XPN.TOTL.GD.ZS?format=json&per_page=20000`,
    { timeout: 20000 }
  );

  const data = res.data[1];

  const latest = {};

  for (const item of data) {
    if (!item.countryiso3code || item.value === null || item.value === undefined) continue;
    const iso = item.countryiso3code;
    if (!(iso in latest)) {
      latest[iso] = item.value;
    }
  }

  let updated = 0;

  for (const iso in latest) {
    await Country.updateOne(
      { iso3: iso },
      { $set: { "government.totalExpenditurePercentGDP": latest[iso] } }
    );
    updated++;
  }

  console.log("Government expenditure updated:", updated);

  return { updated, total: Object.keys(latest).length };
}

module.exports = fetchGovernmentExpenditure;

if (require.main === module) {
  require("dotenv").config();
  require("./database")();
  mongoose.connection.once("open", () => {
    fetchGovernmentExpenditure()
      .then((summary) => { console.log(summary); process.exit(0); })
      .catch((err) => { console.error("Fatal:", err); process.exit(1); });
  });
}
