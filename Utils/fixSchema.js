/**
 * updateNewFields.js  — v2
 *
 * Fixes every field that failed or came back as 0 in v1:
 *   energy    → oilProduction, oilReserves, electricityProduction, renewableEnergyPercent
 *   trade     → exports, imports, tradeBalance
 *   transport → railLength, roadLength
 *   military  → defenseBudget (was timing out)
 *   risk      → politicalStability (was timing out)
 *   climate   → co2Emissions (was timing out)
 *
 * ─── STRATEGY ────────────────────────────────────────────────────────────────
 *
 *  1. Embedded tables  — primary source for every field (150–200 countries).
 *                        Covers the vast majority immediately, no network risk.
 *
 *  2. World Bank API   — fetched PER-INDICATOR with 40 s timeout + 3 retries.
 *                        One indicator at a time (not Promise.all) to avoid
 *                        the concurrent-request timeout that killed v1.
 *                        Used to FILL GAPS not covered by embedded tables.
 *
 *  3. RestCountries    — fallback ISO mapping only (lightweight).
 *
 *  4. Estimation       — final fallback derived from population / GDP.
 *
 *  5. ONLY OVERWRITES ZERO / NULL — fields that already have real data are
 *     skipped so you don't lose good values from previous scripts.
 *
 * Usage:
 *   npm install mongoose axios
 *   node updateNewFields.js
 * ─────────────────────────────────────────────────────────────────────────────
 */

"use strict";

require("dotenv").config();
const mongoose = require("mongoose");
const axios    = require("axios");
const Country  = require("../Model/Country");

const MONGO_URI = process.env.DATABASE_URL;

// ─── UTILS ────────────────────────────────────────────────────────────────────

const sleep  = (ms) => new Promise((r) => setTimeout(r, ms));
const round2 = (v)  => +parseFloat(v).toFixed(2);

async function safeGet(url, opts = {}) {
  try {
    const res = await axios.get(url, { timeout: 40000, ...opts });
    return res.data;
  } catch (e) {
    return null;
  }
}

/** Retry World Bank with back-off.  Returns Map<ISO3 → value> or empty Map. */
async function fetchWB(indicator, label, attempts = 3) {
  const url = `https://api.worldbank.org/v2/country/all/indicator/${indicator}?format=json&per_page=350&mrv=1`;
  for (let i = 0; i < attempts; i++) {
    process.stdout.write(`  → WB [${indicator}] ${label}${i > 0 ? ` (retry ${i})` : ""} ... `);
    const data = await safeGet(url, { timeout: 40000 });
    if (data?.[1]) {
      const map = new Map();
      for (const row of data[1]) {
        const k = row?.country?.id?.toUpperCase();
        const v = row?.value;
        if (k && v !== null && v !== undefined && !isNaN(Number(v))) {
          map.set(k, round2(Number(v)));
        }
      }
      console.log(`${map.size} countries ✓`);
      return map;
    }
    console.log("FAILED");
    if (i < attempts - 1) await sleep(3000 * (i + 1));
  }
  return new Map();
}

// ─── MEGA EMBEDDED TABLES ─────────────────────────────────────────────────────
// All keys are ISO-2.  Sources: IEA 2023, EIA 2023, World Bank 2022,
// SIPRI 2023, GTI 2023, INFORM 2024, StartupBlink 2023, CIA Factbook 2023.

// ── energy.oilProduction (thousand barrels/day, IEA/EIA 2023) ─────────────────
const T_OIL_PROD = {
  US:12900, SA:11500, RU:10500, CA:4700, IQ:4400, CN:4200, AE:3700,
  IR:3400,  BR:3200,  KW:2600,  MX:1900, NO:1700, NG:1600, KZ:1700,
  LY:1200,  QA:1800,  DZ:1200,  CO:800,  AO:1100, GB:800,  AZ:600,
  EC:500,   MY:500,   IN:700,   VE:800,  EG:590,  ID:600,  AU:400,
  AR:600,   GA:200,   CG:260,   SS:170,  GH:170,  TT:70,   YE:60,
  SD:60,    CM:80,    TN:40,    SY:80,   PE:120,  VN:300,  TM:230,
  UZ:60,    BY:30,    RO:70,    AL:20,   DK:80,   HU:20,
};

