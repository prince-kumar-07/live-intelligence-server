const axios = require("axios");

/* ───────────────────────── COUNTRY FIPS MAP ───────────────────────── */

const COUNTRY_FIPS = {
  "afghanistan":"AF","albania":"AL","algeria":"AG","angola":"AO","argentina":"AR",
  "armenia":"AM","australia":"AS","austria":"AU","azerbaijan":"AJ","bahrain":"BA",
  "bangladesh":"BG","belarus":"BO","belgium":"BE","belize":"BH","benin":"BN",
  "bhutan":"BT","bolivia":"BL","bosnia":"BK","botswana":"BC","brazil":"BR",
  "brunei":"BX","bulgaria":"BU","burkina faso":"UV","burundi":"BY","cambodia":"CB",
  "cameroon":"CM","canada":"CA","chad":"CD","chile":"CI","china":"CH",
  "colombia":"CO","costa rica":"CS","croatia":"HR","cuba":"CU","cyprus":"CY",
  "czech republic":"EZ","czechia":"EZ","denmark":"DA","djibouti":"DJ",
  "dominican republic":"DR","dr congo":"CF","ecuador":"EC","egypt":"EG",
  "el salvador":"ES","eritrea":"ER","estonia":"EN","ethiopia":"ET","fiji":"FJ",
  "finland":"FI","france":"FR","gabon":"GB","georgia":"GG","germany":"GM",
  "ghana":"GH","greece":"GR","guatemala":"GT","guinea":"GV","haiti":"HA",
  "honduras":"HO","hungary":"HU","iceland":"IC","india":"IN","indonesia":"ID",
  "iran":"IR","iraq":"IZ","ireland":"EI","israel":"IS","italy":"IT",
  "ivory coast":"IV","jamaica":"JM","japan":"JA","jordan":"JO","kazakhstan":"KZ",
  "kenya":"KE","north korea":"KN","south korea":"KS","kuwait":"KU",
  "kyrgyzstan":"KG","laos":"LA","latvia":"LG","lebanon":"LE","liberia":"LI",
  "libya":"LY","lithuania":"LH","luxembourg":"LU","madagascar":"MA","malawi":"MI",
  "malaysia":"MY","mali":"ML","mauritania":"MR","mexico":"MX","moldova":"MD",
  "mongolia":"MN","montenegro":"MJ","morocco":"MO","mozambique":"MZ",
  "myanmar":"BM","namibia":"WA","nepal":"NP","netherlands":"NL","new zealand":"NZ",
  "nicaragua":"NU","niger":"NG","nigeria":"NI","norway":"NO","oman":"MU",
  "pakistan":"PK","panama":"PM","paraguay":"PA","peru":"PE","philippines":"PS",
  "poland":"PL","portugal":"PO","qatar":"QA","romania":"RO","russia":"RS",
  "rwanda":"RW","saudi arabia":"SA","senegal":"SG","serbia":"RI","singapore":"SN",
  "slovakia":"LO","slovenia":"SI","somalia":"SO","south africa":"SF",
  "south sudan":"OD","spain":"SP","sri lanka":"CE","sudan":"SU","sweden":"SW",
  "switzerland":"SZ","syria":"SY","taiwan":"TW","tajikistan":"TI","tanzania":"TZ",
  "thailand":"TH","togo":"TO","tunisia":"TS","turkey":"TU","turkmenistan":"TX",
  "uganda":"UG","ukraine":"UP","uae":"AE","united arab emirates":"AE",
  "united kingdom":"UK","uk":"UK","united states":"US","usa":"US",
  "uruguay":"UY","uzbekistan":"UZ","venezuela":"VE","vietnam":"VM","yemen":"YM",
  "zambia":"ZA","zimbabwe":"ZI",
};

/* ───────────────────────── CATEGORY DETECTION ─────────────────────────
   GDELT's `mode=artlist` response doesn't tag which theme matched each
   article, so with a single combined query we can no longer ask GDELT
   "which category is this" the way four separate per-theme queries used
   to. Instead we combine the same four themes into one query (so GDELT
   only sees ONE request instead of four) and classify each returned
   article by keyword-matching its title — best-effort, but keeps the
   existing category/severity coloring working without the 4x request
   volume that was tripping GDELT's rate limit on nearly every page load. */

