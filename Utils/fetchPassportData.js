const axios = require("axios");
const mongoose = require("mongoose");
const Passport = require("../Model/Passport");

// Sources (both free, no key):
//  - ilyankou/passport-index-dataset — tidy CSV of every passport→destination
//    visa requirement (visa free / N days / visa on arrival / e-visa / eta /
//    visa required / no admission).
//  - mledoze/countries — used to resolve each ISO2 code to a name, ISO3 and
//    region (for the passport's own `region` field and the destination
//    region breakdown in `accessByRegion`).
//
// passportRank / strengthScore / tier are DERIVED here from the visa matrix
// itself (mobility score = visaFree + visaOnArrival + eVisa counts), not
// pulled from a separately curated table, so they always match the data
// that was just fetched.
//
// NOT populated by this refresh (no free source / needs history this
// dataset doesn't provide): visaFreeGrowth, visaFreeChange, visaLost,
// rankTrend, rankChange, rankHistory, passport document metadata
// (validity/cost/processing days/biometric chip), dual citizenship &
// sanctions fields.

function regionKeyFor(mledozeRegion, mledozeSubregion) {
  if (mledozeSubregion === "Western Asia") return "middleEast";
  const map = { Africa: "africa", Americas: "americas", Asia: "asia", Europe: "europe", Oceania: "oceania" };
  return map[mledozeRegion] ?? null;
}

function passportRegionEnum(mledozeRegion, mledozeSubregion) {
  if (mledozeSubregion === "Western Asia") return "Middle East";
  if (["Africa", "Americas", "Asia", "Europe", "Oceania"].includes(mledozeRegion)) return mledozeRegion;
  return "Other";
}

async function fetchPassportData() {

  const [countriesRes, csvRes] = await Promise.all([
    axios.get(process.env.COUNTRIES_DATASET_URL, { timeout: 20000 }),
    axios.get(process.env.PASSPORT_INDEX_DATASET_URL, { timeout: 20000 }),
  ]);

  const countries = countriesRes.data;
  if (!Array.isArray(countries)) {
    throw new Error("Countries dataset did not return a list.");
  }

  // ISO2 -> { name, iso3, region enum, regionKey for accessByRegion }
  const lookup = {};
  for (const c of countries) {
    if (!c.cca2) continue;
    lookup[c.cca2] = {
      name: c.name?.common ?? c.cca2,
      iso3: c.cca3 ?? "",
      regionEnum: passportRegionEnum(c.region, c.subregion),
      regionKey: regionKeyFor(c.region, c.subregion),
    };
  }

  const rows = String(csvRes.data).split("\n").slice(1);

  // countryCode -> { visaFree: [{code,maxStay}], visaOnArrival: [], eVisa: [], visaRequired: [] }
  const byPassport = {};

  for (const row of rows) {
    const [passport, destination, requirement] = row.split(",").map(s => s?.trim());
    if (!passport || !destination || !requirement) continue;
    if (passport === destination) continue; // "-1" self rows

    if (!byPassport[passport]) {
      byPassport[passport] = { visaFree: [], visaOnArrival: [], eVisa: [], visaRequired: [] };
    }

    const bucket = byPassport[passport];
    const asNumber = Number(requirement);

    if (requirement === "visa free" || (!Number.isNaN(asNumber) && asNumber >= 0)) {
      bucket.visaFree.push({ code: destination, maxStay: Number.isNaN(asNumber) ? null : asNumber });
    } else if (requirement === "eta") {
      // Electronic Travel Authorization — treated as visa-free equivalent
      // (common convention: no visa is actually issued).
      bucket.visaFree.push({ code: destination, maxStay: null });
    } else if (requirement === "visa on arrival") {
      bucket.visaOnArrival.push(destination);
    } else if (requirement === "e-visa") {
      bucket.eVisa.push(destination);
    } else {
      // "visa required" and "no admission" both mean no unhindered access.
      bucket.visaRequired.push(destination);
    }
  }

  // ── Compute mobility score per passport, then rank/tier/strength ─────────
  const scored = Object.entries(byPassport).map(([code, v]) => ({
    code,
    mobilityScore: v.visaFree.length + v.visaOnArrival.length + v.eVisa.length,
  }));
  scored.sort((a, b) => b.mobilityScore - a.mobilityScore);

  const maxScore = scored[0]?.mobilityScore || 1;
  const totalCount = scored.length;

  const rankByCode = {};
  const tierByCode = {};
  const strengthByCode = {};

  scored.forEach((entry, i) => {
    // Competition ranking: ties share a rank.
    const rank = 1 + scored.filter(s => s.mobilityScore > entry.mobilityScore).length;
    rankByCode[entry.code] = rank;
    strengthByCode[entry.code] = Math.round((entry.mobilityScore / maxScore) * 100);

    const percentile = rank / totalCount;
    tierByCode[entry.code] =
      percentile <= 0.15 ? "S" :
      percentile <= 0.30 ? "A" :
      percentile <= 0.50 ? "B" :
      percentile <= 0.70 ? "C" :
      percentile <= 0.90 ? "D" : "E";
  });

  // ── Write ──────────────────────────────────────────────────────────────
  let updated = 0;

  for (const [code, v] of Object.entries(byPassport)) {
    const info = lookup[code];

    const accessByRegion = { europe: 0, asia: 0, americas: 0, africa: 0, oceania: 0, middleEast: 0 };
    for (const dest of v.visaFree) {
      const key = lookup[dest.code]?.regionKey;
      if (key) accessByRegion[key]++;
    }

    const update = {
      countryCode: code,
      countryName: info?.name ?? code,
      iso3: info?.iso3 ?? "",
      region: info?.regionEnum ?? "Other",

      passportRank: rankByCode[code],
      tier: tierByCode[code],
      strengthScore: strengthByCode[code],

      visaFree: v.visaFree.map(d => d.code),
      visaOnArrival: v.visaOnArrival,
      eVisa: v.eVisa,
      visaRequired: v.visaRequired,

      visaFreeCount: v.visaFree.length,
      visaOnArrivalCount: v.visaOnArrival.length,
      eVisaCount: v.eVisa.length,
      visaRequiredCount: v.visaRequired.length,
      totalDestinations: v.visaFree.length + v.visaOnArrival.length + v.eVisa.length + v.visaRequired.length,

      visaFreeDetailed: v.visaFree,
      accessByRegion,

      lastUpdated: new Date(),
      dataSource: "derived",
      notes: "Derived from ilyankou/passport-index-dataset. rank/tier/strengthScore computed from this run's visa-free+on-arrival+e-visa mobility count.",
    };

    await Passport.updateOne({ countryCode: code }, { $set: update }, { upsert: true });
    updated++;
  }

  console.log("Passport data updated:", updated);

  return { updated, total: Object.keys(byPassport).length };
}

module.exports = fetchPassportData;

if (require.main === module) {
  require("dotenv").config();
  require("./database")();
  mongoose.connection.once("open", () => {
    fetchPassportData()
      .then((summary) => { console.log(summary); process.exit(0); })
      .catch((err) => { console.error("Fatal:", err); process.exit(1); });
  });
}
