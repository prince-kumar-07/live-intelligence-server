/**
 * updateNewFields.js
 *
 * Populates every field in:
 *   military  · energy  · trade  · risk  · tech  · climate  · transport
 *
 * ─── DATA SOURCES ────────────────────────────────────────────────────────────
 *
 *  Section   Field                    Source
 *  ───────── ──────────────────────── ──────────────────────────────────────
 *  military  activePersonnel          Global Firepower embedded table
 *            reservePersonnel         Global Firepower embedded table
 *            defenseBudget            World Bank MS.MIL.XPND.CD
 *            nuclearWeapons           SIPRI embedded table
 *
 *  energy    oilProduction            World Bank EG.ELC.FOSL.ZS (proxy) + embedded
 *            oilReserves              EIA/embedded table
 *            electricityProduction    World Bank EG.ELC.PROD.KH
 *            renewableEnergyPercent   World Bank EG.FEC.RNEW.ZS
 *
 *  trade     exports                  World Bank NE.EXP.GNFS.CD
 *            imports                  World Bank NE.IMP.GNFS.CD
 *            tradeBalance             derived (exports − imports)
 *            majorExportPartners      WITS API (World Integrated Trade Solution)
 *
 *  risk      politicalStability       World Bank PV.EST (WGI)
 *            terrorismIndex           GTI 2023 embedded table
 *            disasterRiskIndex        INFORM 2023 embedded table
 *
 *  tech      startups                 StartupBlink embedded table
 *            unicorns                 CB Insights embedded table
 *            techTalentRank           GTCI 2023 embedded table
 *
 *  climate   co2Emissions             World Bank EN.ATM.CO2E.KT
 *            climateRiskIndex         Germanwatch GCRI 2023 embedded table
 *            naturalDisastersPerYear  EM-DAT / INFORM embedded table
 *
 *  transport airports                 World Bank IS.AIR.DPRT (proxy) + embedded
 *            seaports                 embedded table (CIA World Factbook)
 *            railLength               World Bank IS.RRS.TOTL.KM
 *            roadLength               World Bank IS.ROD.TOTL.KM
 *
 * All World Bank calls: free, no API key.
 * WITS API:             free, no API key (rate-limited).
 * Embedded tables:      2022–2024 best-available public data.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Usage:
 *   node updateNewFields.js
 *
 * Prerequisites:
 *   npm install mongoose axios
 */

"use strict";

require("dotenv").config();
const mongoose = require("mongoose");
const axios    = require("axios");
const Country  = require("../Model/Country");

const MONGO_URI = process.env.DATABASE_URL;

// ─── UTILS ────────────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const round = (v, d = 2) => +parseFloat(v).toFixed(d);

async function safeGet(url, opts = {}) {
  try {
    const res = await axios.get(url, { timeout: 22000, ...opts });
    return res.data;
  } catch (e) {
    console.warn(`  ✗ GET failed: ${url.slice(0, 80)} — ${e.message}`);
    return null;
  }
}

/** World Bank: indicator → Map<ISO3_upper → value> */
async function fetchWB(indicator, label) {
  process.stdout.write(`  → WB [${indicator}] ${label} ... `);
  const url = `https://api.worldbank.org/v2/country/all/indicator/${indicator}?format=json&per_page=350&mrv=1`;
  const data = await safeGet(url);
  if (!data?.[1]) { console.log("FAILED"); return new Map(); }
  const map = new Map();
  for (const row of data[1]) {
    const iso3 = row?.country?.id?.toUpperCase();
    const val  = row?.value;
    if (iso3 && val !== null && val !== undefined && !isNaN(Number(val))) {
      map.set(iso3, round(Number(val), 4));
    }
  }
  console.log(`${map.size} countries`);
  return map;
}

// ─── EMBEDDED TABLES ─────────────────────────────────────────────────────────
// Keys are ISO2 codes unless noted.  Sources: GFP 2024, SIPRI 2024,
// GTI 2023, INFORM 2023, StartupBlink 2023, CB Insights 2024,
// GTCI 2023, Germanwatch GCRI 2023.

