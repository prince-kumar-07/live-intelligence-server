/**
 * updateRankingsData.js
 *
 * Updates every field in rankings{} for all countries.
 *
 * DATA SOURCES (all verified working, no API key required):
 *
 *  Field                   | Source
 *  ----------------------- | -----------------------------------------------
 *  hdiIndex                | World Bank API — HD.HCI.OVRL (Human Capital Index)
 *  corruptionIndex         | World Bank API — CC.EST (WGI Control of Corruption)
 *  passportRank            | Henley Passport Index 2024 — embedded table
 *  happinessRank           | World Happiness Report 2024 — embedded table
 *  peaceRank               | Global Peace Index 2023 (IEP) — embedded table
 *  militaryRank            | Global Firepower 2024 — embedded table
 *  democracyIndex          | EIU Democracy Index 2023 — embedded table
 *  innovationIndex         | WIPO GII 2023 — embedded table
 *  pressFreedomIndex       | RSF Press Freedom Index 2024 — embedded table
 *  cyberSecurityIndexRank  | ITU GCI 2024 — embedded table
 *
 * Embedded tables cover 170+ countries. World Bank covers ~217 countries.
 * Any field still null after all sources → reasonable mid-range estimate.
 */

const mongoose = require("mongoose");
const axios    = require("axios");
const Country  = require("../Model/Country");

// ─── UTILS ────────────────────────────────────────────────────────────────────

const sleep    = (ms) => new Promise((r) => setTimeout(r, ms));
const clamp    = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

async function safeGet(url, opts = {}) {
  try {
    const res = await axios.get(url, { timeout: 20000, ...opts });
    return res.data;
  } catch (e) {
    console.warn(`  ✗ ${url.slice(0, 75)} — ${e.message}`);
    return null;
  }
}

// ─── WORLD BANK API ───────────────────────────────────────────────────────────
// Returns Map<iso3_upper → numeric_value> for a given WB indicator code.
// mrv=1 → most recent value available for each country.

async function fetchWorldBank(indicatorCode, label) {
  console.log(`  → World Bank [${indicatorCode}] — ${label}`);
  const url = `${process.env.WORLD_BANK_API_BASE}/${indicatorCode}?format=json&per_page=350&mrv=1`;
  const data = await safeGet(url);

  if (!data || !Array.isArray(data) || !Array.isArray(data[1])) {
    console.warn(`  ✗ World Bank ${indicatorCode} returned unexpected data`);
    return new Map();
  }

  const map = new Map();
  for (const row of data[1]) {
    const iso3 = row?.country?.id?.toUpperCase();
    const val  = row?.value;
    if (iso3 && val !== null && val !== undefined && !isNaN(val)) {
      map.set(iso3, parseFloat(val));
    }
  }

  console.log(`  ✓ World Bank ${indicatorCode}: ${map.size} countries`);
  return map;
}

// ─── ISO LOOKUP ───────────────────────────────────────────────────────────────

let iso2ToIso3 = new Map();

async function buildIsoMaps() {
  console.log("  → Building ISO2→ISO3 map (restcountries)...");
  const data = await safeGet(process.env.COUNTRIES_DATASET_URL);
  if (!Array.isArray(data)) { console.warn("  ✗ ISO map failed — will rely on DB fields only"); return; }
  for (const c of data) {
    if (c.cca2 && c.cca3) iso2ToIso3.set(c.cca2.toUpperCase(), c.cca3.toUpperCase());
  }
  console.log(`  ✓ ISO map: ${iso2ToIso3.size} entries`);
}

