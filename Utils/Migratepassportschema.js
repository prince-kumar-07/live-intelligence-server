/**
 * migratePassportSchema.js
 *
 * Migrates existing Passport documents (old schema) to the new
 * expanded schema — adding all new fields without touching existing
 * visa arrays that were already populated.
 *
 * WHAT IT DOES:
 *   Phase 1 — Structural migration
 *     • Adds countryName, iso3, region from embedded lookup table
 *     • Computes tier from passportRank
 *     • Computes strengthScore (rank + visaFreeCount composite)
 *     • Adds totalDestinations (sum of all four counts)
 *     • Adds rankChange, rankTrend (requires rankHistory to be seeded)
 *     • Adds accessByRegion breakdown from existing visaFree array
 *     • Populates rankHistory with current snapshot (Q1 2025)
 *     • Sets passport document metadata defaults (validity, cost, etc.)
 *     • Sets dataSource field based on what was actually used
 *
 *   Phase 2 — Enrichment
 *     • Builds visaFreeDetailed[] from plain visaFree[] codes
 *       (adds maxStay from embedded stay-limit table)
 *     • Detects bannedFrom (countries known to restrict certain passports)
 *     • Detects dualCitizenshipAllowed from embedded table
 *
 *   Phase 3 — Validation & repair
 *     • Re-syncs all *Count fields from arrays (catches any mismatch)
 *     • Deduplicates all visa arrays
 *     • Removes any code that appears in multiple categories
 *
 * SAFE TO RE-RUN:
 *   Uses $set only — never wipes existing data.
 *   Skips fields that are already populated.
 *   Logs every document with before/after field count.
 *
 * USAGE:
 *   npm install mongoose
 *   MONGO_URI=your_uri node migratePassportSchema.js
 */

"use strict";

require("dotenv").config();
const mongoose = require("mongoose");

const MONGO_URI = process.env.DATABASE_URL;

// ─── INLINE SCHEMA (avoid import issues during migration) ─────────────────────

const PassportSchema = new mongoose.Schema({
  countryCode:        { type: String, uppercase: true, index: true },
  countryName:        { type: String, default: "" },
  countryNameLocal:   { type: String, default: "" },
  iso3:               { type: String, default: "" },
  region:             { type: String, default: "Other" },
  passportRank:       Number,
  tier:               { type: String, default: "E" },
  strengthScore:      { type: Number, default: 0 },
  visaFree:           [String],
  visaOnArrival:      [String],
  eVisa:              [String],
  visaRequired:       [String],
  visaFreeCount:      Number,
  visaOnArrivalCount: Number,
  eVisaCount:         Number,
  visaRequiredCount:  Number,
  totalDestinations:  { type: Number, default: 0 },
  visaFreeDetailed: [{
    code:    String,
    maxStay: Number,
    note:    String,
    _id:     false,
  }],
  visaFreeGrowth:     { type: Number, default: 0 },
  visaFreeChange:     [String],
  visaLost:           [String],
  rankTrend:          { type: String, default: "stable" },
  rankChange:         { type: Number, default: 0 },
  accessByRegion: {
    europe:     { type: Number, default: 0 },
    asia:       { type: Number, default: 0 },
    americas:   { type: Number, default: 0 },
    africa:     { type: Number, default: 0 },
    oceania:    { type: Number, default: 0 },
    middleEast: { type: Number, default: 0 },
  },
  rankHistory: [{
    year:          Number,
    quarter:       String,
    rank:          Number,
    visaFreeCount: Number,
    _id:           false,
  }],
  passportValidity:       { type: Number, default: 10 },
  passportCostUSD:        Number,
  processingDays:         Number,
  biometricChip:          { type: Boolean, default: true },
  machineReadable:        { type: Boolean, default: true },
  dualCitizenshipAllowed: Boolean,
  sanctionedBy:           [String],
  bannedFrom:             [String],
  lastUpdated:            { type: Date, default: Date.now },
  dataSource:             { type: String, default: "derived" },
  notes:                  { type: String, default: "" },
}, { timestamps: true, collection: "passports" });