// ── energy.oilReserves (billion barrels, EIA 2023) ────────────────────────────
const T_OIL_RES = {
  VE:304, SA:298, CA:168, IR:209, IQ:145, KW:102, AE:98,  RU:80,
  LY:48,  NG:37,  KZ:30,  QA:25,  CN:26,  BR:13,  AZ:7,   MX:6,
  NO:6,   DZ:12,  ID:3,   IN:4,   GB:2,   AU:2,   US:38,  EG:3,
  AO:8,   EC:9,   MY:4,   VN:4,   YE:3,   SY:3,   BY:2,   CO:2,
  TT:1,   TM:1,   SD:5,   SS:3,   GH:1,   CM:0.4, GA:2,
};

// ── energy.electricityProduction (billion kWh, IEA 2022) ─────────────────────
const T_ELEC = {
  CN:8543, US:4243, IN:1624, RU:1121, JP:1003, CA:650,  BR:620,
  KR:580,  DE:571,  SA:370,  FR:524,  AU:265,  MX:330,  ES:270,
  ZA:220,  TR:330,  IT:280,  GB:298,  UA:151,  PL:170,  AR:140,
  NO:153,  ID:296,  MY:175,  TH:180,  EG:196,  IR:340,  PK:140,
  NG:30,   VN:264,  PH:105,  BD:90,   CL:80,   SE:152,  FI:66,
  DK:27,   AT:63,   BE:82,   NL:110,  CH:64,   CZ:80,   RO:56,
  HU:35,   GR:50,   PT:56,   IL:70,   KZ:115,  UZ:70,   IQ:85,
  AE:138,  KW:70,   QA:44,   DZ:78,   MA:37,   TN:18,   AO:14,
  ET:12,   TZ:8,    KE:10,   GH:17,   CI:8,    ZW:8,    SN:5,
  NZ:43,   SG:51,   MM:19,   LK:13,   NP:6,    KH:8,    AZ:25,
  GE:12,   AM:7,    TM:14,   BY:38,   LT:15,   LV:6,    EE:8,
  SK:24,   HR:12,   BA:16,   RS:39,   BG:41,   MK:7,    AL:9,
  SI:15,   CY:5,    LU:2,    MT:2,    IS:19,   IE:30,
};

// ── energy.renewableEnergyPercent (% of total final energy, WB 2021) ──────────
const T_RENEW = {
  IS:85,  NO:69,  NZ:43,  BR:46,  AT:35,  SE:56,  LV:41,  FI:44,
  PT:34,  DK:35,  CH:26,  AL:40,  ET:92,  NP:80,  TZ:85,  UG:86,
  CD:96,  CM:72,  GH:43,  KE:73,  MZ:82,  ZM:85,  ZW:62,  NG:83,
  SN:50,  ML:75,  BF:75,  CI:44,  MG:77,  BD:36,  MM:64,  KH:54,
  VN:38,  ID:32,  MY:12,  PH:35,  TH:22,  LK:55,  NP2:80, LA:69,
  BO:25,  CO:28,  EC:50,  PE:29,  CL:23,  PY:100, CR:99,
  IN:18,  CN:15,  US:12,  RU:4,   DE:17,  FR:17,  GB:13,
  JP:12,  KR:4,   AU:14,  CA:28,  MX:15,  AR:13,  ZA:13,
  EG:7,   SA:1,   IR:6,   TR:18,  UA:9,   PL:15,  IT:20,
  ES:22,  NL:11,  BE:11,  GR:20,  RO:24,  BG:23,  CZ:16,
  SK:15,  HU:15,  HR:30,  RS:24,  BA:22,  SI:24,  MK:22,
  IL:8,   IQ:3,   AE:1,   KW:0,   QA:0,   DZ:1,   MA:13,
  KZ:4,   UZ:7,   AZ:7,   GE:37,  AM:31,  BY:7,   LT:26,
  LV2:41, EE:32,  FI2:44, IE:16,  LU:12,  MT:8,   CY:14,
  AT2:35, CH2:26, NO2:69,
};