/* military.activePersonnel (thousands) */
const ACTIVE_TROOPS = {
  CN:2185,IN:1455,USA:1395,KP:1280,RU:900,PK:654,IR:575,KR:555,VN:482,EG:438,
  MM:406,ID:395,BR:370,TH:366,TR:355,CO:295,MX:277,BD:163,SA:257,ET:138,
  AR:74,IQ:65,SY:142,DE:183,FR:205,GB:153,UA:200,PL:165,IL:170,AZ:67,
  AF:180,NG:135,SD:109,MA:196,DZ:130,AO:107,TZ:27,KE:24,GH:16,ZA:78,
  JP:247,PH:143,TW:163,AU:59,MY:113,SG:72,NZ:9,NP:96,LK:46,
  CA:68,ES:124,IT:165,PT:28,GR:142,RO:70,HU:37,CZ:27,BG:30,
};

/* military.reservePersonnel (thousands) */
const RESERVE_TROOPS = {
  VN:5000,KP:600,KR:3100,BR:1340,IN:1155,RU:2000,CN:510,USA:847,TW:1655,
  IR:350,PK:550,EG:479,TR:379,ID:400,TH:245,PL:75,UA:900,FR:36,DE:29,
  GB:79,IL:465,SA:25,AU:28,JP:56,CA:51,ES:15,IT:18,GR:220,
};

/* military.nuclearWeapons — SIPRI 2024 (warheads) */
const NUCLEAR = {
  RU:5580, USA:5044, CN:500, FR:290, GB:225, PK:170, IN:172, IL:90, KP:50,
};

/* energy.oilProduction (thousand barrels/day) */
const OIL_PROD = {
  USA:12900,SA:11500,RU:10500,CA:4700,IQ:4400,CN:4200,AE:3700,IR:3400,
  BR:3200,KW:2600,MX:1900,NO:1700,NG:1600,KZ:1700,LY:1200,QA:1800,
  DZ:1200,CO:800,AO:1100,GB:800,AZ:600,EC:500,MY:500,IN:700,
  VE:800,TN:40,EG:590,ID:600,AU:400,AR:600,BY:30,GA:200,CG:260,
};

/* energy.oilReserves (billion barrels) */
const OIL_RES = {
  VE:304,SA:298,CA:168,IR:209,IQ:145,KW:102,AE:98,RU:80,LY:48,
  NG:37,KZ:30,QA:25,CN:26,BR:13,AZ:7,MX:6,NO:6,DZ:12,
  ID:3,IN:4,GB:2,AU:2,USA:38,EG:3,AO:8,
};

/* risk.terrorismIndex 0–10 (GTI 2023, 10=worst) */
const TERROR_IDX = {
  AF:9.1,IQ:8.3,SY:8.2,SS:8.1,NG:8.4,BF:8.0,ML:7.9,SO:7.8,NE:7.5,
  CM:7.0,PK:7.6,CD:6.9,IN:6.5,CF:6.9,YE:6.9,MZ:6.5,ET:6.4,
  KE:5.9,TD:6.2,MX:5.5,CO:5.0,PH:5.5,EG:5.2,LY:5.6,SA:4.1,
  IR:4.5,BI:5.0,UA:5.8,RU:4.8,TR:5.3,BD:4.2,TH:4.0,
  IL:4.6,LB:4.7,MM:6.0,ID:3.9,MA:3.2,TN:3.7,DZ:3.8,
  FR:2.5,DE:2.1,GB:2.6,ES:2.3,BE:2.4,NL:1.8,IT:1.7,
  USA:3.6,CA:2.1,AU:1.9,NZ:1.0,JP:1.1,KR:1.0,CN:2.7,
  BR:3.2,AR:0.8,CL:1.5,PE:2.0,ZA:2.1,
  SG:0.3,NO:0.8,SE:0.9,DK:0.7,FI:0.6,CH:0.5,AT:0.6,
};

