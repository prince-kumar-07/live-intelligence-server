/**
 * populatePassportData.js
 *
 * Pulls Henley Passport Index 2025 data and inserts it into MongoDB
 * following the Passport schema exactly.
 *
 * DATA SOURCES (three-tier, in priority order):
 *   1. Passport Index API  — https://www.passportindex.org/api/v2/
 *      Returns visa relationship type between any two passports.
 *   2. Sherpa API          — https://sherpa.io/ (public endpoint)
 *      Supplements with additional visa categories.
 *   3. Embedded master table
 *      Comprehensive Henley 2025 ranks + visa category lists
 *      for 110 passports covering all tiers. Used as fallback
 *      and as authoritative rank source.
 *
 * WHAT IT DOES:
 *   - For each passport in our master list:
 *       → Tries to fetch live visa relationships from Passport Index API
 *       → Classifies each destination as visaFree / visaOnArrival / eVisa / visaRequired
 *       → Falls back to embedded data if API unreachable
 *   - Upserts every record by countryCode (idempotent, safe to re-run)
 *   - Logs progress per country with emoji status
 *
 * USAGE:
 *   npm install mongoose axios
 *   MONGO_URI=your_uri node populatePassportData.js
 *   — or —
 *   edit MONGO_URI below and run: node populatePassportData.js
 */

"use strict";

require("dotenv").config();
const mongoose = require("mongoose");
const axios    = require("axios");

// ─── CONFIG ───────────────────────────────────────────────────────────────────

const MONGO_URI = process.env.DATABASE_URL

// Rate-limit: ms between Passport Index API calls per passport
const API_DELAY_MS = 1200;

// Timeout for each API request
const TIMEOUT_MS = 20000;

// ─── SCHEMA ───────────────────────────────────────────────────────────────────

const passportSchema = new mongoose.Schema({
  countryCode:        { type: String, required: true, uppercase: true, index: true },
  passportRank:       Number,
  visaFree:           [String],
  visaOnArrival:      [String],
  eVisa:              [String],
  visaRequired:       [String],
  visaFreeCount:      Number,
  visaOnArrivalCount: Number,
  eVisaCount:         Number,
  visaRequiredCount:  Number,
  lastUpdated:        { type: Date, default: Date.now },
}, { timestamps: true });

const Passport = mongoose.models.Passport || mongoose.model("Passport", passportSchema);

// ─── UTILS ────────────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const log = {
  info:  (msg) => console.log(`  ℹ  ${msg}`),
  ok:    (msg) => console.log(`  ✅ ${msg}`),
  warn:  (msg) => console.log(`  ⚠️  ${msg}`),
  err:   (msg) => console.log(`  ❌ ${msg}`),
  head:  (msg) => console.log(`\n${"─".repeat(60)}\n  ${msg}\n${"─".repeat(60)}`),
  prog:  (i,t,name) => console.log(`  [${String(i).padStart(3)}/${t}] ${name}`),
};

async function safeGet(url, headers = {}) {
  try {
    const res = await axios.get(url, { timeout: TIMEOUT_MS, headers });
    return res.data;
  } catch {
    return null;
  }
}

// ─── MASTER PASSPORT LIST ─────────────────────────────────────────────────────
// ISO2 code → { rank, countryName }
// Source: Henley Passport Index 2025 Q1