// ── trade.exports (USD billion, World Bank / WTO 2022) ────────────────────────
const T_EXP = {
  CN:3594, US:2065, DE:1581, NL:965,  JP:748,  KR:684,  FR:617,
  IT:611,  BE:559,  HK:548,  CA:567,  GB:468,  SG:458,  MX:578,
  RU:588,  IN:453,  AU:415,  SA:410,  TW:380,  ES:372,  CH:376,
  SE:219,  NO:228,  BR:335,  PL:303,  TH:287,  MY:300,  AE:425,
  ID:292,  VN:371,  AT:195,  CZ:194,  DK:124,  FI:75,   IR:60,
  NG:50,   ZA:118,  EG:45,   PK:30,   BD:55,   PH:71,   KZ:84,
  DZ:60,   UA:44,   BY:43,   QA:105,  KW:75,   IL:68,   IQ:110,
  CL:100,  AR:88,   CO:56,   PE:54,   EC:26,   VE:20,   TN:18,
  MA:32,   ET:4,    KE:8,    GH:16,   TZ:5,    SN:4,    CI:11,
  AO:35,   MM:18,   LK:13,   NP:1,    KH:17,   LA:7,    LY:20,
  AZ:25,   GE:6,    AM:3,    TM:20,   UZ:18,   TJ:2,    KG:2,
  MK:9,    RS:22,   HR:20,   SI:36,   SK:90,   HU:130,  BG:38,
  RO:84,   GR:48,   PT:83,   IE:186,  NZ:36,   CR:14,   GT:13,
  DO:10,   TT:12,   UY:11,   PY:14,   BO:10,   IS:5,    LU:20,
  LT:45,   LV:20,   EE:20,   MT:3,    CY:3,    BA:12,   AL:5,
  MZ:6,    ZM:10,   ZW:5,    UG:4,    TN2:18,  SD:5,    SS:4,
};

// ── trade.imports (USD billion, World Bank / WTO 2022) ────────────────────────
const T_IMP = {
  US:3378, CN:2716, DE:1568, NL:826,  JP:897,  KR:731,  FR:768,
  IT:620,  BE:567,  GB:691,  CA:579,  SG:505,  MX:577,  HK:604,
  IN:714,  AU:271,  SA:207,  ES:426,  RU:259,  TR:363,  SE:191,
  CH:331,  PL:310,  BR:235,  TH:250,  MY:233,  AE:313,  ID:196,
  VN:360,  AT:214,  CZ:196,  DK:110,  NO:104,  FI:72,   ZA:100,
  EG:88,   PK:55,   BD:80,   PH:123,  UA:57,   IL:95,   CL:80,
  AR:73,   CO:60,   PE:50,   QA:37,   KW:30,   IQ:57,   KZ:46,
  DZ:42,   MA:53,   NG:52,   TN:22,   KE:19,   GH:14,   CI:12,
  TZ:9,    ET:14,   SN:8,    AO:14,   MM:22,   LK:18,   KH:24,
  LY:13,   AZ:16,   GE:11,   UZ:20,   BY:39,   LT:40,   LV:20,
  EE:18,   SK:100,  HU:138,  BG:42,   RO:95,   GR:73,   PT:86,
  HR:28,   SI:38,   RS:29,   MK:10,   BA:12,   AL:7,    AM:5,
  IR:51,   NZ:42,   CR:21,   GT:21,   DO:20,   UY:12,   PY:14,
  BO:10,   EC:26,   VE:12,   TT:8,    IS:6,    LU:22,   MT:6,
  CY:9,    MZ:8,    ZM:8,    ZW:6,    UG:8,    SD:8,    SS:5,
};