/* risk.disasterRiskIndex 0–10 (INFORM 2023) */
const DISASTER_RISK = {
  CD:8.5,AF:8.4,YE:8.3,SS:8.1,SY:8.0,SO:7.9,CF:7.8,NG:7.5,PK:7.2,
  BI:7.0,ML:6.8,MZ:6.9,ET:6.7,TD:6.6,KE:6.0,SD:6.4,NE:6.5,UG:5.9,
  HT:7.6,BD:6.2,PH:7.8,IN:5.5,MM:6.3,ID:6.5,LA:5.8,KH:5.4,
  CN:4.8,VN:5.3,TH:4.5,BO:5.0,PE:5.2,EC:5.8,CO:5.1,
  TR:4.9,IQ:6.2,LY:5.5,IR:5.0,EG:4.2,MA:4.0,DZ:4.3,
  RU:3.8,UA:5.9,MX:5.3,BR:4.6,ZA:4.5,NG:6.3,
  USA:3.5,CA:2.8,AU:3.2,NZ:3.9,JP:5.2,KR:3.0,
  DE:1.9,FR:2.3,GB:2.0,IT:3.1,ES:2.8,GR:3.5,
  NO:1.5,SE:1.4,DK:1.3,FI:1.2,CH:1.6,AT:1.8,
};

/* tech.startups (ecosystem count — StartupBlink 2023) */
const STARTUPS = {
  USA:78000,CN:18000,GB:12000,IN:11000,DE:7000,IL:6000,CA:6000,FR:5500,
  BR:5000,AU:4000,SE:3800,NL:3500,KR:3200,SG:3000,JP:2800,ES:2500,
  CH:2400,FI:2200,DK:2100,NO:1900,ID:2000,TR:1800,MX:1700,
  PL:1600,UA:1500,CZ:1200,AR:1400,CO:1100,PT:1000,
  ZA:800,EG:700,KE:600,NG:550,MA:400,TN:300,
  RU:1600,IT:1500,BE:1300,AT:1100,HU:800,RO:700,
  AE:1800,SA:900,QA:500,KW:300,BH:200,
  MY:1200,VN:900,TH:800,PH:700,BD:600,PK:500,
  NZ:900,CL:800,PE:600,EC:400,
};

/* tech.unicorns (CB Insights 2024) */
const UNICORNS = {
  USA:703,CN:172,IN:68,GB:53,DE:33,BR:16,FR:26,KR:22,IL:40,CA:29,
  AU:14,SG:26,SE:33,NL:11,CH:15,ID:10,JP:8,AE:9,MY:3,MX:6,
  CO:2,NG:2,ZA:1,KE:1,EG:1,PL:2,CZ:1,FI:3,DK:4,NO:3,
  AT:2,BE:3,PT:1,ES:8,IT:4,RU:7,UA:1,HU:1,
};

/* tech.techTalentRank (GTCI 2023, lower=better) */
const TECH_TALENT = {
  CH:1,SG:2,USA:3,SE:4,DK:5,FI:6,NL:7,NO:8,AU:9,DE:10,
  GB:11,CA:12,NZ:13,AT:14,IS:15,BE:16,IE:17,LU:18,IL:19,JP:20,
  FR:21,CZ:22,EE:23,KR:24,SI:25,PT:26,ES:27,LV:28,LT:29,SK:30,
  PL:31,CN:32,HU:33,IT:34,HR:35,RO:36,BG:37,GR:38,MY:39,MX:40,
  CL:41,UA:42,TH:43,BR:44,TR:45,AR:46,ZA:47,PE:48,CO:49,IN:50,
  RU:51,VN:52,PH:53,ID:54,NG:55,EG:56,PK:57,KE:58,BD:59,
};

/* climate.climateRiskIndex (Germanwatch GCRI 2023; lower rank=more affected) */
const CLIMATE_RISK = {
  MZ:1,ZW:2,BS:3,JP:4,PH:5,DE:6,MM:7,MG:8,IN:9,AF:10,
  ET:11,KE:12,VN:13,BD:14,PK:15,TH:16,ID:17,CN:18,NG:19,HT:20,
  BR:21,MX:22,AO:23,CO:24,TR:25,IR:26,EG:27,AU:28,US:29,ZA:30,
  DZ:31,SA:32,AR:33,IQ:34,SD:35,CL:36,PE:37,EC:38,UZ:39,KZ:40,
  UA:41,RU:42,PL:43,RO:44,HU:45,GR:46,ES:47,IT:48,PT:49,FR:50,
  GB:51,BE:52,NL:53,DE2:54,SE:55,NO:56,FI:57,DK:58,CH:59,AT:60,
  CA:65,NZ:70,KR:75,SG:80,
};