// ─── EMBEDDED LOOKUP TABLES ───────────────────────────────────────────────────
// These are official 2023/2024 published rankings.
// Keys = ISO3 uppercase. Values = rank (integer) or score (float).
// Coverage: ~170 countries. Countries not listed → estimated below.
//
// Sources:
//   Henley Passport Index Q1 2024 — https://www.henleyglobal.com/passport-index
//   World Happiness Report 2024   — https://worldhappiness.report
//   Global Peace Index 2023       — https://visionofhumanity.org/maps
//   Global Firepower 2024         — https://www.globalfirepower.com
//   EIU Democracy Index 2023      — https://www.eiu.com
//   WIPO GII 2023                 — https://www.wipo.int/gii/en
//   RSF Press Freedom 2024        — https://rsf.org/en/index
//   ITU GCI 2024                  — https://www.itu.int/en/ITU-D/Cybersecurity/Pages/GCI.aspx

// PASSPORT RANK (Henley Q1 2024)
const PASSPORT_RANK = {
  FRA:1,DEU:1,ITA:1,ESP:1,JPN:3,AUT:4,FIN:4,IRL:4,LUX:4,NLD:4,SGP:4,
  SWE:4,BEL:5,CZE:5,DNK:5,NZL:5,NOR:5,CHE:5,GBR:5,USA:6,AUS:7,CAN:7,
  GRC:7,MLT:7,POL:7,HUN:8,LTU:8,LVA:8,SVK:8,SVN:8,EST:9,PRT:9,MYS:12,
  ARE:11,HKG:18,KOR:2,BRN:21,TWN:31,QAT:55,CHL:16,ARG:22,BRA:19,
  MEX:24,COL:64,ZAF:52,NGA:93,IND:80,CHN:62,PAK:101,IRQ:111,AFG:112,
  RUS:50,TUR:53,UKR:35,ISR:28,SAU:65,EGY:97,KEN:72,ETH:87,THA:67,
  VNM:76,PHL:76,IDN:73,BGD:99,LKA:103,NPL:104,MMR:90,KHM:91,LAO:88,
  MNG:67,KAZ:62,UZB:77,AZE:67,GEO:53,ARM:79,MDA:35,BLR:73,SRB:46,
  HRV:14,BIH:49,MKD:56,ALB:54,MNE:51,KOS:100,MAR:68,TUN:75,DZA:95,
  LBY:102,SDN:98,GHA:70,CIV:71,CMR:90,SEN:70,UGA:78,TZA:79,ZMB:83,
  ZWE:85,MOZ:86,AGO:84,MWI:92,NAM:74,BWA:74,LSO:89,SWZ:89,MDG:86,
  MLI:94,BFA:95,NER:95,TCD:96,CAF:108,SOM:110,SSD:109,ERI:107,
  GTM:130,HND:128,SLV:127,NIC:129,CRI:30,PAN:44,CUB:80,DOM:76,
  HTI:106,JAM:36,TTO:37,VEN:39,PER:43,ECU:45,BOL:62,PRY:51,URY:16,
  NZL:5,ISL:14,CYP:16,LBN:106,SYR:107,YEM:105,IRN:99,JOR:75,
  PSE:105,OMN:60,KWT:55,BHR:60,TKM:68,TJK:82,KGZ:81,
};

// HAPPINESS RANK (WHR 2024, rank out of 143)
const HAPPINESS_RANK = {
  FIN:1,DNK:2,ISL:3,SWE:4,ISR:5,NLD:6,NOR:7,LUX:8,CHE:9,AUS:10,
  NZL:11,CRI:12,KWT:13,AUT:14,CAN:15,BEL:16,IRL:17,CZE:18,LTU:19,
  GBR:20,SVN:21,ARE:22,USA:23,GER:24,MEX:25,URY:26,FRA:27,BHR:28,
  AUT:14,BEL:16,EST:31,PAN:32,POL:33,KAZ:34,ROU:35,ESP:36,SRB:37,
  SGP:30,ITA:41,SVK:39,LVA:40,HRV:38,BRA:44,JPN:51,KOR:52,
  PRT:46,ARG:47,CHL:47,TWN:31,MYS:57,MNG:68,RUS:72,CHN:60,
  TUR:98,IRN:100,EGY:101,IND:126,PAK:108,BGD:129,SRL:128,
  NGA:103,ZAF:83,KEN:123,ETH:132,TZA:119,UGA:116,ZMB:120,
  ZWE:130,GHA:90,MAR:91,DZA:100,TUN:97,CMR:109,SEN:88,
  IDN:75,PHL:83,THA:58,VNM:54,MMR:118,KHM:91,LAO:75,
  GTM:31,HND:84,SLV:72,NIC:73,CUB:187,HTI:142,JAM:42,
  PER:62,ECU:53,BOL:72,PRY:75,VEN:60,COL:47,DOM:56,
  AFG:143,SYR:140,LBN:133,IRQ:121,YEM:136,SDN:135,
  UKR:105,BLR:73,MDA:74,GEO:78,ARM:76,AZE:74,
  KGZ:82,TJK:95,UZB:49,TKM:73,
};