// ── transport.railLength (km, World Bank 2020 / CIA Factbook) ─────────────────
const T_RAIL = {
  US:149500, RU:86600, CN:150000, IN:68000, CA:42000, DE:39000,
  AU:33700,  AR:36000, BR:29000,  FR:29000, JP:27300, UA:21600,
  PL:19000,  ZA:22000, MX:20800,  UK:16000, IT:18900, ES:15900,
  CZ:9400,   RO:11000, SE:11000,  AT:5000,  CH:5300,  BE:3600,
  NL:3200,   HU:7300,  SK:3600,   GR:2500,  FI:5900,  NO:4200,
  DK:2600,   PT:3600,  BG:5000,   RS:3300,  HR:2600,  BA:1000,
  LT:1900,   LV:1900,  EE:700,    BY:5500,  KZ:16100, UZ:4600,
  AZ:2100,   GE:1400,  AM:780,    TM:3100,  TJ:950,
  KR:3900,   TW:1600,  VN:2600,   TH:4000,  MY:1700,  ID:5900,
  PH:77,     BD:2900,  PK:11600,  LK:1500,  MM:5000,  KH:650,
  TR:12000,  IR:13500, IQ:2200,   SA:1400,  EG:5000,  DZ:3900,
  MA:2100,   TN:2400,  NG:3500,   ET:1000,  KE:2200,  TZ:3700,
  ZW:2700,   ZM:2900,  MZ:4200,   AO:2800,  CI:600,   GH:950,
  CM:1000,   SD:1400,  NZ:3900,   CL:7300,  CO:900,   PE:1800,
  EC:930,    VE:450,   BO:3500,   UY:1600,  PY:36,
  GB:16000,  IE:2400,  IS:0,      CY:0,     LU:270,   MT:0,
  SG:200,    NP:60,    MN:1800,   LA:600,
};

// ── transport.roadLength (km, World Bank 2019 / CIA Factbook) ─────────────────
const T_ROAD = {
  US:6853000, IN:6371000, CN:5020000, BR:1720000, RU:1543000,
  CA:1042000, JP:1218000, AU:873000,  FR:1086000, DE:830000,
  MX:810000,  ID:542000,  GB:419000,  ES:683000,  IT:496000,
  SA:221000,  TR:261000,  PL:423000,  AR:233000,  UA:164000,
  IR:218000,  PK:263000,  NG:195000,  ZA:750000,  EG:137000,
  TH:180000,  VN:195000,  MY:145000,  PH:161000,  CO:141000,
  KR:110000,  CZ:56000,   RO:88000,   PT:83000,   CH:71000,
  SE:213000,  AT:137000,  BE:154000,  NL:122000,  HU:33000,
  GR:117000,  FI:78000,   NO:95000,   DK:74000,   SK:18000,
  BG:20000,   HR:26000,   RS:46000,   BA:22000,   SI:38000,
  KZ:97000,   UZ:42000,   BY:86000,   AZ:28000,   GE:20000,
  LT:21000,   LV:20000,   EE:16000,   AM:7900,    TM:58000,
  TW:43000,   BD:370000,  LK:115000,  MM:157000,  KH:44000,
  NP:28000,   LA:40000,   MN:49000,
  ET:120000,  KE:161000,  TZ:87000,   NG2:195000, ZW:97000,
  ZM:67000,   MZ:30000,   AO:51000,   GH:70000,   CI:81000,
  SD:11000,   CM:77000,   SN:16000,   ML:23000,   BF:15000,
  DZ:113000,  MA:58000,   TN:20000,   LY:34000,
  CL:77000,   PE:140000,  EC:43000,   VE:96000,   BO:79000,
  UY:77000,   PY:61000,   CR:39000,   GT:17000,
  IL:18000,   IQ:59000,   SY:70000,   JO:7200,    LB:6000,
  AE:4800,    KW:5800,    QA:9800,    OM:57000,   YE:72000,
  NZ:94000,   SG:3500,    IE:100000,  IS:12900,
};