const CATEGORY_THEMES = "(theme:MILITARY OR theme:CRIME_VIOLENCE OR theme:NATURAL_DISASTER OR theme:CYBER_ATTACK)";

const CATEGORY_KEYWORDS = {
  military: ["military", "army", "troops", "war", "missile", "defense", "defence", "soldier", "combat", "navy", "air force"],
  crime: ["crime", "murder", "arrest", "violence", "shooting", "kidnap", "assault", "gang", "robbery", "theft"],
  disaster: ["earthquake", "flood", "hurricane", "wildfire", "disaster", "cyclone", "tsunami", "landslide", "drought", "storm"],
  technology: ["cyber", "hack", "breach", "ransomware", "malware", "data leak", "phishing"],
};

function categorize(title) {
  const lower = (title || "").toLowerCase();
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some((k) => lower.includes(k))) return category;
  }
  return "general";
}

/* ───────────────────────── SHORT SERVER-SIDE CACHE ─────────────────────────
   "Live" news doesn't need to be re-fetched on every single page view —
   caching per country for a few minutes means normal browsing essentially
   never hits GDELT's rate limit, since only the first visitor in a given
   window triggers a real fetch. */

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const cache = new Map(); // countryKey -> { results, expiresAt }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ───────────────────────── CORE FETCH FUNCTION ───────────────────────── */

async function fetchNews({ country, timespan = "24h", limit = 20 }, retries = 3) {

  const fips = COUNTRY_FIPS[country.toLowerCase().trim()];
  if (!fips) throw new Error(`Country not found: "${country}"`);

  const query = `sourcecountry:${fips} ${CATEGORY_THEMES}`;

  const url =
    `https://api.gdeltproject.org/api/v2/doc/doc`
    + `?query=${encodeURIComponent(query)}`
    + `&mode=artlist`
    + `&format=json`
    + `&maxrecords=${limit}`
    + `&timespan=${timespan}`
    + `&sort=datedesc`;

  for (let attempt = 1; attempt <= retries; attempt++) {

    try {

      const { data } = await axios.get(url, { timeout: 20000 });

      // GDELT returns a plain-text rate-limit notice (not JSON) when it's
      // throttling us, rather than a proper 429 — same failure, different
      // shape, so both are checked.
      if (typeof data === "string") {
        if (attempt < retries) {
          console.log(`GDELT rate limited — waiting 8s (${attempt}/${retries})`);
          await sleep(8000);
          continue;
        }
        const err = new Error("GDELT rate limit — try again in a minute");
        err.rateLimited = true;
        throw err;
      }

      return (data?.articles ?? []).map(a => ({
        title: a.title,
        url: a.url,
        source: a.domain,
        image: a.socialimage ?? null,
        publishedAt: a.seendate,
        language: a.language,
        country,
        category: categorize(a.title),
      }));

    } catch (err) {

      if (err.response?.status === 429 && attempt < retries) {
        console.log(`GDELT rate limited (429) — waiting 8s (${attempt}/${retries})`);
        await sleep(8000);
        continue;
      }

      if (err.response?.status === 429) err.rateLimited = true;
      throw err;
    }
  }
}

/* ───────────────────────── CONTROLLER ───────────────────────── */

const getCountryNews = async (req, res) => {
  try {

    const { country, timespan = "24h", limit = 20 } = req.query;

    if (!country) {
      return res.status(400).json({ error: "country query param required" });
    }

    const cacheKey = `${country.toLowerCase().trim()}:${timespan}`;
    const cached = cache.get(cacheKey);

    if (cached && cached.expiresAt > Date.now()) {
      return res.json({ country, timespan, cached: true, results: cached.results });
    }

    const articles = await fetchNews({ country, timespan, limit: parseInt(limit) });

    const results = { technology: [], military: [], crime: [], disaster: [], general: [] };
    for (const article of articles) {
      results[article.category].push(article);
    }

    cache.set(cacheKey, { results, expiresAt: Date.now() + CACHE_TTL_MS });

    res.json({ country, timespan, cached: false, results });

  } catch (error) {

    res.status(error.rateLimited ? 429 : 500).json({
      error: error.message,
      rateLimited: !!error.rateLimited,
    });

  }
};

module.exports = {
  getCountryNews
};