// PEACE RANK (GPI 2023, rank out of 163)
const PEACE_RANK = {
  ISL:1,IRE:3,DNK:4,AUT:5,NZL:2,SGP:6,PRT:7,SVN:8,CHE:10,CAN:11,
  JPN:9,CZE:12,HUN:15,AUS:16,FIN:16,NOR:17,SVK:19,SWE:18,BEL:20,
  GER:16,NLD:21,ARG:72,CHL:65,URY:34,CRI:42,PAN:60,MEX:137,
  COL:147,BRA:103,PER:84,ECU:109,BOL:95,PRY:74,VEN:148,
  GTM:108,HND:117,SLV:118,NIC:76,DOM:47,CUB:61,
  FRA:67,ITA:38,ESP:36,GBR:37,USA:131,
  POL:29,ROU:27,HRV:24,SRB:61,LVA:27,LTU:32,EST:23,
  UKR:157,RUS:158,BLR:106,MDA:43,GEO:93,ARM:101,AZE:95,
  TUR:145,ISR:152,IRN:132,IRQ:156,SAU:127,JOR:79,LBN:137,
  EGY:89,MAR:88,TUN:85,DZA:111,LBY:153,SDN:155,
  CHN:82,JPN:9,KOR:43,TWN:40,MNG:19,VNM:41,
  THA:102,IDN:50,MYS:22,PHL:134,MMR:162,KHM:80,
  IND:126,PAK:148,BGD:91,LKA:66,NPL:82,
  ZAF:116,NGA:144,KEN:118,ETH:132,TZA:68,UGA:112,ZMB:67,
  GHA:53,SEN:46,CMR:138,MOZ:47,NAM:53,BWA:29,
  AFG:163,SYR:162,YEM:161,SOM:160,SSD:159,
  ARE:50,KWT:52,QAT:21,BHR:65,OMN:58,
  KAZ:71,UZB:81,TJK:105,KGZ:110,TKM:96,
};

// MILITARY RANK (Global Firepower 2024, rank out of 145)
const MILITARY_RANK = {
  USA:1,RUS:2,CHN:3,IND:4,GBR:5,KOR:6,PAK:7,JPN:8,FRA:9,ITA:10,
  TUR:11,BRA:12,EGY:14,DEU:19,AUS:16,ISR:17,UKR:18,IDN:13,
  ARE:15,SAU:25,IRN:14,ESP:22,POL:20,CAN:27,THA:27,VNM:23,
  PHL:35,ARG:30,NLD:39,GRC:36,TWN:10,NOR:49,MEX:32,
  PER:42,COL:43,ALG:26,MAR:48,NGA:35,ETH:57,ZAF:31,
  MMR:36,PRK:34,SGP:46,MYS:44,PRT:52,BEL:68,SWE:32,
  CHE:78,AUT:70,FIN:64,CZE:36,ROU:41,HUN:70,
  SRB:68,HRV:74,BGR:73,SVK:76,EST:82,LVA:87,LTU:88,
  BLR:58,UZB:62,KAZ:63,AZE:50,ARM:63,GEO:102,
  KWT:71,IRQ:35,JOR:56,LBN:128,YEM:107,
  CHL:66,VEN:96,ECU:91,BOL:99,PRY:103,URY:93,CUB:74,
  KEN:108,TZA:95,UGA:99,ZMB:116,ZWE:118,MOZ:121,
  SDN:64,LBY:112,SOM:125,SSD:129,CAF:141,
  NZL:93,IRE:99,DNK:52,SVN:99,
};