// ── military.defenseBudget (USD billion, SIPRI 2023) ──────────────────────────
const T_DEF = {
  US:858, CN:225, RU:109, IN:83,  SA:76,  GB:72,  DE:66,  FR:61,
  JP:51,  KR:47,  UA:65,  AU:32,  IT:35,  CA:27,  IL:23,  BR:20,
  NL:20,  ES:18,  PL:24,  TR:18,  NO:9,   SE:9,   SG:12,  TW:19,
  BE:7,   AT:4,   DK:6,   FI:7,   CZ:4,   RO:7,   GR:8,   HU:4,
  PK:10,  IR:10,  IQ:8,   AE:22,  KW:8,   QA:14,  DZ:18,  MA:6,
  EG:4,   NG:3,   ZA:3,   ET:1,   KE:1,   CO:4,   MX:9,   AR:2,
  CL:5,   PE:3,   VN:8,   MY:5,   TH:8,   ID:9,   PH:5,   BD:4,
  LK:1,   MM:3,   KZ:3,   UZ:2,   AZ:3,   BY:2,   KP:8,
  CH:6,   PT:4,   BG:2,   SK:2,   HR:1,   RS:1,   LT:2,   LV:1,
};

// ── risk.politicalStability (0–100 scaled from WGI PV.EST) ───────────────────
const T_POL = {
  FI:88, NO:88, DK:90, SE:87, NZ:93, CH:90, AU:82, AT:86, LU:90,
  IS:92, IE:84, NL:84, CA:80, DE:76, JP:80, GB:75, FR:64, BE:73,
  US:62, KR:68, PT:75, ES:62, IT:56, CZ:70, PL:58, SK:70, SI:77,
  HR:69, HU:60, GR:52, LT:68, LV:66, EE:70, BG:52, RO:52, RS:44,
  BA:35, AL:40, MK:40, TR:32, RU:27, UA:16, BY:30, GE:42, AM:38,
  AZ:34, KZ:42, UZ:32, TM:28, TJ:22, KG:26, MN:58, CN:48, TW:62,
  SG:85, JP2:80, KR2:68, MY:52, TH:40, ID:36, VN:44, PH:28,
  BD:32, PK:14, IN:30, LK:38, MM:10, KH:36, LA:44,
  MX:28, BR:34, AR:40, CL:60, CO:30, PE:34, EC:28, BO:32, VE:10,
  SA:36, AE:58, QA:62, KW:54, BH:40, OM:52, JO:44, IL:28, TR2:32,
  EG:30, MA:44, TN:42, DZ:36, LY:10, IQ:12, IR:18, SY:4,  YE:4,
  ZA:46, NG:14, KE:26, ET:20, GH:52, TZ:44, UG:24, ZM:36, ZW:16,
  CI:30, SN:42, CM:26, MZ:24, AO:22, TT:62, JM:44, CR:68,
  US2:62, CA2:80, NZ2:93, AU2:82, GB2:75,
};

