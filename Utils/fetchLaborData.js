const axios = require("axios");
const mongoose = require("mongoose");
const Country = require("../Model/Country");

// World Bank indicators: SL.TLF.CACT.ZS (labor force participation rate),
// SL.AGR.EMPL.ZS / SL.IND.EMPL.ZS / SL.SRV.EMPL.ZS (employment share by
// sector: agriculture, industry, services).
async function fetchLaborData() {

  const [lfprRes, agrRes, indRes, srvRes] = await Promise.all([
    axios.get(`${process.env.WORLD_BANK_API_BASE}/SL.TLF.CACT.ZS?format=json&per_page=20000`, { timeout: 20000 }),
    axios.get(`${process.env.WORLD_BANK_API_BASE}/SL.AGR.EMPL.ZS?format=json&per_page=20000`, { timeout: 20000 }),
    axios.get(`${process.env.WORLD_BANK_API_BASE}/SL.IND.EMPL.ZS?format=json&per_page=20000`, { timeout: 20000 }),
    axios.get(`${process.env.WORLD_BANK_API_BASE}/SL.SRV.EMPL.ZS?format=json&per_page=20000`, { timeout: 20000 }),
  ]);

  const latest = (rows) => {
    const map = {};
    for (const item of rows) {
      if (!item.countryiso3code || item.value === null || item.value === undefined) continue;
      if (!(item.countryiso3code in map)) map[item.countryiso3code] = item.value;
    }
    return map;
  };

  const lfpr = latest(lfprRes.data[1]);
  const agr = latest(agrRes.data[1]);
  const ind = latest(indRes.data[1]);
  const srv = latest(srvRes.data[1]);

  const isoCodes = new Set([...Object.keys(lfpr), ...Object.keys(agr), ...Object.keys(ind), ...Object.keys(srv)]);

  let updated = 0;

  for (const iso of isoCodes) {
    const update = {};
    if (lfpr[iso] !== undefined) update["labor.laborForceParticipationRate"] = lfpr[iso];
    if (agr[iso] !== undefined) update["labor.employmentAgriculturePercent"] = agr[iso];
    if (ind[iso] !== undefined) update["labor.employmentIndustryPercent"] = ind[iso];
    if (srv[iso] !== undefined) update["labor.employmentServicesPercent"] = srv[iso];

    if (Object.keys(update).length === 0) continue;

    await Country.updateOne({ iso3: iso }, { $set: update });
    updated++;
  }

  console.log("Labor data updated:", updated);

  return { updated, total: isoCodes.size };
}

module.exports = fetchLaborData;

if (require.main === module) {
  require("dotenv").config();
  require("./database")();
  mongoose.connection.once("open", () => {
    fetchLaborData()
      .then((summary) => { console.log(summary); process.exit(0); })
      .catch((err) => { console.error("Fatal:", err); process.exit(1); });
  });
}
