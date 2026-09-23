require("dotenv").config();
const mongoose = require("mongoose");
const axios    = require("axios");
const Country  = require("../Model/Country");

// ─── CONFIG ──────────────────────────────────────────────────────────────────

// Free / public API endpoints (values in .env)
const APIS = {
  // ITU Global Cybersecurity Index scores (2020 dataset — publicly available JSON mirror)
  ITU_GCI: process.env.ITU_GCI_URL,

  // NIST NVD - CVE counts per year (used to estimate breach/malware density)
  NVD_CVE: process.env.NVD_CVE_URL,

  // FIRST.org CSIRT directory - gives us which countries have national CSIRTs (trust indicator)
  FIRST_TEAMS: process.env.FIRST_TEAMS_URL,

  // Shodan country stats - open endpoint, no key needed for aggregate data
  SHODAN_STATS: process.env.SHODAN_STATS_URL,

  // PhishStats public CSV (phishing by country code)
  PHISH_STATS: process.env.PHISH_STATS_URL,

  // URLhaus abuse.ch - malware URLs by country
  URLHAUS: process.env.URLHAUS_URL,
};

// ─── HELPERS ─────────────────────────────────────────────────────────────────

/** Retry wrapper — tries up to `attempts` times with exponential back-off */
async function fetchWithRetry(fn, attempts = 3, delay = 1000) {
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i === attempts - 1) throw err;
      console.warn(`    ↳ retry ${i + 1}/${attempts - 1} after ${delay}ms`);
      await sleep(delay * (i + 1));
    }
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Safe GET — returns null on failure instead of throwing */
async function safeGet(url, opts = {}) {
  try {
    const res = await axios.get(url, { timeout: 12000, ...opts });
    return res.data;
  } catch {
    return null;
  }
}

// ─── DATA LOADERS ────────────────────────────────────────────────────────────

/**
 * ITU Global Cybersecurity Index
 * Returns Map<iso3 → score (0-100)>
 */
async function loadITUScores() {
  console.log("  → Loading ITU GCI scores...");
  const data = await safeGet(APIS.ITU_GCI);
  if (!data) {
    console.warn("  ✗ ITU GCI unavailable — will use null");
    return new Map();
  }

  const map = new Map();

  // The dataset has entries like { iso3: "USA", score: 100, rank: 1, ... }
  const rows = Array.isArray(data) ? data : data.data ?? [];
  for (const row of rows) {
    const iso3  = row.iso3 ?? row.ISO3 ?? row.country_iso3;
    const score = parseFloat(row.score ?? row.gci_score ?? row.value ?? 0);
    if (iso3 && !isNaN(score)) map.set(iso3.toUpperCase(), score);
  }

  console.log(`  ✓ ITU: ${map.size} countries loaded`);
  return map;
}

/**
 * FIRST.org CSIRT teams
 * Returns Set<iso2> of countries with a national CSIRT
 * (used as a binary signal: having CSIRT → better cyber posture → helps
 *  estimate cyberSecurityIndex when ITU data missing)
 */
async function loadFirstTeams() {
  console.log("  → Loading FIRST.org CSIRT teams...");
  const data = await safeGet(APIS.FIRST_TEAMS);
  if (!data) return new Set();

  const set = new Set();
  const teams = Array.isArray(data.data) ? data.data : Array.isArray(data.results) ? data.results : [];
  for (const team of teams) {
    const cc = team.country?.toUpperCase();
    if (cc) set.add(cc);
  }

  console.log(`  ✓ FIRST: ${set.size} countries with national CSIRT`);
  return set;
}

/**
 * URLhaus recent URLs
 * Returns Map<iso2 → malwareCount> (approximate, last ~1000 URLs)
 */
async function loadURLhausMalware() {
  console.log("  → Loading URLhaus malware data...");
  const data = await safeGet(APIS.URLHAUS);
  if (!data) return new Map();

  const map = new Map();
  const urls = data.urls ?? [];

  for (const entry of urls) {
    const cc = (entry.country_code ?? "").toUpperCase();
    if (!cc) continue;
    map.set(cc, (map.get(cc) ?? 0) + 1);
  }

  console.log(`  ✓ URLhaus: ${map.size} countries with malware data`);
  return map;
}

/**
 * PhishStats — fetch phishing count for ONE country code (rate-limit friendly)
 * Returns count or null
 */
async function fetchPhishCount(iso2) {
  const url = APIS.PHISH_STATS.replace("{CC}", iso2.toLowerCase());
  const data = await safeGet(url, { timeout: 5000 });
  if (!data || !Array.isArray(data)) return null;
  // The API returns matching rows — use count as proxy
  return data.length > 0 ? data[0]._count ?? data.length : 0;
}

// ─── ESTIMATION FALLBACKS ─────────────────────────────────────────────────────

/**
 * When a primary source is null, estimate from correlated data.
 *
 * cyberSecurityIndex fallback:
 *   - 75  if country has a CSIRT (FIRST member)
 *   - 40  otherwise
 *
 * dataBreaches fallback:
 *   - Derived from population size tier (larger country → more recorded breaches)
 *
 * malwareIncidents:
 *   - From URLhaus count (scaled ×1000 as proxy for broader incidents)
 *
 * phishingIncidents:
 *   - From PhishStats or estimated from internetUsers density
 *
 * ransomwareIncidents:
 *   - ~12-18% of malware incidents is a commonly cited ratio in threat reports
 */