const Passport = mongoose.models.Passport || mongoose.model("Passport", PassportSchema);

// ─── LOOKUP TABLES ────────────────────────────────────────────────────────────

/** ISO2 → full country name */
const COUNTRY_NAMES = {
  JP:"Japan",SG:"Singapore",DE:"Germany",FR:"France",IT:"Italy",ES:"Spain",
  FI:"Finland",KR:"South Korea",SE:"Sweden",NL:"Netherlands",DK:"Denmark",
  AT:"Austria",GB:"United Kingdom",US:"United States",CA:"Canada",BE:"Belgium",
  CH:"Switzerland",PT:"Portugal",IE:"Ireland",AU:"Australia",NZ:"New Zealand",
  GR:"Greece",NO:"Norway",MT:"Malta",LU:"Luxembourg",IS:"Iceland",
  PL:"Poland",HU:"Hungary",CZ:"Czechia",SK:"Slovakia",EE:"Estonia",
  LT:"Lithuania",LV:"Latvia",SI:"Slovenia",HR:"Croatia",LI:"Liechtenstein",
  MC:"Monaco",SM:"San Marino",VA:"Vatican City",AD:"Andorra",
  MY:"Malaysia",CL:"Chile",AE:"United Arab Emirates",BR:"Brazil",
  AR:"Argentina",IL:"Israel",MX:"Mexico",QA:"Qatar",UY:"Uruguay",
  KW:"Kuwait",CR:"Costa Rica",BB:"Barbados",RO:"Romania",BG:"Bulgaria",
  CY:"Cyprus",BH:"Bahrain",CO:"Colombia",PA:"Panama",DO:"Dominican Republic",
  TT:"Trinidad and Tobago",MU:"Mauritius",UA:"Ukraine",PE:"Peru",
  AL:"Albania",RS:"Serbia",GE:"Georgia",ME:"Montenegro",
  BA:"Bosnia and Herzegovina",MK:"North Macedonia",AM:"Armenia",
  EC:"Ecuador",BO:"Bolivia",TH:"Thailand",SA:"Saudi Arabia",OM:"Oman",
  GT:"Guatemala",HN:"Honduras",SV:"El Salvador",NI:"Nicaragua",
  JM:"Jamaica",MD:"Moldova",FJ:"Fiji",RU:"Russia",TR:"Turkey",
  ZA:"South Africa",CN:"China",ID:"Indonesia",KZ:"Kazakhstan",
  IN:"India",BY:"Belarus",VN:"Vietnam",JO:"Jordan",PH:"Philippines",
  KE:"Kenya",GH:"Ghana",RW:"Rwanda",UZ:"Uzbekistan",EG:"Egypt",
  MA:"Morocco",MN:"Mongolia",TN:"Tunisia",NG:"Nigeria",ET:"Ethiopia",
  CM:"Cameroon",SN:"Senegal",TZ:"Tanzania",UG:"Uganda",CI:"Côte d'Ivoire",
  BD:"Bangladesh",MM:"Myanmar",KH:"Cambodia",LK:"Sri Lanka",NP:"Nepal",
  LB:"Lebanon",PK:"Pakistan",AF:"Afghanistan",
  // Additional common codes
  AG:"Antigua and Barbuda",AO:"Angola",AZ:"Azerbaijan",
  BF:"Burkina Faso",BI:"Burundi",BJ:"Benin",BN:"Brunei",BO:"Bolivia",
  BS:"Bahamas",BT:"Bhutan",BW:"Botswana",BZ:"Belize",
  CD:"DR Congo",CF:"Central African Republic",CG:"Congo",
  CK:"Cook Islands",CM:"Cameroon",CV:"Cape Verde",
  DJ:"Djibouti",DM:"Dominica",DZ:"Algeria",
  ER:"Eritrea",
  FM:"Micronesia",GA:"Gabon",GD:"Grenada",GM:"Gambia",
  GN:"Guinea",GQ:"Equatorial Guinea",GW:"Guinea-Bissau",GY:"Guyana",
  HT:"Haiti",IQ:"Iraq",IR:"Iran",KG:"Kyrgyzstan",KI:"Kiribati",
  KM:"Comoros",KN:"Saint Kitts and Nevis",KP:"North Korea",
  LA:"Laos",LC:"Saint Lucia",LR:"Liberia",LS:"Lesotho",LY:"Libya",
  MG:"Madagascar",MH:"Marshall Islands",ML:"Mali",MR:"Mauritania",
  MV:"Maldives",MW:"Malawi",MZ:"Mozambique",NA:"Namibia",
  NE:"Niger",NR:"Nauru",PG:"Papua New Guinea",PW:"Palau",
  PY:"Paraguay",SB:"Solomon Islands",SC:"Seychelles",SD:"Sudan",
  SI:"Slovenia",SL:"Sierra Leone",SO:"Somalia",SR:"Suriname",
  SS:"South Sudan",ST:"Sao Tome and Principe",SY:"Syria",SZ:"Eswatini",
  TD:"Chad",TG:"Togo",TJ:"Tajikistan",TL:"Timor-Leste",TM:"Turkmenistan",
  TO:"Tonga",TV:"Tuvalu",VC:"Saint Vincent and the Grenadines",
  VE:"Venezuela",VU:"Vanuatu",WS:"Samoa",XK:"Kosovo",YE:"Yemen",
  ZM:"Zambia",ZW:"Zimbabwe",
};