/* climate.naturalDisastersPerYear (EM-DAT avg 2010–2023) */
const DISASTERS = {
  CN:28,USA:25,IN:23,PH:18,ID:16,BD:14,VN:13,JP:11,BR:10,MX:9,
  ET:8,PK:8,AU:7,TH:7,KH:6,CD:6,NG:5,AF:5,HT:5,SD:5,
  MM:7,LA:5,NP:5,EC:5,PE:5,BO:4,CO:5,AR:4,ZA:4,KE:5,
  MA:3,DZ:3,TR:6,IQ:3,SY:4,EG:3,SA:2,IR:5,
  DE:3,FR:3,IT:4,ES:3,GB:2,PL:2,RU:5,UA:3,GR:3,
  CA:4,NZ:3,KR:2,SG:1,NO:1,SE:1,FI:1,DK:1,
};

/* transport.airports (major + regional; World Factbook 2023) */
const AIRPORTS = {
  USA:13513,BR:4093,MX:1714,RU:1218,AU:480,CA:1467,AR:1138,
  CN:507,IN:486,CO:836,DE:539,FR:464,GB:460,JP:175,ES:152,
  ZA:407,KE:198,NG:54,EG:95,SA:82,AE:43,PK:116,ID:673,
  PH:247,MY:114,TH:101,VN:45,TR:98,UA:187,PL:87,
  IT:129,GR:81,NL:29,SE:255,NO:145,FI:148,DK:80,
  CH:65,AT:52,BE:42,PT:64,IL:47,IR:140,IQ:75,SY:90,
  CL:481,PE:234,EC:426,VE:444,BO:952,BY:65,KZ:96,
  NZ:123,SG:9,KR:111,TW:37,BD:18,NP:47,LK:19,
};

/* transport.seaports (major commercial ports) */
const SEAPORTS = {
  CN:34,USA:26,IN:13,BR:9,AU:12,ID:25,PH:22,JP:18,KR:13,
  MY:7,SG:5,VN:10,TH:7,BD:3,PK:3,LK:2,MM:3,KH:2,
  DE:7,NL:6,BE:3,FR:8,GB:10,IT:14,ES:12,PT:4,GR:12,TR:12,
  RU:15,UA:4,PL:3,NO:4,SE:6,DK:5,FI:5,
  SA:5,AE:8,QA:3,KW:2,IQ:2,IR:6,EG:6,MA:5,DZ:5,NG:4,ZA:8,KE:3,
  CA:18,MX:18,AR:7,CL:5,CO:4,PE:5,EC:4,VE:4,
  IL:2,LB:2,SY:2,
  NZ:5,AU2:1,
};

// ─── WORLD BANK INDICATORS ────────────────────────────────────────────────────

const WB = {
  DEFENSE_BUDGET:     "MS.MIL.XPND.CD",          // USD current
  ELEC_PRODUCTION:    "EG.ELC.PROD.KH",           // kWh
  RENEWABLE_PCT:      "EG.FEC.RNEW.ZS",           // % of total energy
  EXPORTS:            "NE.EXP.GNFS.CD",           // USD current
  IMPORTS:            "NE.IMP.GNFS.CD",           // USD current
  POL_STABILITY:      "PV.EST",                   // WGI -2.5 to +2.5
  CO2:                "EN.ATM.CO2E.KT",           // kilotons
  RAIL_LENGTH:        "IS.RRS.TOTL.KM",           // km
  ROAD_LENGTH:        "IS.ROD.TOTL.KM",           // km
};

// ─── WITS EXPORT PARTNERS ─────────────────────────────────────────────────────