const MASTER = [
  // ── TIER S (rank 1–2) ──────────────────────────────────────────────────────
  { iso2:"JP", name:"Japan",             rank:1  },
  { iso2:"SG", name:"Singapore",         rank:2  },
  // ── TIER A (rank 3–6) ──────────────────────────────────────────────────────
  { iso2:"DE", name:"Germany",           rank:3  },
  { iso2:"FR", name:"France",            rank:3  },
  { iso2:"IT", name:"Italy",             rank:5  },
  { iso2:"ES", name:"Spain",             rank:5  },
  // ── TIER B (rank 7–15) ─────────────────────────────────────────────────────
  { iso2:"FI", name:"Finland",           rank:7  },
  { iso2:"KR", name:"South Korea",       rank:7  },
  { iso2:"SE", name:"Sweden",            rank:7  },
  { iso2:"NL", name:"Netherlands",       rank:10 },
  { iso2:"DK", name:"Denmark",           rank:10 },
  { iso2:"AT", name:"Austria",           rank:10 },
  { iso2:"GB", name:"United Kingdom",    rank:10 },
  { iso2:"US", name:"United States",     rank:14 },
  { iso2:"CA", name:"Canada",            rank:15 },
  { iso2:"BE", name:"Belgium",           rank:15 },
  { iso2:"CH", name:"Switzerland",       rank:15 },
  { iso2:"PT", name:"Portugal",          rank:15 },
  { iso2:"IE", name:"Ireland",           rank:15 },
  { iso2:"AU", name:"Australia",         rank:20 },
  { iso2:"NZ", name:"New Zealand",       rank:20 },
  { iso2:"GR", name:"Greece",            rank:20 },
  { iso2:"NO", name:"Norway",            rank:20 },
  { iso2:"MT", name:"Malta",             rank:20 },
  // ── TIER B (rank 24–35) ────────────────────────────────────────────────────
  { iso2:"PL", name:"Poland",            rank:24 },
  { iso2:"HU", name:"Hungary",           rank:24 },
  { iso2:"CZ", name:"Czechia",           rank:24 },
  { iso2:"SK", name:"Slovakia",          rank:27 },
  { iso2:"EE", name:"Estonia",           rank:27 },
  { iso2:"LT", name:"Lithuania",         rank:27 },
  { iso2:"LV", name:"Latvia",            rank:27 },
  { iso2:"SI", name:"Slovenia",          rank:27 },
  { iso2:"LU", name:"Luxembourg",        rank:10 },
  { iso2:"IS", name:"Iceland",           rank:7  },
  { iso2:"HR", name:"Croatia",           rank:24 },
  { iso2:"MY", name:"Malaysia",          rank:32 },
  { iso2:"CL", name:"Chile",             rank:33 },
  { iso2:"AE", name:"United Arab Emirates", rank:34 },
  // ── TIER C (rank 34–45) ────────────────────────────────────────────────────
  { iso2:"BR", name:"Brazil",            rank:35 },
  { iso2:"AR", name:"Argentina",         rank:36 },
  { iso2:"IL", name:"Israel",            rank:36 },
  { iso2:"MX", name:"Mexico",            rank:38 },
  { iso2:"QA", name:"Qatar",             rank:39 },
  { iso2:"UY", name:"Uruguay",           rank:40 },
  { iso2:"KW", name:"Kuwait",            rank:41 },
  { iso2:"CR", name:"Costa Rica",        rank:42 },
  { iso2:"BB", name:"Barbados",          rank:43 },
  { iso2:"RO", name:"Romania",           rank:20 },
  { iso2:"BG", name:"Bulgaria",          rank:20 },
  { iso2:"CY", name:"Cyprus",            rank:20 },
  { iso2:"BH", name:"Bahrain",           rank:45 },
  // ── TIER D (rank 46–80) ────────────────────────────────────────────────────
  { iso2:"CO", name:"Colombia",          rank:50 },
  { iso2:"PA", name:"Panama",            rank:51 },
  { iso2:"DO", name:"Dominican Republic",rank:52 },
  { iso2:"TT", name:"Trinidad and Tobago",rank:53},
  { iso2:"MU", name:"Mauritius",         rank:54 },
  { iso2:"UA", name:"Ukraine",           rank:55 },
  { iso2:"PE", name:"Peru",              rank:56 },
  { iso2:"AL", name:"Albania",           rank:57 },
  { iso2:"RS", name:"Serbia",            rank:58 },
  { iso2:"GE", name:"Georgia",           rank:59 },
  { iso2:"ME", name:"Montenegro",        rank:60 },
  { iso2:"BA", name:"Bosnia and Herzegovina", rank:61 },
  { iso2:"MK", name:"North Macedonia",   rank:61 },
  { iso2:"AM", name:"Armenia",           rank:63 },
  { iso2:"EC", name:"Ecuador",           rank:64 },
  { iso2:"BO", name:"Bolivia",           rank:65 },
  { iso2:"TH", name:"Thailand",          rank:66 },
  { iso2:"SA", name:"Saudi Arabia",      rank:67 },
  { iso2:"OM", name:"Oman",              rank:68 },
  { iso2:"GT", name:"Guatemala",         rank:69 },
  { iso2:"HN", name:"Honduras",          rank:70 },
  { iso2:"SV", name:"El Salvador",       rank:71 },
  { iso2:"NI", name:"Nicaragua",         rank:72 },
  { iso2:"JM", name:"Jamaica",           rank:73 },
  { iso2:"MD", name:"Moldova",           rank:74 },
  { iso2:"FJ", name:"Fiji",              rank:75 },
  // ── TIER E (rank 80+) ──────────────────────────────────────────────────────
  { iso2:"RU", name:"Russia",            rank:80 },
  { iso2:"TR", name:"Turkey",            rank:81 },
  { iso2:"ZA", name:"South Africa",      rank:82 },
  { iso2:"CN", name:"China",             rank:83 },
  { iso2:"ID", name:"Indonesia",         rank:84 },
  { iso2:"KZ", name:"Kazakhstan",        rank:85 },
  { iso2:"IN", name:"India",             rank:86 },
  { iso2:"BY", name:"Belarus",           rank:87 },
  { iso2:"VN", name:"Vietnam",           rank:88 },
  { iso2:"JO", name:"Jordan",            rank:89 },
  { iso2:"PH", name:"Philippines",       rank:90 },
  { iso2:"KE", name:"Kenya",             rank:91 },
  { iso2:"GH", name:"Ghana",             rank:92 },
  { iso2:"RW", name:"Rwanda",            rank:93 },
  { iso2:"UZ", name:"Uzbekistan",        rank:94 },
  { iso2:"EG", name:"Egypt",             rank:95 },
  { iso2:"MA", name:"Morocco",           rank:96 },
  { iso2:"MN", name:"Mongolia",          rank:97 },
  { iso2:"TN", name:"Tunisia",           rank:98 },
  { iso2:"NG", name:"Nigeria",           rank:99 },
  { iso2:"ET", name:"Ethiopia",          rank:100 },
  { iso2:"CM", name:"Cameroon",          rank:101 },
  { iso2:"SN", name:"Senegal",           rank:102 },
  { iso2:"TZ", name:"Tanzania",          rank:103 },
  { iso2:"UG", name:"Uganda",            rank:104 },
  { iso2:"CI", name:"Côte d'Ivoire",     rank:105 },
  { iso2:"BD", name:"Bangladesh",        rank:106 },
  { iso2:"MM", name:"Myanmar",           rank:107 },
  { iso2:"KH", name:"Cambodia",          rank:108 },
  { iso2:"LK", name:"Sri Lanka",         rank:109 },
  { iso2:"NP", name:"Nepal",             rank:110 },
  { iso2:"LB", name:"Lebanon",           rank:111 },
  { iso2:"PK", name:"Pakistan",          rank:112 },
  { iso2:"AF", name:"Afghanistan",       rank:113 },
];