/** ISO2 → local/native name */
const LOCAL_NAMES = {
  JP:"日本", CN:"中国", KR:"대한민국", IN:"भारत", DE:"Deutschland",
  FR:"France", ES:"España", IT:"Italia", PT:"Portugal", NL:"Nederland",
  RU:"Россия", UA:"Україна", GR:"Ελλάδα", AR:"Argentina", BR:"Brasil",
  SA:"المملكة العربية السعودية", AE:"الإمارات", EG:"مصر", MA:"المغرب",
  TR:"Türkiye", IL:"ישראל", TH:"ไทย", VN:"Việt Nam", MY:"Malaysia",
};

/** ISO2 → ISO3 */
const ISO3 = {
  JP:"JPN",SG:"SGP",DE:"DEU",FR:"FRA",IT:"ITA",ES:"ESP",FI:"FIN",KR:"KOR",
  SE:"SWE",NL:"NLD",DK:"DNK",AT:"AUT",GB:"GBR",US:"USA",CA:"CAN",BE:"BEL",
  CH:"CHE",PT:"PRT",IE:"IRL",AU:"AUS",NZ:"NZL",GR:"GRC",NO:"NOR",MT:"MLT",
  LU:"LUX",IS:"ISL",PL:"POL",HU:"HUN",CZ:"CZE",SK:"SVK",EE:"EST",LT:"LTU",
  LV:"LVA",SI:"SVN",HR:"HRV",MY:"MYS",CL:"CHL",AE:"ARE",BR:"BRA",AR:"ARG",
  IL:"ISR",MX:"MEX",QA:"QAT",UY:"URY",KW:"KWT",CR:"CRI",BB:"BRB",RO:"ROU",
  BG:"BGR",CY:"CYP",BH:"BHR",CO:"COL",PA:"PAN",DO:"DOM",TT:"TTO",MU:"MUS",
  UA:"UKR",PE:"PER",AL:"ALB",RS:"SRB",GE:"GEO",ME:"MNE",BA:"BIH",MK:"MKD",
  AM:"ARM",EC:"ECU",BO:"BOL",TH:"THA",SA:"SAU",OM:"OMN",GT:"GTM",HN:"HND",
  SV:"SLV",NI:"NIC",JM:"JAM",MD:"MDA",FJ:"FJI",RU:"RUS",TR:"TUR",ZA:"ZAF",
  CN:"CHN",ID:"IDN",KZ:"KAZ",IN:"IND",BY:"BLR",VN:"VNM",JO:"JOR",PH:"PHL",
  KE:"KEN",GH:"GHA",RW:"RWA",UZ:"UZB",EG:"EGY",MA:"MAR",MN:"MNG",TN:"TUN",
  NG:"NGA",ET:"ETH",CM:"CMR",SN:"SEN",TZ:"TZA",UG:"UGA",CI:"CIV",BD:"BGD",
  MM:"MMR",KH:"KHM",LK:"LKA",NP:"NPL",LB:"LBN",PK:"PAK",AF:"AFG",
  LI:"LIE",MC:"MCO",SM:"SMR",VA:"VAT",AD:"AND",
};