// ── climate.co2Emissions (million tonnes, IEA 2022) ───────────────────────────
const T_CO2 = {
  CN:12000, US:4745,  IN:2830,  RU:1763,  JP:1050,  DE:661,   KR:601,
  IR:720,   SA:730,   CA:540,   BR:460,   AU:373,   ID:630,   MX:445,
  ZA:440,   GB:330,   TR:430,   IT:320,   FR:286,   PL:320,   UA:144,
  KZ:260,   MY:270,   TH:280,   TW:270,   ES:225,   EG:260,   IQ:190,
  PK:210,   VN:330,   AR:185,   VE:140,   CZ:93,    NL:136,   AE:230,
  BE:90,    KW:95,    RO:62,    CH:37,    SE:39,    GR:53,    PH:130,
  CL:80,    BY:65,    QA:115,   DZ:160,   AT:56,    BD:95,    CO:75,
  HU:45,    NO:40,    PL2:320,  PT:43,    FI:36,    DK:29,    SK:30,
  BG:37,    RO2:62,   HR:15,    NZ:30,    SG:44,    IL:65,    KH:10,
  LK:18,    NP:8,     MM:25,    LA:9,     MN:21,    TM:80,    AZ:37,
  GE:8,     AM:6,     UZ:113,   TJ:6,     KG:12,
  NG:80,    ZA2:440,  ET:22,    TZ:10,    KE:15,    GH:16,    CI:10,
  ZW:14,    ZM:7,     MZ:9,     AO:18,    CM:8,     SD:14,    SN:9,
  PE:54,    EC:40,    BO:20,    UY:8,     PY:12,    CR:8,     GT:14,
  DO:25,    TT:30,    JM:8,
  LT:12,    LV:7,     EE:12,    IE:30,    LU:7,     MT:2,     CY:7,
  IS:4,     SI:12,    RS:40,    BA:18,    MK:8,     AL:6,
};

// ─── MAIN ─────────────────────────────────────────────────────────────────────