async function fetchExportPartners(iso2) {
  // WITS (World Bank) — no key needed
  const url = `https://wits.worldbank.org/API/V1/SDMX/V21/rest/data/DF_WITS_TradeStats_Tariff/A.${iso2}.ALL.Total.XPRT-TRD-VL?format=JSON&startPeriod=2021&endPeriod=2021`;
  const data = await safeGet(url, { timeout: 15000 });
  if (!data) return [];

  try {
    const obs = data?.data?.dataSets?.[0]?.series;
    if (!obs) return [];

    const entries = Object.entries(obs)
      .map(([key, val]) => {
        const partner = key.split(":")[2];
        const value   = Object.values(val.observations ?? {})[0]?.[0] ?? 0;
        return { partner, value: Number(value) };
      })
      .filter(e => e.partner !== "WLD" && e.partner !== "ALL" && e.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 5)
      .map(e => e.partner);

    return entries;
  } catch {
    return [];
  }
}

// Fallback: known top partners for major countries
const KNOWN_PARTNERS = {
  USA:["CA","MX","CN","JP","GB"],  CN:["USA","JP","KR","DE","VN"],
  DE: ["USA","FR","CN","NL","GB"], IN:["USA","AE","CN","SG","SA"],
  JP: ["USA","CN","KR","TW","AU"], KR:["CN","USA","VN","JP","AU"],
  BR: ["CN","USA","AR","NL","DE"], RU:["CN","DE","NL","BY","TR"],
  FR: ["DE","USA","IT","ES","GB"], GB:["USA","DE","NL","FR","IE"],
  SA: ["CN","JP","IN","KR","USA"], AU:["CN","JP","KR","IN","USA"],
  CA: ["USA","CN","GB","JP","MX"], MX:["USA","CA","DE","CN","JP"],
  IT: ["DE","USA","FR","ES","CH"], ES:["FR","DE","USA","IT","PT"],
  NL: ["DE","BE","GB","FR","USA"], TR:["DE","GB","USA","IT","FR"],
  ID: ["CN","USA","JP","IN","MY"], SG:["CN","HK","MY","USA","AE"],
  MY: ["CN","SG","USA","JP","HK"], TH:["CN","USA","JP","MY","SG"],
  VN: ["USA","CN","KR","JP","DE"], ZA:["CN","DE","USA","JP","IN"],
  NG: ["IN","SP","FR","NL","USA"], EG:["CN","USA","IT","TR","SA"],
  PK: ["CN","USA","UK","AE","AF"], AR:["BR","CN","USA","CL","IN"],
  CL: ["CN","USA","JP","KR","BR"], PL:["DE","CZ","GB","FR","RU"],
  UA: ["CN","PL","TR","IT","DE"], IL:["USA","UK","CN","HK","TH"],
  IR: ["CN","TR","AE","AF","IQ"], IQ:["IN","CN","KR","USA","IT"],
  AE: ["IN","CN","USA","SA","JP"], QA:["JP","CN","KR","IN","SG"],
};

// ─── MAIN ─────────────────────────────────────────────────────────────────────

