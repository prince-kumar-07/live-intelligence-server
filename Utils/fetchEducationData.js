const axios = require("axios");
const mongoose = require("mongoose");
const Country = require("../Model/Country");

// World Bank indicators: SE.ADT.LITR.ZS (adult literacy rate — sparse,
// only ~65 countries report it), SE.SEC.ENRR (secondary school enrollment,
// % gross), SE.XPD.TOTL.GD.ZS (education expenditure, % of GDP).
async function fetchEducationData() {

  const [literacyRes, enrollRes, expRes] = await Promise.all([
    axios.get(`${process.env.WORLD_BANK_API_BASE}/SE.ADT.LITR.ZS?format=json&per_page=20000`, { timeout: 20000 }),
    axios.get(`${process.env.WORLD_BANK_API_BASE}/SE.SEC.ENRR?format=json&per_page=20000`, { timeout: 20000 }),
    axios.get(`${process.env.WORLD_BANK_API_BASE}/SE.XPD.TOTL.GD.ZS?format=json&per_page=20000`, { timeout: 20000 }),
  ]);

  const latest = (rows) => {
    const map = {};
    for (const item of rows) {
      if (!item.countryiso3code || item.value === null || item.value === undefined) continue;
      if (!(item.countryiso3code in map)) map[item.countryiso3code] = item.value;
    }
    return map;
  };

  const literacy = latest(literacyRes.data[1]);
  const enrollment = latest(enrollRes.data[1]);
  const expenditure = latest(expRes.data[1]);

  const isoCodes = new Set([...Object.keys(literacy), ...Object.keys(enrollment), ...Object.keys(expenditure)]);

  let updated = 0;

  for (const iso of isoCodes) {
    const update = {};
    if (literacy[iso] !== undefined) update["education.literacyRate"] = literacy[iso];
    if (enrollment[iso] !== undefined) update["education.secondaryEnrollmentRate"] = enrollment[iso];
    if (expenditure[iso] !== undefined) update["education.educationExpenditurePercentGDP"] = expenditure[iso];

    if (Object.keys(update).length === 0) continue;

    await Country.updateOne({ iso3: iso }, { $set: update });
    updated++;
  }

  console.log("Education data updated:", updated);

  return { updated, total: isoCodes.size };
}

module.exports = fetchEducationData;

if (require.main === module) {
  require("dotenv").config();
  require("./database")();
  mongoose.connection.once("open", () => {
    fetchEducationData()
      .then((summary) => { console.log(summary); process.exit(0); })
      .catch((err) => { console.error("Fatal:", err); process.exit(1); });
  });
}