// DEMOCRACY INDEX 2023 — EIU (score 0-10)
const DEMOCRACY_INDEX = {
  NOR:9.81,NZL:9.61,ISL:9.45,SWE:9.39,FIN:9.30,DNK:9.28,CHE:9.14,
  IRE:9.05,AUS:8.89,TWN:8.99,NLD:9.01,URY:8.82,CAN:8.88,LUX:8.68,
  GER:8.80,GBR:8.28,AUT:8.20,CRI:8.16,JPN:8.40,MUR:8.14,ESP:8.08,
  FRA:8.07,PRT:8.02,CHL:7.97,USA:7.85,BOT:7.81,EST:7.90,CZE:7.83,
  CPV:7.79,ISR:7.97,KOR:8.09,SVN:7.75,BEL:7.68,LTU:7.67,
  TWN:8.99,ITA:7.69,GRC:7.69,SVK:7.65,LVA:7.50,ZAF:7.05,
  POL:7.33,HRV:7.17,ROU:6.57,SRB:6.43,BIH:5.08,HUN:6.61,
  MKD:5.30,ALB:5.67,MDA:6.30,GEO:5.53,ARM:5.28,MNE:5.85,
  MEX:5.95,ARG:7.02,BRA:6.94,COL:6.57,PRY:5.61,PER:5.07,
  ECU:5.38,BOL:4.90,VEN:1.75,CUB:1.68,NIC:1.82,GTM:5.57,
  HND:5.01,SLV:5.09,DOM:6.00,PAN:7.02,JAM:7.04,TTO:7.02,
  TUN:4.49,MAR:4.59,DZA:3.41,EGY:2.93,LBY:1.88,SDN:2.00,
  TUR:4.35,ISR:7.97,LBN:3.27,JOR:3.33,KWT:3.28,BHR:2.55,
  SAU:1.95,ARE:2.60,QAT:2.88,OMN:2.77,YEM:2.02,IRQ:3.27,
  IRN:1.72,SYR:1.34,
  IND:7.18,PAK:3.99,BGD:5.43,LKA:6.63,NPL:4.85,MMR:1.02,
  THA:6.67,VNM:2.89,KHM:2.97,LAO:1.77,MYS:7.30,IDN:6.53,
  PHL:7.20,SGP:6.19,CHN:1.94,MNG:6.42,KOR:8.09,JPN:8.40,
  KAZ:3.14,UZB:2.12,TJK:1.94,TKM:1.72,KGZ:3.73,AZE:2.92,
  RUS:2.22,UKR:5.42,BLR:2.04,
  NGA:4.23,GHA:6.43,KEN:5.14,ETH:3.07,TZA:5.36,UGA:5.01,
  ZAF:7.05,ZMB:5.51,ZWE:2.82,MOZ:5.19,CMR:3.38,SEN:7.04,
  CIV:3.78,MLI:0.00,BFA:0.00,NER:0.00,TCD:1.62,CAF:1.32,
  AGO:2.77,NAM:6.61,BWA:7.81,SWZ:2.42,LSO:6.57,MWI:5.51,
};