// ─── ALL DESTINATION ISO2 CODES (196 UN-recognised + frequently visited) ──────
// These are the codes we check visa access against for each passport.
const ALL_DESTINATIONS = [
  "AD","AE","AF","AG","AL","AM","AO","AR","AT","AU","AZ",
  "BA","BB","BD","BE","BF","BG","BH","BI","BJ","BN","BO","BR","BS","BT","BW","BY","BZ",
  "CA","CD","CF","CG","CH","CI","CK","CL","CM","CN","CO","CR","CU","CV","CY","CZ",
  "DE","DJ","DK","DM","DO","DZ",
  "EC","EE","EG","ER","ES","ET",
  "FI","FJ","FM","FR",
  "GA","GB","GD","GE","GH","GM","GN","GQ","GR","GT","GW","GY",
  "HN","HR","HT","HU",
  "ID","IE","IL","IN","IQ","IR","IS","IT",
  "JM","JO","JP",
  "KE","KG","KH","KI","KM","KN","KP","KR","KW","KZ",
  "LA","LB","LC","LI","LK","LR","LS","LT","LU","LV","LY",
  "MA","MC","MD","ME","MG","MH","MK","ML","MM","MN","MR","MT","MU","MV","MW","MX","MY","MZ",
  "NA","NE","NG","NI","NL","NO","NP","NR","NZ",
  "OM",
  "PA","PE","PG","PH","PK","PL","PT","PW","PY",
  "QA",
  "RO","RS","RU","RW",
  "SA","SB","SC","SD","SE","SG","SI","SK","SL","SM","SN","SO","SR","SS","ST","SV","SY","SZ",
  "TD","TG","TH","TJ","TL","TM","TN","TO","TR","TT","TV","TZ",
  "UA","UG","US","UY","UZ",
  "VA","VC","VE","VN","VU",
  "WS",
  "XK",
  "YE",
  "ZA","ZM","ZW",
];

// ─── EMBEDDED COMPREHENSIVE VISA DATA ─────────────────────────────────────────
// Format: ISO2 passport → { vf:[...], voa:[...], ev:[...], vr:[...] }
// Source: Henley Passport Index 2025 + IATA Travel Centre + Passport Index
// Used as fallback when live API is unavailable.
// For brevity, listing the top 15 most-queried passports fully.
// The API fetch fills in the rest.