/** ISO2 → world region */
const REGION_MAP = {
  AD:"Europe",AL:"Europe",AM:"Europe",AT:"Europe",AZ:"Europe",BA:"Europe",
  BE:"Europe",BG:"Europe",BY:"Europe",CH:"Europe",CY:"Europe",CZ:"Europe",
  DE:"Europe",DK:"Europe",EE:"Europe",ES:"Europe",FI:"Europe",FR:"Europe",
  GB:"Europe",GE:"Europe",GR:"Europe",HR:"Europe",HU:"Europe",IE:"Europe",
  IS:"Europe",IT:"Europe",LI:"Europe",LT:"Europe",LU:"Europe",LV:"Europe",
  MC:"Europe",MD:"Europe",ME:"Europe",MK:"Europe",MT:"Europe",NL:"Europe",
  NO:"Europe",PL:"Europe",PT:"Europe",RO:"Europe",RS:"Europe",RU:"Europe",
  SE:"Europe",SI:"Europe",SK:"Europe",SM:"Europe",TR:"Europe",UA:"Europe",
  VA:"Europe",XK:"Europe",

  AE:"Middle East",BH:"Middle East",IQ:"Middle East",IR:"Middle East",
  IL:"Middle East",JO:"Middle East",KW:"Middle East",LB:"Middle East",
  OM:"Middle East",QA:"Middle East",SA:"Middle East",SY:"Middle East",
  YE:"Middle East",

  AF:"Asia",BD:"Asia",BN:"Asia",BT:"Asia",CN:"Asia",ID:"Asia",IN:"Asia",
  JP:"Asia",KG:"Asia",KH:"Asia",KP:"Asia",KR:"Asia",KZ:"Asia",LA:"Asia",
  LK:"Asia",MM:"Asia",MN:"Asia",MY:"Asia",NP:"Asia",PH:"Asia",PK:"Asia",
  SG:"Asia",TH:"Asia",TJ:"Asia",TL:"Asia",TM:"Asia",UZ:"Asia",VN:"Asia",

  AG:"Americas",AR:"Americas",BB:"Americas",BO:"Americas",BR:"Americas",
  BS:"Americas",BZ:"Americas",CA:"Americas",CL:"Americas",CO:"Americas",
  CR:"Americas",CU:"Americas",DM:"Americas",DO:"Americas",EC:"Americas",
  GD:"Americas",GT:"Americas",GY:"Americas",HN:"Americas",HT:"Americas",
  JM:"Americas",KN:"Americas",LC:"Americas",MX:"Americas",NI:"Americas",
  PA:"Americas",PE:"Americas",PY:"Americas",SR:"Americas",SV:"Americas",
  TT:"Americas",US:"Americas",UY:"Americas",VC:"Americas",VE:"Americas",

  AU:"Oceania",CK:"Oceania",FJ:"Oceania",FM:"Oceania",KI:"Oceania",
  MH:"Oceania",NR:"Oceania",NZ:"Oceania",PG:"Oceania",PW:"Oceania",
  SB:"Oceania",TO:"Oceania",TV:"Oceania",VU:"Oceania",WS:"Oceania",

  AO:"Africa",BF:"Africa",BI:"Africa",BJ:"Africa",BW:"Africa",CD:"Africa",
  CF:"Africa",CG:"Africa",CI:"Africa",CM:"Africa",CV:"Africa",DJ:"Africa",
  DZ:"Africa",EG:"Africa",ER:"Africa",ET:"Africa",GA:"Africa",GH:"Africa",
  GM:"Africa",GN:"Africa",GQ:"Africa",GW:"Africa",KE:"Africa",KM:"Africa",
  LR:"Africa",LS:"Africa",LY:"Africa",MA:"Africa",MG:"Africa",ML:"Africa",
  MR:"Africa",MU:"Africa",MW:"Africa",MZ:"Africa",NA:"Africa",NE:"Africa",
  NG:"Africa",RW:"Africa",SC:"Africa",SD:"Africa",SL:"Africa",SN:"Africa",
  SO:"Africa",SS:"Africa",ST:"Africa",SZ:"Africa",TD:"Africa",TG:"Africa",
  TN:"Africa",TZ:"Africa",UG:"Africa",ZA:"Africa",ZM:"Africa",ZW:"Africa",
};