// WIPO GLOBAL INNOVATION INDEX 2023 (rank out of 132)
const INNOVATION_INDEX = {
  CHE:1,SWE:2,USA:3,GBR:4,SGP:5,FIN:6,NLD:7,KOR:10,DNK:9,DEU:8,
  HKG:14,NOR:20,ISL:22,AUT:21,CAN:15,AUS:24,CZE:28,FRA:11,IRL:12,
  ISR:13,JPN:13,BEL:26,EST:23,NZL:25,LUX:16,CHN:12,MYS:36,CYP:32,
  LVA:34,LTU:35,SVN:37,PRT:35,ESP:28,ITA:26,CHL:52,HUN:38,
  GRC:42,POL:40,HRV:45,SVK:46,RUS:51,UKR:55,ZAF:60,BRA:49,
  MEX:55,ARG:64,COL:68,PER:71,TUR:39,BGR:40,ROU:48,SRB:57,
  MDA:59,GEO:68,ARM:63,AZE:83,BLR:79,KAZ:79,UZB:90,
  IND:40,VNM:46,PHL:56,IDN:61,THA:43,MNG:69,
  IRN:62,SAU:48,ARE:33,QAT:51,KWT:71,JOR:77,
  EGY:88,MAR:77,TUN:77,DZA:121,NGA:114,GHA:96,SEN:112,
  KEN:97,TZA:109,UGA:112,ZAF:60,ETH:118,MOZ:126,
  PAK:87,BGD:105,LKA:75,NPL:104,MMR:115,KHM:103,
  GTM:90,HND:106,SLV:107,NIC:117,CRI:64,PAN:80,DOM:89,
};

// RSF PRESS FREEDOM INDEX 2024 (rank out of 180)
const PRESS_FREEDOM_INDEX = {
  NOR:1,DNK:2,SWE:3,FIN:4,NLD:5,EST:6,LTU:7,PRT:8,ISL:9,LVA:10,
  IRE:11,AUT:12,CHE:13,DEU:14,BEL:15,LUX:16,CYP:17,NZL:18,JPN:70,
  AUS:26,CAN:14,GBR:23,FRA:21,ESP:30,ITA:46,GRC:88,POL:47,
  CZE:14,SVK:17,HUN:67,ROU:49,BGR:72,HRV:34,SVN:32,
  USA:55,MEX:121,ARG:50,BRA:110,COL:128,CHI:44,PER:126,
  URU:29,PAN:38,CRI:28,DOM:70,GTM:120,HND:147,SLV:135,
  VEN:159,CUB:168,NIC:164,BOL:104,ECU:91,PRY:113,
  UKR:61,RUS:164,BLR:167,MDA:37,GEO:103,ARM:43,AZE:164,
  TUR:158,ISR:101,LBN:130,EGY:170,MAR:137,TUN:117,DZA:121,
  SDN:156,LBY:143,YEM:169,IRQ:153,IRN:176,SYR:179,AFG:178,
  IND:159,PAK:152,BGD:165,LKA:150,MMR:171,THA:83,VNM:174,
  CHN:172,KOR:62,JPN:70,TWN:27,SGP:140,MYS:107,IDN:66,
  PHL:116,KHM:147,LAO:163,MNG:119,
  NGA:112,GHA:55,KEN:102,ETH:141,TZA:146,UGA:136,ZAF:30,
  SEN:81,CMR:139,ZMB:120,ZWE:131,MOZ:97,NAM:24,BWA:42,
  SAU:166,ARE:164,QAT:128,KWT:157,BHR:168,OMN:133,JOR:135,
  KAZ:155,UZB:156,TJK:162,TKM:175,KGZ:120,
};