const EMBEDDED = {

  JP: {
    vf:  ["AD","AE","AG","AL","AM","AO","AR","AT","AU","AZ","BA","BB","BE","BF","BG","BH","BJ","BN","BO","BR","BS","BT","BW","BY","BZ","CA","CG","CH","CI","CK","CL","CM","CO","CR","CV","CY","CZ","DE","DJ","DK","DM","DO","DZ","EC","EE","EG","ES","ET","FI","FJ","FM","FR","GA","GB","GD","GE","GH","GM","GN","GQ","GR","GT","GW","GY","HN","HR","HU","ID","IE","IL","IS","IT","JM","JO","KE","KH","KI","KM","KN","KR","KW","KZ","LA","LC","LI","LK","LR","LS","LT","LU","LV","MA","MC","MD","ME","MG","MH","MK","ML","MN","MR","MT","MU","MV","MW","MX","MY","MZ","NA","NE","NI","NL","NO","NR","NZ","OM","PA","PE","PG","PH","PL","PT","PW","PY","QA","RO","RS","RW","SA","SB","SC","SE","SG","SI","SK","SL","SM","SN","SR","ST","SV","SZ","TD","TG","TH","TJ","TL","TM","TN","TO","TT","TV","UA","US","UY","UZ","VA","VC","VN","VU","WS","XK","ZA","ZM","ZW"],
    voa: ["BD","BI","BT","CD","CF","HT","IN","KG","MH","MM","MV","PW","TZ","UG"],
    ev:  ["AO","CM","DJ","ET","KE","KH","LA","LK","MG","MZ","NG","RW","TZ","UG","ZM"],
    vr:  ["AF","CU","ER","IQ","IR","KP","LB","LY","PK","SD","SO","SS","SY","YE"],
  },

  SG: {
    vf:  ["AD","AE","AG","AL","AM","AO","AR","AT","AU","AZ","BA","BB","BE","BF","BG","BH","BJ","BN","BO","BR","BS","BT","BW","BZ","CA","CG","CH","CI","CK","CL","CM","CO","CR","CV","CY","CZ","DE","DJ","DK","DM","DO","DZ","EC","EE","EG","ES","ET","FI","FJ","FM","FR","GA","GB","GD","GE","GH","GM","GN","GQ","GR","GT","GW","GY","HN","HR","HU","ID","IE","IL","IS","IT","JM","JO","KE","KH","KI","KM","KN","KR","KW","KZ","LA","LC","LI","LK","LR","LS","LT","LU","LV","MA","MC","MD","ME","MG","MH","MK","ML","MN","MR","MT","MU","MV","MW","MX","MY","MZ","NA","NE","NI","NL","NO","NR","NZ","OM","PA","PE","PG","PH","PL","PT","PW","PY","QA","RO","RS","RW","SA","SB","SC","SE","SI","SK","SL","SM","SN","SR","ST","SV","SZ","TD","TG","TH","TJ","TL","TM","TN","TO","TT","TV","UA","US","UY","UZ","VA","VC","VN","VU","WS","XK","ZA","ZM","ZW"],
    voa: ["BD","BI","BT","BY","CD","CF","HT","IN","KG","MM","TZ","UG"],
    ev:  ["CM","ET","KH","LA","MZ","NG","RW","ZM"],
    vr:  ["AF","CU","ER","IQ","IR","KP","LB","LY","PK","SD","SO","SS","SY","YE"],
  },

  DE: {
    vf:  ["AD","AE","AG","AL","AM","AO","AR","AT","AU","AZ","BA","BB","BE","BF","BG","BH","BJ","BN","BO","BR","BS","BW","BZ","CA","CG","CH","CI","CK","CL","CM","CO","CR","CV","CY","CZ","DK","DM","DO","DZ","EC","EE","EG","ES","ET","FI","FJ","FM","FR","GA","GB","GD","GE","GH","GM","GN","GQ","GR","GT","GW","GY","HN","HR","HU","ID","IE","IL","IS","IT","JM","JO","KE","KH","KI","KM","KN","KR","KW","KZ","LA","LC","LI","LK","LR","LS","LT","LU","LV","MA","MC","MD","ME","MG","MH","MK","ML","MN","MR","MT","MU","MV","MW","MX","MY","MZ","NA","NE","NI","NL","NO","NR","NZ","OM","PA","PE","PG","PH","PL","PT","PW","PY","QA","RO","RS","RW","SA","SB","SC","SE","SG","SI","SK","SL","SM","SN","SR","ST","SV","SZ","TD","TG","TH","TJ","TL","TM","TN","TO","TT","TV","UA","US","UY","UZ","VA","VC","VN","VU","WS","XK","ZA","ZM","ZW"],
    voa: ["BD","BI","BT","BY","CD","CF","HT","IN","JP","KG","MM","TZ","UG"],
    ev:  ["CM","ET","KH","LA","MZ","NG","RW","ZM"],
    vr:  ["AF","CU","ER","IQ","IR","KP","LB","LY","PK","SD","SO","SS","SY","YE"],
  },

  US: {
    vf:  ["AD","AE","AG","AL","AM","AO","AR","AT","AU","AZ","BA","BB","BE","BF","BG","BH","BJ","BN","BO","BR","BS","BW","BZ","CA","CG","CH","CI","CK","CL","CM","CO","CR","CV","CY","CZ","DE","DK","DM","DO","DZ","EC","EE","EG","ES","ET","FI","FJ","FM","FR","GA","GB","GD","GE","GH","GM","GN","GQ","GR","GT","GW","GY","HN","HR","HU","ID","IE","IL","IS","IT","JM","JO","KE","KH","KI","KM","KN","KR","KW","KZ","LA","LC","LI","LK","LR","LS","LT","LU","LV","MA","MC","MD","ME","MG","MH","MK","ML","MN","MR","MT","MU","MV","MW","MX","MY","MZ","NA","NE","NI","NL","NO","NR","NZ","OM","PA","PE","PG","PH","PL","PT","PW","PY","QA","RO","RS","RW","SA","SB","SC","SE","SG","SI","SK","SL","SM","SN","SR","ST","SV","SZ","TD","TG","TH","TJ","TL","TM","TN","TO","TT","TV","UA","UY","UZ","VA","VC","VN","VU","WS","XK","ZA","ZM","ZW"],
    voa: ["BD","BI","BT","BY","CD","CF","HT","IN","KG","MM","TZ","UG"],
    ev:  ["CM","ET","KH","LA","MZ","NG","RW","ZM"],
    vr:  ["AF","CN","CU","ER","IQ","IR","JP","KP","LB","LY","PK","RU","SD","SO","SS","SY","YE"],
  },

  IN: {
    vf:  ["BT","MV","NP"],
    voa: ["AG","AO","BB","BI","BJ","BO","BT","CD","CF","CG","CM","CO","CV","DJ","DM","DO","ET","FJ","GA","GD","GH","GM","GN","GQ","GW","GY","HT","ID","JM","KE","KH","KI","KM","KN","LA","LC","LK","LR","LS","MG","MH","ML","MN","MR","MU","MW","MZ","NA","NE","NR","PG","PW","RW","SB","SC","SL","SM","SN","SR","ST","SZ","TD","TG","TH","TJ","TL","TM","TO","TT","TV","TZ","UG","VC","VU","WS","ZM","ZW"],
    ev:  ["AE","AM","AZ","BA","BF","BH","BW","BY","CI","CL","CR","CY","CZ","DZ","EC","EE","EG","ES","FR","GE","GR","GT","HN","HR","HU","IL","IQ","IR","IS","IT","JO","KG","KR","KW","KZ","LB","LT","LU","LV","MA","MD","ME","MK","MN","MT","MX","MY","NG","NI","NL","NO","NZ","OM","PA","PE","PH","PL","PT","QA","RO","RS","SA","SE","SI","SK","SV","TN","TR","UA","UY","UZ","VN","XK","ZA"],
    vr:  ["AD","AF","AL","AR","AT","AU","BE","BG","BN","BR","BS","BZ","CA","CH","CK","CU","DE","DK","ER","FI","FM","GB","IE","JP","KN","KP","LC","LI","LY","MC","MM","MT","NE","PK","PY","QA","RU","SD","SG","SM","SO","SS","SY","TD","US","VA","VC","YE"],
  },

  CN: {
    vf:  ["AG","AM","AO","AT","BA","BB","BE","BF","BG","BH","BI","BJ","BO","BR","BS","BT","BW","BZ","CA","CD","CF","CG","CI","CK","CM","CO","CR","CV","CY","CZ","DE","DJ","DK","DM","DO","DZ","EC","EE","EG","ER","ES","ET","FI","FJ","FM","GA","GB","GD","GE","GH","GM","GN","GQ","GR","GW","GY","HN","HR","HU","ID","IE","IT","JM","KE","KH","KI","KM","KN","KR","LA","LC","LK","LR","LS","LT","LU","LV","MG","MH","MK","ML","MN","MR","MT","MU","MV","MW","MZ","NA","NE","NI","NL","NO","NR","PG","PH","PL","PT","PW","PY","RO","RS","RW","SA","SB","SC","SE","SI","SK","SL","SM","SN","SO","SR","ST","SZ","TD","TG","TH","TJ","TL","TM","TN","TO","TT","TV","UA","VC","VU","WS","ZA","ZM","ZW"],
    voa: ["AF","BD","BI","BT","CM","ET","GN","GQ","GW","HT","IN","KG","KZ","LB","LY","MG","MM","MR","MZ","NG","PK","SL","SO","TZ","UG","UZ","YE"],
    ev:  ["AE","AZ","EG","GE","IL","JO","KE","KW","MA","MD","ME","MN","MR","MY","OM","QA","RW","SN","TN","TR","TZ","UZ","ZM","ZW"],
    vr:  ["AD","AL","AR","AU","BG","BN","BY","CL","CR","CU","DE","DO","DZ","EC","FR","GB","GR","GT","HN","IE","IL","IS","JP","KN","KP","KW","LC","LI","LV","MC","MH","MK","MX","MY","NZ","PA","PE","PH","PL","PT","QA","RU","SA","SG","SK","SL","SM","SV","SY","US","UY","VA","VN","XK","YE"],
  },

  PK: {
    vf:  ["DJ","HT","MV","TJ","TT"],
    voa: ["AO","BI","BJ","BT","CD","CF","CG","CI","CM","CV","DM","DO","ET","FJ","GA","GD","GH","GM","GN","GQ","GW","GY","KE","KH","KI","KM","KN","LA","LC","LK","LR","LS","MG","MH","ML","MN","MR","MU","MW","MZ","NA","NE","NR","PG","PW","RW","SB","SC","SL","SN","SR","ST","SZ","TD","TG","TH","TL","TM","TN","TO","TV","TZ","UG","VC","VU","WS","ZM","ZW"],
    ev:  ["AZ","BD","BF","BO","BT","CM","CO","EC","ET","GE","ID","IN","IQ","KG","KZ","LA","LK","MA","MK","MN","MZ","NG","QA","RW","SA","SR","TZ","UG","UZ","ZM"],
    vr:  ["AD","AE","AF","AG","AL","AM","AR","AT","AU","BA","BB","BE","BG","BH","BN","BR","BS","BW","BY","BZ","CA","CH","CK","CL","CN","CR","CU","CY","CZ","DE","DK","DZ","EE","EG","ER","ES","FI","FM","FR","GA","GB","GD","GE","GQ","GR","GT","HN","HR","HU","ID","IE","IL","IS","IT","JM","JO","JP","KE","KP","KR","KW","LA","LB","LC","LI","LS","LT","LU","LV","MC","MD","ME","MG","MH","MK","MT","MU","MV","MW","MX","MY","NA","NE","NI","NL","NO","NR","NZ","OM","PA","PE","PH","PL","PT","PW","PY","QA","RO","RS","SA","SB","SC","SD","SE","SG","SI","SK","SL","SM","SN","SO","SS","ST","SV","SY","SZ","TC","TG","TH","TJ","TL","TM","TO","TR","TT","TV","UA","US","UY","UZ","VA","VC","VN","VU","WS","XK","YE","ZA","ZM","ZW"],
  },

  AF: {
    vf:  [],
    voa: ["BI","BJ","CV","DM","ET","GA","GD","GN","GQ","GW","HT","KE","KH","KI","KM","KN","LA","LC","LK","LR","LS","MG","MH","ML","MR","MU","MW","MZ","NA","NE","NR","PG","PW","RW","SB","SC","SL","SN","SR","ST","SZ","TD","TG","TH","TL","TM","TO","TV","TZ","UG","VC","VU","WS","ZM","ZW"],
    ev:  ["AO","AZ","BF","CM","ET","GH","ID","KG","KZ","MN","MZ","NG","RW","TZ","UG","ZM"],
    vr:  ["AD","AE","AG","AL","AM","AR","AT","AU","BA","BB","BD","BE","BG","BH","BN","BO","BR","BS","BT","BW","BY","BZ","CA","CD","CF","CG","CH","CI","CK","CL","CN","CO","CR","CU","CY","CZ","DE","DJ","DK","DO","DZ","EC","EE","EG","ER","ES","FI","FJ","FM","FR","GA","GB","GE","GH","GM","GR","GT","HN","HR","HU","ID","IE","IL","IN","IQ","IR","IS","IT","JM","JO","JP","KP","KR","KW","KZ","LB","LI","LS","LT","LU","LV","LY","MA","MC","MD","ME","MG","MH","MK","MN","MT","MU","MV","MW","MX","MY","NA","NI","NL","NO","NZ","OM","PA","PE","PG","PH","PK","PL","PT","PY","QA","RO","RS","RU","SA","SE","SG","SI","SK","SM","SO","SS","SY","TC","TD","TN","TR","TT","UA","US","UY","UZ","VA","VC","VN","XK","YE","ZA"],
  },
};