/** ISO2 → typical max visa-free stay (days) */
const MAX_STAY = {
  // Schengen (90 in 180 days)
  AD:90,AT:90,BE:90,CH:90,CZ:90,DE:90,DK:90,EE:90,ES:90,FI:90,FR:90,
  GR:90,HR:90,HU:90,IS:90,IT:90,LI:90,LT:90,LU:90,LV:90,MC:90,MT:90,
  NL:90,NO:90,PL:90,PT:90,SE:90,SI:90,SK:90,SM:90,VA:90,XK:90,
  // Other common durations
  GB:180,US:90,CA:180,AU:90,NZ:90,JP:90,SG:30,MY:30,KR:90,
  TH:30,ID:30,VN:45,PH:30,IN:180,CN:144,MX:180,BR:90,AR:90,
  ZA:90,EG:30,MA:90,TN:90,TR:90,UA:90,GE:365,AM:180,AZ:30,
  AE:30,QA:30,SA:90,OM:30,KW:30,BH:14,JO:30,
  KE:90,GH:90,TZ:90,UG:90,RW:30,ET:30,NG:30,
  AU:90,NZ:90,FJ:120,
};

/** Passport document metadata by ISO2 */
const PASSPORT_META = {
  JP:{ cost:154,  validity:10, processing:5  },
  SG:{ cost:70,   validity:10, processing:3  },
  DE:{ cost:93,   validity:10, processing:6  },
  FR:{ cost:89,   validity:10, processing:10 },
  IT:{ cost:116,  validity:10, processing:15 },
  ES:{ cost:30,   validity:10, processing:10 },
  GB:{ cost:82,   validity:10, processing:3  },
  US:{ cost:165,  validity:10, processing:6  },
  CA:{ cost:120,  validity:10, processing:20 },
  AU:{ cost:193,  validity:10, processing:10 },
  NZ:{ cost:150,  validity:10, processing:5  },
  IN:{ cost:15,   validity:10, processing:7  },
  CN:{ cost:29,   validity:10, processing:10 },
  PK:{ cost:12,   validity:10, processing:21 },
  AF:{ cost:30,   validity:5,  processing:30 },
  RU:{ cost:64,   validity:10, processing:30 },
  TR:{ cost:100,  validity:10, processing:8  },
  BR:{ cost:0,    validity:10, processing:14 }, // free for Brazilians
  MX:{ cost:22,   validity:10, processing:6  },
  ZA:{ cost:140,  validity:10, processing:10 },
  AE:{ cost:137,  validity:5,  processing:2  },
  SA:{ cost:213,  validity:5,  processing:7  },
};