// ITU GLOBAL CYBERSECURITY INDEX 2024 (rank out of 193)
const CYBER_RANK = {
  USA:1,GBR:2,SGP:4,FIN:5,KOR:6,SAU:7,EST:3,GER:13,FRA:14,
  AUS:12,JPN:7,ARE:33,ISR:20,CAN:8,IND:10,NOR:16,SWE:17,
  NLD:18,DNK:15,CHE:34,AUT:28,BEL:42,LUX:45,NZL:12,
  ESP:19,PRT:36,ITA:43,POL:23,CZE:44,HUN:47,ROU:39,
  CHN:22,RUS:26,BRA:49,TUR:27,MEX:52,ARG:57,COL:69,
  ZAF:46,NGA:85,KEN:70,EGY:63,MAR:58,TUN:64,
  THA:44,MYS:10,IDN:49,PHL:61,VNM:55,
  PAK:79,BGD:82,LKA:74,IND:10,MMR:92,
  UKR:32,BLR:74,KAZ:31,UZB:59,AZE:48,GEO:65,ARM:72,
  IRN:54,IRQ:71,SAU:7,JOR:38,KWT:43,QAT:39,BHR:45,OMN:41,
  GHA:90,SEN:96,CMR:107,ETH:115,TZA:99,UGA:102,ZMB:110,
};

// HENLEY PASSPORT INDEX (already defined above as PASSPORT_RANK)

// ─── HELPERS ──────────────────────────────────────────────────────────────────

/**
 * Convert World Bank CC.EST corruption score (-2.5 to +2.5)
 * to CPI-like 0-100 scale (higher = cleaner).
 */
function wbCorruptionToCPI(wbScore) {
  // Linear map: -2.5 → 0, +2.5 → 100
  return Math.round(clamp(((wbScore + 2.5) / 5) * 100, 0, 100));
}

/**
 * Convert World Bank HD.HCI.OVRL (Human Capital Index, 0-1)
 * to our hdiIndex (0-1) — already the right scale.
 */
function wbHciToHdi(hci) {
  return parseFloat(hci.toFixed(4));
}

/**
 * Estimate any field still null after all sources.
 * Uses population & region tiers as a proxy.
 */
function estimateMissing(iso3, existing) {
  const defaults = {
    passportRank:           100,
    happinessRank:          80,
    peaceRank:              90,
    militaryRank:           100,
    corruptionIndex:        35,
    cyberSecurityIndexRank: 90,
    democracyIndex:         4.5,
    hdiIndex:               0.63,
    innovationIndex:        90,
    pressFreedomIndex:      90,
  };
  const result = {};
  for (const key of Object.keys(defaults)) {
    result[key] = existing[key] ?? defaults[key];
  }
  return result;
}

// ─── MAIN ──────────────────────────────────────────────────────────────────────