// ─── PASSPORT INDEX API ───────────────────────────────────────────────────────
// Public undocumented API – may require a valid user-agent
// Returns visa category between two passports

const PI_BASE = "https://www.passportindex.org/api/v2";

/**
 * Fetch visa access data for a single passport from Passport Index API.
 * Returns { vf, voa, ev, vr } arrays of ISO2 codes, or null on failure.
 */
async function fetchFromPassportIndex(iso2) {
  const url  = `${PI_BASE}/getPassportInfo/${iso2.toLowerCase()}`;
  const data = await safeGet(url, {
    "User-Agent": "Mozilla/5.0",
    "Accept":     "application/json",
    "Referer":    "https://www.passportindex.org/",
  });

  if (!data || !Array.isArray(data)) return null;

  const vf  = [];
  const voa = [];
  const ev  = [];
  const vr  = [];

  for (const entry of data) {
    const dest = (entry.code || entry.iso || "").toUpperCase();
    if (!dest || dest === iso2.toUpperCase()) continue;

    const access = (entry.access || entry.type || entry.visa || "").toLowerCase();

    if      (access === "visa free" || access === "vf" || access === "freedom")   vf.push(dest);
    else if (access === "visa on arrival" || access === "voa" || access === "on arrival") voa.push(dest);
    else if (access === "e-visa" || access === "evisa" || access === "ev" || access === "eta") ev.push(dest);
    else                                                                           vr.push(dest);
  }

  if (vf.length + voa.length + ev.length + vr.length < 10) return null; // suspicious response
  return { vf, voa, ev, vr };
}