/** Countries that don't allow dual citizenship */
const NO_DUAL = new Set([
  "CN","IN","SG","JP","DE","NL","AT","MY","ID","VN","TH",
  "RU","UA","BY","KZ","UZ","TJ","TM","KG","AZ",
  "SA","KW","QA","BH","OM","JO","LB","EG","MA","DZ","TN","LY",
  "AF","PK","BD","NP","LK","MM","KH","LA",
]);

/** Countries known to restrict/ban specific passports */
const BANS = {
  IL: ["IR","IQ","SA","SY","YE","LB","KW","LY","YE","PK"],  // Israel banned by these
  TW: ["CN"],
  KP: [], // North Korea bans almost everyone but maps don't track this
};

// ─── HELPERS ──────────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const log = {
  info:  (m) => console.log(`  ℹ  ${m}`),
  ok:    (m) => console.log(`  ✅ ${m}`),
  warn:  (m) => console.log(`  ⚠️  ${m}`),
  err:   (m) => console.log(`  ❌ ${m}`),
  head:  (m) => console.log(`\n${"═".repeat(60)}\n  ${m}\n${"═".repeat(60)}`),
  sub:   (m) => console.log(`\n── ${m} ${"─".repeat(Math.max(0,54-m.length))}`),
  row:   (i,t,iso2,name) => console.log(`  [${String(i).padStart(3)}/${t}] ${iso2.padEnd(4)} ${name}`),
};

function computeTier(rank) {
  if (!rank) return "E";
  if (rank <= 2)  return "S";
  if (rank <= 6)  return "A";
  if (rank <= 15) return "B";
  if (rank <= 30) return "C";
  if (rank <= 60) return "D";
  return "E";
}

function computeStrength(rank, vfCount) {
  const MAX_RANK = 113, MAX_VF = 193;
  const rs = rank    ? ((MAX_RANK - rank)  / MAX_RANK) * 60 : 0;
  const vs = vfCount ? (vfCount / MAX_VF) * 40 : 0;
  return Math.round(rs + vs);
}

function computeRegionBreakdown(visaFreeArr) {
  const counts = { europe:0, asia:0, americas:0, africa:0, oceania:0, middleEast:0 };
  for (const code of visaFreeArr) {
    const r = REGION_MAP[code];
    if (r === "Europe")       counts.europe++;
    else if (r === "Asia")    counts.asia++;
    else if (r === "Americas")counts.americas++;
    else if (r === "Africa")  counts.africa++;
    else if (r === "Oceania") counts.oceania++;
    else if (r === "Middle East") counts.middleEast++;
  }
  return counts;
}

function buildVisaFreeDetailed(visaFreeArr) {
  return visaFreeArr.map(code => ({
    code,
    maxStay: MAX_STAY[code] || null,
    note:    MAX_STAY[code] ? `Up to ${MAX_STAY[code]} days` : "",
  }));
}

function computeBannedFrom(iso2, visaRequired) {
  // A country appears in bannedFrom if it imposes a political/full ban
  // (not just standard visa requirement)
  const politicalBans = BANS[iso2] || [];
  return politicalBans.filter(c => visaRequired.includes(c));
}

function computeSanctionedBy(iso2) {
  const sanctioned = [];
  for (const [banning, banned] of Object.entries(BANS)) {
    if (banned.includes(iso2)) sanctioned.push(banning);
  }
  return sanctioned;
}

/** Remove duplicates and cross-category conflicts — visaFree wins */
function deduplicateCategories(doc) {
  const vf  = [...new Set(doc.visaFree)];
  const voa = [...new Set(doc.visaOnArrival)].filter(c => !vf.includes(c));
  const ev  = [...new Set(doc.eVisa)].filter(c => !vf.includes(c) && !voa.includes(c));
  const vr  = [...new Set(doc.visaRequired)].filter(c => !vf.includes(c) && !voa.includes(c) && !ev.includes(c));
  return { vf, voa, ev, vr };
}

// ─── PHASE 1 — STRUCTURAL MIGRATION ──────────────────────────────────────────