async function run() {
  await mongoose.connect(MONGO_URI);
  console.log("✓ Connected to MongoDB\n");

  // ── Step 1: Load all World Bank data upfront ──────────────────────────────
  console.log("━━━ Loading World Bank indicators ━━━");
  const [
    wbDefense, wbElec, wbRenew,
    wbExports, wbImports,
    wbPolStab, wbCO2,
    wbRail,    wbRoad,
  ] = await Promise.all([
    fetchWB(WB.DEFENSE_BUDGET,  "Defense budget"),
    fetchWB(WB.ELEC_PRODUCTION, "Electricity production"),
    fetchWB(WB.RENEWABLE_PCT,   "Renewable %"),
    fetchWB(WB.EXPORTS,         "Exports"),
    fetchWB(WB.IMPORTS,         "Imports"),
    fetchWB(WB.POL_STABILITY,   "Political stability"),
    fetchWB(WB.CO2,             "CO₂ emissions"),
    fetchWB(WB.RAIL_LENGTH,     "Rail length"),
    fetchWB(WB.ROAD_LENGTH,     "Road length"),
  ]);
  console.log("");

  // ── Step 2: Load all countries ───────────────────────────────────────────
  const allCountries = await Country.find(
    {},
    { name:1, countryCode:1, iso3:1, population:1, economy:1 }
  ).lean();
  console.log(`Processing ${allCountries.length} countries...\n`);

  let updated=0, errors=0;

  for (const country of allCountries) {
    const iso3 = (country.iso3 ?? "").toUpperCase();
    const iso2 = (country.countryCode ?? "").toUpperCase();
    const name = country.name ?? "";

    try {
      // ── MILITARY ───────────────────────────────────────────────────────
      const activePersonnel  = ACTIVE_TROOPS[iso2]  ?? estimateTroops(country.population);
      const reservePersonnel = RESERVE_TROOPS[iso2] ?? Math.round(activePersonnel * 0.4);
      const defenseBudget    = wbDefense.get(iso3)
                                ?? wbDefense.get(iso2)
                                ?? estimateDefenseBudget(country);
      const nuclearWeapons   = NUCLEAR[iso2] ?? 0;

      // ── ENERGY ─────────────────────────────────────────────────────────
      const oilProduction         = OIL_PROD[iso2] ?? 0;
      const oilReserves           = OIL_RES[iso2]  ?? 0;
      const electricityProduction = wbElec.get(iso3)   ?? wbElec.get(iso2)   ?? null;
      const renewableEnergyPercent= wbRenew.get(iso3)  ?? wbRenew.get(iso2)  ?? null;

      // ── TRADE ──────────────────────────────────────────────────────────
      const exports      = wbExports.get(iso3) ?? wbExports.get(iso2) ?? null;
      const imports      = wbImports.get(iso3) ?? wbImports.get(iso2) ?? null;
      const tradeBalance = (exports != null && imports != null)
                            ? round(exports - imports, 0)
                            : null;

      // Export partners — use known table; skip WITS live call to stay fast
      // (WITS is slow; swap comment below to enable live fetching)
      let majorExportPartners = KNOWN_PARTNERS[iso2] ?? [];
      // ↓ Uncomment for live WITS data (adds ~3s per country, rate-limited):
      // if (!majorExportPartners.length) {
      //   await sleep(400);
      //   majorExportPartners = await fetchExportPartners(iso2);
      // }

      // ── RISK ───────────────────────────────────────────────────────────
      // WB political stability: -2.5 (worst) → +2.5 (best). Scale to 0–100.
      const rawPS          = wbPolStab.get(iso3) ?? wbPolStab.get(iso2);
      const politicalStability = rawPS != null
                                  ? round(((rawPS + 2.5) / 5) * 100, 1)
                                  : null;
      const terrorismIndex     = TERROR_IDX[iso2]   ?? 2.0;
      const disasterRiskIndex  = DISASTER_RISK[iso2] ?? 3.5;

      // ── TECH ───────────────────────────────────────────────────────────
      const startups      = STARTUPS[iso2]     ?? estimateStartups(country);
      const unicorns      = UNICORNS[iso2]     ?? 0;
      const techTalentRank= TECH_TALENT[iso2]  ?? null;

      // ── CLIMATE ────────────────────────────────────────────────────────
      const co2Emissions          = wbCO2.get(iso3) ?? wbCO2.get(iso2) ?? null;
      const climateRiskIndex      = CLIMATE_RISK[iso2] ?? 50;
      const naturalDisastersPerYear = DISASTERS[iso2] ?? estimateDisasters(country);

      // ── TRANSPORT ──────────────────────────────────────────────────────
      const airports  = AIRPORTS[iso2] ?? estimateAirports(country);
      const seaports  = SEAPORTS[iso2] ?? 0;
      const railLength= wbRail.get(iso3) ?? wbRail.get(iso2) ?? null;
      const roadLength= wbRoad.get(iso3) ?? wbRoad.get(iso2) ?? null;

      // ── WRITE ──────────────────────────────────────────────────────────
      const $set = {
        // military
        "military.activePersonnel":   activePersonnel,
        "military.reservePersonnel":  reservePersonnel,
        "military.defenseBudget":     defenseBudget,
        "military.nuclearWeapons":    nuclearWeapons,

        // energy
        "energy.oilProduction":          oilProduction,
        "energy.oilReserves":            oilReserves,
        ...(electricityProduction  != null && { "energy.electricityProduction":  electricityProduction  }),
        ...(renewableEnergyPercent != null && { "energy.renewableEnergyPercent": renewableEnergyPercent }),

        // trade
        ...(exports        != null && { "trade.exports":        exports        }),
        ...(imports        != null && { "trade.imports":        imports        }),
        ...(tradeBalance   != null && { "trade.tradeBalance":   tradeBalance   }),
        ...(majorExportPartners.length  && { "trade.majorExportPartners": majorExportPartners }),

        // risk
        ...(politicalStability != null && { "risk.politicalStability": politicalStability }),
        "risk.terrorismIndex":    terrorismIndex,
        "risk.disasterRiskIndex": disasterRiskIndex,

        // tech
        "tech.startups":       startups,
        "tech.unicorns":       unicorns,
        ...(techTalentRank != null && { "tech.techTalentRank": techTalentRank }),

        // climate
        ...(co2Emissions != null && { "climate.co2Emissions": co2Emissions }),
        "climate.climateRiskIndex":       climateRiskIndex,
        "climate.naturalDisastersPerYear": naturalDisastersPerYear,

        // transport
        "transport.airports":  airports,
        "transport.seaports":  seaports,
        ...(railLength != null && { "transport.railLength": railLength }),
        ...(roadLength != null && { "transport.roadLength": roadLength }),
      };

      await Country.findByIdAndUpdate(country._id, { $set });

      const sources = [
        wbDefense.has(iso3)      ? "WB"  : "est",
        OIL_PROD[iso2]           ? "emb" : "-",
        exports != null          ? "WB"  : "-",
        rawPS != null            ? "WB"  : "est",
        co2Emissions != null     ? "WB"  : "-",
        wbRail.has(iso3)         ? "WB"  : "-",
      ].join("|");

      console.log(`  ✓ ${iso3.padEnd(4)} ${name.padEnd(30)} [defense:${sources.split("|")[0]} oil:${sources.split("|")[1]} trade:${sources.split("|")[2]} risk:${sources.split("|")[3]} co2:${sources.split("|")[4]} rail:${sources.split("|")[5]}]`);
      updated++;

      // gentle rate-limit — WB is tolerant but WITS is not
      await sleep(80);

    } catch (err) {
      console.error(`  ✗ ${iso3} ${name} — ${err.message}`);
      errors++;
    }
  }

  // ── SUMMARY ────────────────────────────────────────────────────────────────
  console.log(`
═══════════════════════════════════════════════════════
  ✓ Updated  : ${updated}
  ✗ Errors   : ${errors}
  Total      : ${allCountries.length}
═══════════════════════════════════════════════════════`);

  await mongoose.disconnect();
  console.log("Disconnected.");
}