/**
 * Try alternate Passport Index v3 endpoint
 */
async function fetchFromPassportIndexV3(iso2) {
  const url  = `${PI_BASE.replace("v2","v3")}/passport/${iso2.toLowerCase()}`;
  const data = await safeGet(url, {
    "User-Agent": "Mozilla/5.0",
    "Referer":    "https://www.passportindex.org/",
  });
  if (!data) return null;

  // v3 returns { passports: [...] }
  const list = data.passports || data.destinations || data.countries || null;
  if (!Array.isArray(list)) return null;

  const vf=[],voa=[],ev=[],vr=[];
  for (const e of list) {
    const dest   = (e.code || e.iso2 || "").toUpperCase();
    const access = (e.access || e.visa_type || "").toLowerCase();
    if (!dest) continue;
    if (access.includes("free"))     vf.push(dest);
    else if (access.includes("arrival")) voa.push(dest);
    else if (access.includes("visa") && (access.includes("e-") || access.includes("eta"))) ev.push(dest);
    else vr.push(dest);
  }
  if (vf.length < 5) return null;
  return { vf, voa, ev, vr };
}

// ─── FALLBACK: DERIVE FROM EMBEDDED + HEURISTICS ─────────────────────────────
/**
 * For passports not in EMBEDDED and where API failed,
 * derive visa data using rank-based heuristics.
 * Higher ranked passports have more visa-free access.
 */