function estimateCyberData(dbCountry, hasCsirt, urlhausCount) {
  const pop  = dbCountry.population ?? 10_000_000;
  const inet = dbCountry.infrastructure?.internetPenetration ?? 50;

  // Breach probability scales with internet penetration + population
  const breachBase = Math.round((pop / 1_000_000) * (inet / 100) * 2.4);

  // Malware: URLhaus is a tiny sample, scale up
  const malwareBase = urlhausCount != null
    ? urlhausCount * 1200
    : Math.round((pop / 1_000_000) * (inet / 100) * 850);

  // Ransomware ≈ 15% of malware incidents
  const ransomwareBase = Math.round(malwareBase * 0.15);

  // Phishing ≈ 2.5× malware (phishing is the most common attack vector)
  const phishBase = Math.round(malwareBase * 2.5);

  return {
    cyberSecurityIndex:  hasCsirt ? 75 : 40,
    dataBreaches:        breachBase,
    malwareIncidents:    malwareBase,
    phishingIncidents:   phishBase,
    ransomwareIncidents: ransomwareBase,
  };
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

async function updateCyberData() {
  // ── Step 1: Load all reference datasets upfront ───────────────────────────
  console.log("Loading reference datasets...");
  const [ituScores, firstTeams, urlhausMap] = await Promise.all([
    loadITUScores(),
    loadFirstTeams(),
    loadURLhausMalware(),
  ]);
  console.log("");

  // ── Step 2: Fetch all countries from DB ───────────────────────────────────
  const countries = await Country.find({}, {
    iso3: 1, countryCode: 1, name: 1, population: 1,
    infrastructure: 1, "cyber.cyberSecurityIndex": 1,
  }).lean();

  console.log(`Processing ${countries.length} countries...\n`);

  let updated = 0;
  let skipped = 0;
  let errors  = 0;

  // Circuit breaker: if PhishStats is down/unreachable, don't burn the
  // whole run timing out on it once per country — stop calling it after a
  // few consecutive failures and fall back to estimation for the rest.
  let phishFailStreak = 0;
  let phishStatsDown = false;
  const PHISH_FAIL_LIMIT = 5;

  for (const country of countries) {
    const iso3 = (country.iso3 ?? "").toUpperCase();
    const iso2 = (country.countryCode ?? "").toUpperCase();

    try {

      // ── Cyber Security Index (ITU GCI primary) ──────────────────────────
      let cyberSecurityIndex = ituScores.get(iso3) ?? null;

      // ── CSIRT signal ────────────────────────────────────────────────────
      const hasCsirt = firstTeams.has(iso2);

      // ── Malware (URLhaus) ───────────────────────────────────────────────
      const urlhausCount = urlhausMap.get(iso2) ?? null;

      // ── Phishing (PhishStats — only call if we still need it) ───────────
      let phishingIncidents = null;
      if (iso2 && !phishStatsDown) {
        await sleep(120); // gentle rate-limit: ~8 req/s max
        phishingIncidents = await fetchPhishCount(iso2);

        if (phishingIncidents === null) {
          phishFailStreak++;
          if (phishFailStreak >= PHISH_FAIL_LIMIT) {
            phishStatsDown = true;
            console.warn(
              `  ✗ PhishStats unreachable after ${PHISH_FAIL_LIMIT} consecutive failures — ` +
              `skipping it for the rest of this run, using estimates instead.`
            );
          }
        } else {
          phishFailStreak = 0;
        }
      }

      // ── Fill remaining nulls with estimations ───────────────────────────
      const est = estimateCyberData(country, hasCsirt, urlhausCount);

      const cyberPayload = {
        "cyber.cyberSecurityIndex":  cyberSecurityIndex  ?? est.cyberSecurityIndex,
        "cyber.dataBreaches":        est.dataBreaches,                     // no free realtime source
        "cyber.malwareIncidents":    urlhausCount != null
                                       ? urlhausCount * 1200
                                       : est.malwareIncidents,
        "cyber.phishingIncidents":   phishingIncidents   ?? est.phishingIncidents,
        "cyber.ransomwareIncidents": est.ransomwareIncidents,
      };

      await Country.findByIdAndUpdate(country._id, { $set: cyberPayload });

      const src = [
        cyberSecurityIndex  != null ? "ITU"        : "est",
        urlhausCount        != null ? "URLhaus"    : "est",
        phishingIncidents   != null ? "PhishStats" : "est",
      ].join("+");

      console.log(`  ✓ ${iso3.padEnd(4)} ${country.name?.padEnd(32)} [${src}]`);
      updated++;

    } catch (err) {
      console.error(`  ✗ ${iso3} ${country.name} — ${err.message}`);
      errors++;
    }
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log(`
═══════════════════════════════════════════
  ✓ Updated : ${updated}
  − Skipped : ${skipped}
  ✗ Errors  : ${errors}
═══════════════════════════════════════════`);

  return { updated, skipped, errors, total: countries.length };
}

module.exports = updateCyberData;

if (require.main === module) {
  require("dotenv").config();
  require("./database")();
  mongoose.connection.once("open", () => {
    updateCyberData()
      .then((summary) => { console.log(summary); process.exit(0); })
      .catch((err) => { console.error("Fatal:", err); process.exit(1); });
  });
}