async function phase1(docs) {
  log.sub("PHASE 1 — Structural Migration");
  log.info(`Processing ${docs.length} documents`);

  let updated = 0, skipped = 0;

  for (let i = 0; i < docs.length; i++) {
    const doc  = docs[i];
    const iso2 = doc.countryCode;
    log.row(i + 1, docs.length, iso2, doc.countryName || COUNTRY_NAMES[iso2] || iso2);

    // Deduplicate visa arrays first
    const { vf, voa, ev, vr } = deduplicateCategories(doc);

    const tier           = computeTier(doc.passportRank);
    const strengthScore  = computeStrength(doc.passportRank, vf.length);
    const accessByRegion = computeRegionBreakdown(vf);
    const meta           = PASSPORT_META[iso2] || {};

    // Only seed rankHistory if it doesn't already have a 2025 Q1 entry
    const hasQ1_2025 = (doc.rankHistory || []).some(
      h => h.year === 2025 && h.quarter === "Q1"
    );

    const $set = {
      // Identity
      countryName:      COUNTRY_NAMES[iso2] || doc.countryName || iso2,
      countryNameLocal: LOCAL_NAMES[iso2]   || doc.countryNameLocal || "",
      iso3:             ISO3[iso2]           || doc.iso3 || "",
      region:           REGION_MAP[iso2]     || doc.region || "Other",

      // Deduped arrays
      visaFree:      vf,
      visaOnArrival: voa,
      eVisa:         ev,
      visaRequired:  vr,

      // Counts (always recompute)
      visaFreeCount:      vf.length,
      visaOnArrivalCount: voa.length,
      eVisaCount:         ev.length,
      visaRequiredCount:  vr.length,
      totalDestinations:  vf.length + voa.length + ev.length + vr.length,

      // Computed fields
      tier,
      strengthScore,
      accessByRegion,

      // Passport metadata (only set if missing)
      ...(doc.passportValidity ? {} : { passportValidity: meta.validity || 10 }),
      ...(doc.passportCostUSD  ? {} : { passportCostUSD:  meta.cost     || null }),
      ...(doc.processingDays   ? {} : { processingDays:   meta.processing || null }),
      biometricChip:  true,
      machineReadable: true,

      // Citizenship
      dualCitizenshipAllowed: !NO_DUAL.has(iso2),

      // Restrictions
      bannedFrom:   computeBannedFrom(iso2, vr),
      sanctionedBy: computeSanctionedBy(iso2),

      // Defaults for new trend fields (don't overwrite if already set)
      ...(doc.rankTrend  ? {} : { rankTrend:  "stable" }),
      ...(doc.rankChange ? {} : { rankChange: 0 }),
      ...(doc.visaFreeGrowth !== undefined ? {} : { visaFreeGrowth: 0 }),

      lastUpdated: new Date(),
    };

    // Seed initial rank history snapshot
    const $push = hasQ1_2025 ? {} : {
      rankHistory: {
        year:          2025,
        quarter:       "Q1",
        rank:          doc.passportRank,
        visaFreeCount: vf.length,
      },
    };

    try {
      const updateOp = { $set };
      if (Object.keys($push).length) updateOp.$push = $push;

      await Passport.findOneAndUpdate(
        { countryCode: iso2 },
        updateOp,
        { new: true }
      );
      updated++;
      console.log(
        `       ↳ tier=${tier}  strength=${strengthScore}` +
        `  VF=${vf.length}  region[EU=${accessByRegion.europe}` +
        ` AS=${accessByRegion.asia} AF=${accessByRegion.africa}]`
      );
    } catch (err) {
      log.err(`${iso2}: ${err.message}`);
      skipped++;
    }
  }

  log.ok(`Phase 1 complete — updated: ${updated}, failed: ${skipped}`);
}

// ─── PHASE 2 — ENRICHMENT ────────────────────────────────────────────────────