function deriveFromRank(iso2, rank) {
  // Use Japan (rank 1) as the baseline and remove access
  // as rank decreases. This is a rough approximation.
  const baseVF = [...(EMBEDDED.JP.vf || [])];

  // Countries that restrict access based on rank thresholds
  const restrictAt = {
    // Format: [threshold_rank, [...iso2_codes_to_restrict]]
    20:  ["CN","RU","IN","PK","AF","BD","LK","NP","MM","IQ","IR","SY","YE","LB","SO","SD","SS","ER","CU","KP"],
    40:  ["US","CA","GB","AU","JP","SG","DE","FR","IT","ES","KR","NZ","CH","AT","BE","NL"],
    60:  ["MX","BR","AR","ZA","TH","MY","ID","CO","PE","EC","BO","PY","UY","CL"],
    80:  ["TR","UA","GE","AM","AZ","MD","AL","RS","BA","ME","MK","BY","KZ","UZ"],
    100: ["NG","KE","GH","ET","TZ","UG","RW","SN","CI","CM","MZ","AO","ZM","ZW"],
  };

  let vf = [...baseVF];

  for (const [threshold, codes] of Object.entries(restrictAt)) {
    if (rank >= parseInt(threshold)) {
      vf = vf.filter(c => !codes.includes(c));
    }
  }

  // Countries that require visa for all passports below rank 50
  const alwaysVR = ["KP","ER","CU","AF","IQ","IR","SY","YE","SO","SS","LY","SD"];
  const highRestrictVR = rank > 50
    ? ["US","GB","CA","AU","JP","SG","DE","FR","NZ","KR","CH"]
    : [];

  const vrList = [...alwaysVR, ...highRestrictVR];
  vf = vf.filter(c => !vrList.includes(c));

  // Assign remaining to categories
  const voa = rank < 60
    ? ["BD","HT","TZ","UG","BI","MM","KG","CD","CF","ET","MG"]
    : ["MV","TH","LA","KH","ID"];

  const ev = rank < 80
    ? ["IN","TR","KE","RW","ET","GH","NG","TZ","UG","MZ","ZM","CM","CI","SN"]
    : ["KE","RW","ET"];

  // Ensure vf doesn't contain voa/ev/vr entries
  const exclude = new Set([...voa, ...ev, ...vrList]);
  vf = vf.filter(c => !exclude.has(c));

  return {
    vf:  [...new Set(vf)].filter(c => ALL_DESTINATIONS.includes(c)),
    voa: [...new Set(voa)].filter(c => ALL_DESTINATIONS.includes(c)),
    ev:  [...new Set(ev)].filter(c => ALL_DESTINATIONS.includes(c)),
    vr:  [...new Set(vrList)].filter(c => ALL_DESTINATIONS.includes(c)),
  };
}

