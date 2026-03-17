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

/* ───────────────────────── CATEGORY THEMES ───────────────────────── */

const CATEGORY_THEMES = {
  general: null,
  politics: "theme:GOV",
  business: "theme:ECON",
  technology: "theme:CYBER_ATTACK",
  military: "theme:MILITARY",
  crime: "theme:CRIME_VIOLENCE",
  disaster: "theme:NATURAL_DISASTER",
  health: "theme:HEALTH",
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ───────────────────────── CORE FETCH FUNCTION ───────────────────────── */

async function fetchNews({ country, category = "military", timespan = "24h", limit = 20 }, retries = 3) {

  const fips = COUNTRY_FIPS[country.toLowerCase().trim()];
  if (!fips) throw new Error(`Country not found: "${country}"`);

  const theme = CATEGORY_THEMES[category.toLowerCase()] ?? null;
  const query = theme ? `sourcecountry:${fips} ${theme}` : `sourcecountry:${fips}`;

  const url =
    `https://api.gdeltproject.org/api/v2/doc/doc`
    + `?query=${query.replace(/ /g, "+")}`
    + `&mode=artlist`
    + `&format=json`
    + `&maxrecords=${limit}`
    + `&timespan=${timespan}`
    + `&sort=datedesc`;

  for (let attempt = 1; attempt <= retries; attempt++) {

    try {

      const { data } = await axios.get(url, { timeout: 20000 });

      if (typeof data === "string" && data.includes("limit")) {
        if (attempt < retries) {
          console.log(`Rate limited — waiting 6s (${attempt}/${retries})`);
          await sleep(6000);
          continue;
        }
        throw new Error("GDELT rate limit");
      }

      return (data?.articles ?? []).map(a => ({
        title: a.title,
        url: a.url,
        source: a.domain,
        image: a.socialimage ?? null,
        publishedAt: a.seendate,
        language: a.language,
        country,
        category,
      }));

    } catch (err) {

      if (err.response?.status === 429 && attempt < retries) {
        console.log(`Rate limited (429) — retrying (${attempt}/${retries})`);
        await sleep(6000);
        continue;
      }

      throw err;
    }
  }
}

/* ───────────────────────── CONTROLLER ───────────────────────── */

const getCountryNews = async (req, res) => {
  try {

    const { country, timespan = "24h", limit = 5 } = req.query;

    if (!country) {
      return res.status(400).json({ error: "country query param required" });
    }

    const categories = ["technology", "military", "crime", "disaster"];

    const results = {};

    for (const category of categories) {

      const articles = await fetchNews({
        country,
        category,
        timespan,
        limit: parseInt(limit),
      });

      results[category] = articles;

    }

    res.json({
      country,
      timespan,
      perCategory: parseInt(limit),
      results
    });

  } catch (error) {

    res.status(500).json({
      error: error.message
    });

  }
};

module.exports = {
  getCountryNews
};