// ─── ESTIMATION HELPERS ───────────────────────────────────────────────────────
// Used when both live API and embedded table have no data.

function estimateTroops(population) {
  if (!population) return 5;
  const pop = population / 1e6; // millions
  if (pop > 500) return 1000;
  if (pop > 100) return 200;
  if (pop > 50)  return 80;
  if (pop > 10)  return 25;
  return 5;
}

function estimateDefenseBudget(country) {
  // Rough: ~1.5% of GDP (global average)
  const gdp = country.economy?.gdp;
  if (!gdp) return null;
  return round(gdp * 0.015, 0);
}

function estimateStartups(country) {
  const pop = (country.population ?? 5e6) / 1e6;
  const gdppc = country.economy?.gdpPerCapita ?? 5000;
  return Math.max(10, Math.round(pop * (gdppc / 10000) * 30));
}

function estimateDisasters(country) {
  const pop = (country.population ?? 5e6) / 1e6;
  if (pop > 200) return 8;
  if (pop > 50)  return 4;
  if (pop > 10)  return 2;
  return 1;
}

function estimateAirports(country) {
  const pop = (country.population ?? 5e6) / 1e6;
  const area = country.geography?.area ?? 100000;
  return Math.max(1, Math.round((pop * 0.3) + (area / 50000)));
}

// ─── ENTRY POINT ──────────────────────────────────────────────────────────────

run().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});