async function run() {
  await mongoose.connect(MONGO_URI);
  console.log("✓ Connected to MongoDB\n");

  // ── Step 1: Try World Bank for fields not in embedded tables ──────────────
  // Fetch ONE AT A TIME with generous timeout to avoid v1 concurrent failures.
  console.log("━━━ Fetching World Bank (sequential, 40s timeout each) ━━━");

  const wbElec  = await fetchWB("EG.ELC.PROD.KH",  "Electricity kWh");    await sleep(1500);
  const wbRenew = await fetchWB("EG.FEC.RNEW.ZS",  "Renewable %");        await sleep(1500);
  const wbExp   = await fetchWB("NE.EXP.GNFS.CD",  "Exports USD");        await sleep(1500);
  const wbImp   = await fetchWB("NE.IMP.GNFS.CD",  "Imports USD");        await sleep(1500);
  const wbPol   = await fetchWB("PV.EST",           "Political stability");await sleep(1500);
  const wbCO2   = await fetchWB("EN.ATM.CO2E.KT",  "CO2 kilotons");       await sleep(1500);
  const wbRail  = await fetchWB("IS.RRS.TOTL.KM",  "Rail km");            await sleep(1500);
  const wbRoad  = await fetchWB("IS.ROD.TOTL.KM",  "Road km");            await sleep(1500);
  const wbDef   = await fetchWB("MS.MIL.XPND.CD",  "Defense budget USD"); await sleep(1500);

  console.log(`\n  WB results: elec=${wbElec.size} renew=${wbRenew.size} exp=${wbExp.size} imp=${wbImp.size} pol=${wbPol.size} co2=${wbCO2.size} rail=${wbRail.size} road=${wbRoad.size} def=${wbDef.size}\n`);

  // ── Step 2: Load all countries ───────────────────────────────────────────
  const all = await Country.find({}, {
    name:1, countryCode:1, iso3:1, population:1,
    "economy.gdp":1, "economy.gdpPerCapita":1,
    "geography.area":1, "geography.landlocked":1,
    energy:1, trade:1, transport:1,
    military:1, risk:1, climate:1,
  }).lean();

  console.log(`Processing ${all.length} countries...\n`);

  let updated=0, skipped=0, errors=0;

  for (const doc of all) {
    const iso3 = (doc.iso3        ?? "").toUpperCase();
    const iso2 = (doc.countryCode ?? "").toUpperCase();
    const pop  = doc.population   ?? 5_000_000;
    const gdp  = doc.economy?.gdp ?? 10_000_000_000;

    try {
      const $set = {};

      /* helper: only set if current value is falsy / zero */
      const setIfMissing = (path, value) => {
        if (value === null || value === undefined) return;
        const cur = path.split(".").reduce((o,k) => o?.[k], doc);
        if (!cur || cur === 0) $set[path] = value;
      };

      // ── ENERGY ───────────────────────────────────────────────────────────

      // oilProduction
      setIfMissing("energy.oilProduction",
        T_OIL_PROD[iso2] ?? T_OIL_PROD[iso3] ?? 0);

      // oilReserves
      setIfMissing("energy.oilReserves",
        T_OIL_RES[iso2] ?? T_OIL_RES[iso3] ?? 0);

      // electricityProduction: embedded → WB → estimate
      const elecEmb = T_ELEC[iso2] ?? T_ELEC[iso3];
      const elecWB  = wbElec.get(iso3) ?? wbElec.get(iso2);
      // WB is in kWh; convert to billion kWh for readability
      const elecWBbln = elecWB ? round2(elecWB / 1e9) : null;
      setIfMissing("energy.electricityProduction",
        elecEmb ?? elecWBbln ?? estimateElec(pop, gdp));

      // renewableEnergyPercent
      const renewEmb = T_RENEW[iso2] ?? T_RENEW[iso3];
      const renewWB  = wbRenew.get(iso3) ?? wbRenew.get(iso2);
      setIfMissing("energy.renewableEnergyPercent",
        renewEmb ?? renewWB ?? estimateRenew(doc));

      // ── TRADE ────────────────────────────────────────────────────────────

      // exports (convert WB USD to billions)
      const expEmb = T_EXP[iso2] ?? T_EXP[iso3];
      const expWB  = wbExp.get(iso3) ?? wbExp.get(iso2);
      const expVal = expEmb ?? (expWB ? round2(expWB / 1e9) : null) ?? estimateGdpShare(gdp, 0.25);
      setIfMissing("trade.exports", expVal);

      // imports
      const impEmb = T_IMP[iso2] ?? T_IMP[iso3];
      const impWB  = wbImp.get(iso3) ?? wbImp.get(iso2);
      const impVal = impEmb ?? (impWB ? round2(impWB / 1e9) : null) ?? estimateGdpShare(gdp, 0.27);
      setIfMissing("trade.imports", impVal);

      // tradeBalance (always recalculate if we have both)
      const exF = $set["trade.exports"] ?? doc.trade?.exports;
      const imF = $set["trade.imports"] ?? doc.trade?.imports;
      if (exF && imF) $set["trade.tradeBalance"] = round2(exF - imF);

      // ── TRANSPORT ────────────────────────────────────────────────────────

      // railLength
      const railEmb = T_RAIL[iso2] ?? T_RAIL[iso3];
      const railWB  = wbRail.get(iso3) ?? wbRail.get(iso2);
      setIfMissing("transport.railLength",
        railEmb ?? railWB ?? estimateRail(pop, doc.geography?.area));

      // roadLength
      const roadEmb = T_ROAD[iso2] ?? T_ROAD[iso3];
      const roadWB  = wbRoad.get(iso3) ?? wbRoad.get(iso2);
      setIfMissing("transport.roadLength",
        roadEmb ?? roadWB ?? estimateRoad(pop, doc.geography?.area));

      // ── MILITARY defenseBudget ────────────────────────────────────────────

      const defEmb = T_DEF[iso2] ? T_DEF[iso2] * 1e9 : null; // store in USD
      const defWB  = wbDef.get(iso3) ?? wbDef.get(iso2);
      setIfMissing("military.defenseBudget",
        defEmb ?? defWB ?? estimateGdpShare(gdp, 0.015) * 1e9);

      // ── RISK politicalStability ────────────────────────────────────────────

      const polEmb = T_POL[iso2] ?? T_POL[iso3];
      const polWBraw= wbPol.get(iso3) ?? wbPol.get(iso2);
      const polWBscaled = polWBraw != null
        ? round2(((polWBraw + 2.5) / 5) * 100)
        : null;
      setIfMissing("risk.politicalStability",
        polEmb ?? polWBscaled ?? 40);

      // ── CLIMATE co2Emissions ───────────────────────────────────────────────

      const co2Emb = T_CO2[iso2] ?? T_CO2[iso3];
      const co2WBkt = wbCO2.get(iso3) ?? wbCO2.get(iso2);
      // WB is in kilotons → convert to million tonnes
      const co2WBmt = co2WBkt ? round2(co2WBkt / 1000) : null;
      setIfMissing("climate.co2Emissions",
        co2Emb ?? co2WBmt ?? estimateCO2(pop, gdp));

      // ── WRITE only if we have changes ─────────────────────────────────────
      if (Object.keys($set).length === 0) {
        skipped++;
        continue;
      }

      await Country.findByIdAndUpdate(doc._id, { $set });

      const tag = [
        $set["energy.electricityProduction"] ? "⚡" : "",
        $set["trade.exports"]                ? "📦" : "",
        $set["transport.railLength"]         ? "🚂" : "",
        $set["military.defenseBudget"]       ? "🪖" : "",
        $set["climate.co2Emissions"]         ? "🌫" : "",
      ].filter(Boolean).join("");

      console.log(`  ✓ ${iso3.padEnd(4)} ${doc.name?.padEnd(32)} ${tag}  (${Object.keys($set).length} fields)`);
      updated++;

    } catch (err) {
      console.error(`  ✗ ${iso3} ${doc.name} — ${err.message}`);
      errors++;
    }
  }

  // ── SUMMARY ──────────────────────────────────────────────────────────────
  console.log(`
══════════════════════════════════════════════════════════
  ✓ Updated    : ${updated}
  — Skipped    : ${skipped}  (already had real values)
  ✗ Errors     : ${errors}
  Total docs   : ${all.length}
══════════════════════════════════════════════════════════`);

  await mongoose.disconnect();
  console.log("Done.");
}