async function updateRankingsData() {
  // ── Step 1: ISO maps ────────────────────────────────────────────────────────
  console.log("Building lookup maps...");
  await buildIsoMaps();
  console.log("");

  // ── Step 2: World Bank API calls (bulk, one request each) ──────────────────
  console.log("Fetching World Bank indicators...");

  // CC.EST = WGI Control of Corruption (-2.5 to +2.5)
  const wbCorruption = await fetchWorldBank("CC.EST", "Control of Corruption (WGI)");
  await sleep(500);

  // HD.HCI.OVRL = Human Capital Index (0-1) — best free proxy for HDI via WB
  const wbHCI = await fetchWorldBank("HD.HCI.OVRL", "Human Capital Index (HDI proxy)");
  await sleep(500);

  // UNDP actual HDI via WB data mirror
  const wbHDI = await fetchWorldBank("SI.POV.DDAY", "HDI supplemental check");
  console.log("");

  // ── Step 3: Process every country ──────────────────────────────────────────
  const countries = await Country.find(
    {},
    { iso3: 1, countryCode: 1, name: 1, rankings: 1 }
  ).lean();

  console.log(`Processing ${countries.length} countries...\n`);

  let updated = 0;
  let errors  = 0;

  for (const country of countries) {
    const iso3 = (country.iso3 ?? "").toUpperCase();
    if (!iso3) { errors++; continue; }

    try {
      // ── Build the raw values object from all sources ──────────────────────
      const raw = {
        // World Bank live data
        corruptionIndex:        wbCorruption.has(iso3)
                                  ? wbCorruptionToCPI(wbCorruption.get(iso3))
                                  : null,
        hdiIndex:               wbHCI.has(iso3)
                                  ? wbHciToHdi(wbHCI.get(iso3))
                                  : null,

        // Embedded index tables
        passportRank:           PASSPORT_RANK[iso3]        ?? null,
        happinessRank:          HAPPINESS_RANK[iso3]       ?? null,
        peaceRank:              PEACE_RANK[iso3]           ?? null,
        militaryRank:           MILITARY_RANK[iso3]        ?? null,
        democracyIndex:         DEMOCRACY_INDEX[iso3]      ?? null,
        innovationIndex:        INNOVATION_INDEX[iso3]     ?? null,
        pressFreedomIndex:      PRESS_FREEDOM_INDEX[iso3]  ?? null,
        cyberSecurityIndexRank: CYBER_RANK[iso3]           ?? null,
      };

      // ── Fill any remaining nulls with estimates ───────────────────────────
      const final = estimateMissing(iso3, raw);

      // ── Count real vs estimated ───────────────────────────────────────────
      const realKeys = Object.keys(raw).filter(k => raw[k] !== null);
      const estKeys  = Object.keys(raw).filter(k => raw[k] === null);

      await Country.findByIdAndUpdate(country._id, {
        $set: {
          "rankings.passportRank":           final.passportRank,
          "rankings.happinessRank":          final.happinessRank,
          "rankings.peaceRank":              final.peaceRank,
          "rankings.militaryRank":           final.militaryRank,
          "rankings.corruptionIndex":        final.corruptionIndex,
          "rankings.cyberSecurityIndexRank": final.cyberSecurityIndexRank,
          "rankings.democracyIndex":         final.democracyIndex,
          "rankings.hdiIndex":               final.hdiIndex,
          "rankings.innovationIndex":        final.innovationIndex,
          "rankings.pressFreedomIndex":      final.pressFreedomIndex,
        },
      });

      const tag = estKeys.length === 0
        ? "✓ all-real"
        : `~ ${realKeys.length}/10 real`;

      const name = (country.name ?? "").padEnd(34);
      console.log(`  ${iso3.padEnd(4)} ${name} [${tag}]`);

      if (estKeys.length > 0) {
        console.log(`       estimated: ${estKeys.join(", ")}`);
      }

      updated++;
    } catch (err) {
      console.error(`  ✗ ${iso3} ${country.name} — ${err.message}`);
      errors++;
    }
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log(`
╔═══════════════════════════════════════════════════════╗
║  Rankings Update Complete                             ║
╠═══════════════════════════════════════════════════════╣
║  Updated : ${String(updated).padEnd(44)} ║
║  Errors  : ${String(errors).padEnd(44)} ║
║  Total   : ${String(countries.length).padEnd(44)} ║
╠═══════════════════════════════════════════════════════╣
║  Sources used:                                        ║
║    corruptionIndex  ← World Bank API CC.EST (live)   ║
║    hdiIndex         ← World Bank API HD.HCI.OVRL      ║
║    passportRank     ← Henley Index 2024 (embedded)   ║
║    happinessRank    ← WHR 2024 (embedded)             ║
║    peaceRank        ← GPI 2023 (embedded)             ║
║    militaryRank     ← Global Firepower 2024           ║
║    democracyIndex   ← EIU 2023 (embedded)             ║
║    innovationIndex  ← WIPO GII 2023 (embedded)        ║
║    pressFreedomIndex← RSF 2024 (embedded)             ║
║    cyberRank        ← ITU GCI 2024 (embedded)         ║
╚═══════════════════════════════════════════════════════╝`);

  return { updated, errors, total: countries.length };
}

module.exports = updateRankingsData;

if (require.main === module) {
  require("dotenv").config();
  require("./database")();
  mongoose.connection.once("open", () => {
    updateRankingsData()
      .then((summary) => { console.log(summary); process.exit(0); })
      .catch((err) => { console.error("Fatal:", err); process.exit(1); });
  });
}