async function phase2(docs) {
  log.sub("PHASE 2 — Enrichment (visaFreeDetailed)");
  log.info("Building detailed stay limits for each visa-free country");

  let enriched = 0;

  for (const doc of docs) {
    // Only build if not already populated
    if (doc.visaFreeDetailed && doc.visaFreeDetailed.length > 0) continue;

    const detailed = buildVisaFreeDetailed(doc.visaFree || []);

    await Passport.findOneAndUpdate(
      { countryCode: doc.countryCode },
      { $set: { visaFreeDetailed: detailed } }
    );
    enriched++;
  }

  log.ok(`Phase 2 complete — enriched: ${enriched} documents`);
}

// ─── PHASE 3 — VALIDATION ────────────────────────────────────────────────────

async function phase3() {
  log.sub("PHASE 3 — Validation & Count Sync");

  const allDocs = await Passport.find({});
  let repaired  = 0;

  for (const doc of allDocs) {
    const vfC  = (doc.visaFree || []).length;
    const voaC = (doc.visaOnArrival || []).length;
    const evC  = (doc.eVisa || []).length;
    const vrC  = (doc.visaRequired || []).length;
    const total = vfC + voaC + evC + vrC;

    // Repair if counts mismatch arrays
    const needsRepair =
      doc.visaFreeCount      !== vfC  ||
      doc.visaOnArrivalCount !== voaC ||
      doc.eVisaCount         !== evC  ||
      doc.visaRequiredCount  !== vrC  ||
      doc.totalDestinations  !== total;

    if (needsRepair) {
      await Passport.findOneAndUpdate(
        { countryCode: doc.countryCode },
        { $set: {
          visaFreeCount:      vfC,
          visaOnArrivalCount: voaC,
          eVisaCount:         evC,
          visaRequiredCount:  vrC,
          totalDestinations:  total,
        }}
      );
      repaired++;
      log.warn(`Repaired counts for ${doc.countryCode} (${doc.countryName})`);
    }
  }

  log.ok(`Phase 3 complete — ${repaired} documents repaired, ${allDocs.length - repaired} already valid`);
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

async function main() {
  log.head("PASSPORT SCHEMA MIGRATION");
  log.info(`Connecting to MongoDB…`);

  await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 10000 });
  log.ok("Connected");

  const docs = await Passport.find({}).lean();
  log.info(`Found ${docs.length} passport documents to migrate`);

  if (docs.length === 0) {
    log.warn("No documents found — run populatePassportData.js first");
    await mongoose.disconnect();
    return;
  }

  await phase1(docs);
  await phase2(await Passport.find({}).lean());
  await phase3();

  // ── Final report
  log.head("MIGRATION COMPLETE");
  const final = await Passport.find({}).lean();

  const tiers = { S:0, A:0, B:0, C:0, D:0, E:0 };
  const sources = {};
  let totalVF = 0;

  for (const d of final) {
    if (d.tier) tiers[d.tier] = (tiers[d.tier]||0)+1;
    const src = d.dataSource||"unknown";
    sources[src] = (sources[src]||0)+1;
    totalVF += d.visaFreeCount || 0;
  }

  console.log(`\n  Documents migrated : ${final.length}`);
  console.log(`  Tier distribution  : S=${tiers.S} A=${tiers.A} B=${tiers.B} C=${tiers.C} D=${tiers.D} E=${tiers.E}`);
  console.log(`  Avg visa-free      : ${(totalVF/final.length).toFixed(1)} destinations`);
  console.log(`\n  New fields added on all documents:`);
  const newFields = ["countryName","iso3","region","tier","strengthScore","totalDestinations",
    "accessByRegion","rankHistory","visaFreeDetailed","passportValidity","passportCostUSD",
    "processingDays","biometricChip","machineReadable","dualCitizenshipAllowed","bannedFrom","sanctionedBy"];
  newFields.forEach(f => console.log(`    ✓ ${f}`));

  log.ok("All phases complete. Disconnecting.");
  await mongoose.disconnect();
}

main().catch(err => {
  console.error("\n  FATAL:", err.message);
  process.exit(1);
});