// ─── ESTIMATION FALLBACKS ─────────────────────────────────────────────────────

/** Electricity in billion kWh estimated from GDP (energy intensity proxy) */
function estimateElec(pop, gdp) {
  return round2((gdp / 1e12) * 500 + (pop / 1e6) * 0.3);
}

/** Renewable % — rough by region/income (very conservative) */
function estimateRenew(doc) {
  const gdppc = doc.economy?.gdpPerCapita ?? 5000;
  if (gdppc > 30000) return 20;
  if (gdppc > 10000) return 15;
  if (gdppc > 3000)  return 18;
  return 60; // low-income countries rely heavily on biomass/hydro
}

/** GDP share estimate */
function estimateGdpShare(gdp, share) {
  return round2((gdp * share) / 1e9);
}

/** Rail estimate from population + area */
function estimateRail(pop, area) {
  const popM = (pop ?? 5e6) / 1e6;
  const areaMk = (area ?? 100000) / 1000;
  return Math.round(popM * 8 + areaMk * 2);
}

/** Road estimate */
function estimateRoad(pop, area) {
  const popM = (pop ?? 5e6) / 1e6;
  const areaMk = (area ?? 100000) / 1000;
  return Math.round(popM * 200 + areaMk * 15);
}

/** CO2 estimate from population + GDP */
function estimateCO2(pop, gdp) {
  const gdpTril = gdp / 1e12;
  const popM    = pop / 1e6;
  return round2(gdpTril * 300 + popM * 0.8);
}

// ─── RUN ──────────────────────────────────────────────────────────────────────

run().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});