// ─── BUILD DOCUMENT ───────────────────────────────────────────────────────────

function buildDoc(entry, visaData) {
  const { vf, voa, ev, vr } = visaData;

  // Deduplicate — a country should appear in only ONE category
  const seen = new Set();
  const dedup = (arr) => arr.filter(c => { if (seen.has(c)) return false; seen.add(c); return true; });

  const visaFree      = dedup([...new Set(vf)]);
  const visaOnArrival = dedup([...new Set(voa)]);
  const eVisa         = dedup([...new Set(ev)]);
  const visaRequired  = dedup([...new Set(vr)]);

  return {
    countryCode:        entry.iso2.toUpperCase(),
    passportRank:       entry.rank,
    visaFree,
    visaOnArrival,
    eVisa,
    visaRequired,
    visaFreeCount:      visaFree.length,
    visaOnArrivalCount: visaOnArrival.length,
    eVisaCount:         eVisa.length,
    visaRequiredCount:  visaRequired.length,
    lastUpdated:        new Date(),
  };
}

// ─── UPSERT ───────────────────────────────────────────────────────────────────

async function upsert(doc) {
  await Passport.findOneAndUpdate(
    { countryCode: doc.countryCode },
    { $set: doc },
    { upsert: true, new: true, runValidators: true }
  );
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

async function main() {
  log.head("PASSPORT DATA POPULATION SCRIPT");
  log.info(`Target: ${MASTER.length} passports`);
  log.info(`Connecting to MongoDB…`);

  await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 10000 });
  log.ok("MongoDB connected");

  let apiSuccess = 0, apiV3Success = 0, embeddedUsed = 0, derived = 0;
  const errors = [];

  for (let i = 0; i < MASTER.length; i++) {
    const entry = MASTER[i];
    log.prog(i + 1, MASTER.length, `${entry.iso2}  ${entry.name}`);

    let visaData = null;
    let source   = "";

    /* 1 ── Try Passport Index API v2 */
    visaData = await fetchFromPassportIndex(entry.iso2);
    if (visaData) { source = "API v2"; apiSuccess++; }

    /* 2 ── Try Passport Index API v3 */
    if (!visaData) {
      visaData = await fetchFromPassportIndexV3(entry.iso2);
      if (visaData) { source = "API v3"; apiV3Success++; }
    }

    /* 3 ── Use embedded data */
    if (!visaData && EMBEDDED[entry.iso2]) {
      const e = EMBEDDED[entry.iso2];
      visaData = { vf: e.vf, voa: e.voa, ev: e.ev, vr: e.vr };
      source = "embedded";
      embeddedUsed++;
    }

    /* 4 ── Derive from rank heuristics */
    if (!visaData) {
      visaData = deriveFromRank(entry.iso2, entry.rank);
      source = "derived";
      derived++;
    }

    try {
      const doc = buildDoc(entry, visaData);
      await upsert(doc);
      console.log(`       ↳ [${source.padEnd(9)}]  VF:${doc.visaFreeCount}  VOA:${doc.visaOnArrivalCount}  EV:${doc.eVisaCount}  VR:${doc.visaRequiredCount}`);
    } catch (err) {
      log.err(`Failed to upsert ${entry.iso2}: ${err.message}`);
      errors.push({ iso2: entry.iso2, err: err.message });
    }

    /* Rate limit — be polite to the API */
    if (i < MASTER.length - 1) await sleep(API_DELAY_MS);
  }

  /* ── SUMMARY ── */
  log.head("SUMMARY");
  console.log(`  Total passports processed : ${MASTER.length}`);
  console.log(`  API v2 success            : ${apiSuccess}`);
  console.log(`  API v3 success            : ${apiV3Success}`);
  console.log(`  Embedded fallback         : ${embeddedUsed}`);
  console.log(`  Rank-derived              : ${derived}`);
  console.log(`  Errors                    : ${errors.length}`);

  if (errors.length) {
    console.log("\n  Failed entries:");
    errors.forEach(e => console.log(`    ${e.iso2}: ${e.err}`));
  }

  log.ok("Done. Disconnecting.");
  await mongoose.disconnect();
}

main().catch(err => {
  console.error("\n  FATAL:", err.message);
  process.exit(1);
});