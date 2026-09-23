// Registry of admin-triggerable "refresh from the internet" jobs, one per
// Country schema section. Only wires up scripts that (a) touch the live DB,
// (b) pull from a real source, and (c) don't fabricate placeholder data.
// `risk` is intentionally left out — every free data source checked for
// political stability/terrorism/disaster risk has been retired or never
// existed. `tech` is wired up for its one available real field
// (R&D spend); startups/unicorns/tech-talent ranking still have none.

// Runs several independent fetchers under one section. One fetcher failing
// (e.g. an upstream API going away) doesn't block the others — the job is
// only marked "error" if every task in it failed.
async function runTasks(tasks) {
  const results = {};
  let anySucceeded = false;

  for (const [name, fn] of Object.entries(tasks)) {
    try {
      results[name] = { status: "success", result: await fn() };
      anySucceeded = true;
    } catch (err) {
      results[name] = { status: "error", error: err.message || String(err) };
    }
  }

  if (!anySucceeded) {
    throw new Error(
      "All tasks in this section failed: " +
      Object.entries(results).map(([n, r]) => `${n}: ${r.error}`).join("; ")
    );
  }

  return results;
}

module.exports = {
  rankings: {
    label: "Rankings",
    description:
      "Passport, happiness, peace, military, democracy, innovation, press-freedom and cyber rank/index — World Bank live data plus curated 2023/24 index tables.",
    run: require("../updateRankingsData"),
  },

  government: {
    label: "Government",
    description:
      "Government type & head of state (Wikidata), UN membership (mledoze/countries open dataset), independence year (Wikidata), total government expenditure % GDP (World Bank).",
    run: () =>
      runTasks({
        details: require("../fetchGovernmentDetails"),
        unMembership: require("../fetchUNMembership"),
        independenceYear: require("../fetchIndependenceYear"),
        expenditure: require("../fetchGovernmentExpenditure"),
      }),
  },

  economy: {
    label: "Economy",
    description: "GDP, GDP per capita, inflation, unemployment and government debt % GDP — World Bank API.",
    run: () =>
      runTasks({
        gdp: require("../fetchGDP"),
        gdpPerCapitaInflationUnemployment: require("../fetchEconomyData"),
      }),
  },

  demographics: {
    label: "Demographics",
    description:
      "Urban population % and population density — World Bank API. Median age — small curated table (only 8 countries; no free global source wired up yet).",
    run: () =>
      runTasks({
        urbanPopulation: require("../fetchUrbanPopulation"),
        populationDensity: require("../fetchPopulationDensity"),
        medianAge: require("../fetchMedianAge"),
      }),
  },

  infrastructure: {
    label: "Infrastructure",
    description:
      "Internet penetration, mobile and broadband subscriptions — World Bank API. (dataCenters/submarineCables/cloudRegions have no free data source yet and are left untouched.)",
    run: () =>
      runTasks({
        internetPenetration: require("../fetchInternetUsers"),
        mobileSubscriptions: require("../fetchInfrastructureData"),
      }),
  },

  cyber: {
    label: "Cyber",
    description:
      "Cyber security index (ITU GCI + CSIRT signal), malware/phishing/ransomware/breach estimates — ITU, FIRST.org, URLhaus, PhishStats.",
    run: require("../updateCyberData"),
  },

  military: {
    label: "Military",
    description: "Defense budget as % of GDP — World Bank API.",
    run: require("../fetchMilitary"),
  },

  geography: {
    label: "Geography",
    description: "Land borders and capital city — mledoze/countries open dataset.",
    run: require("../updateBordersAndCities"),
  },

  energy: {
    label: "Energy",
    description:
      "Renewable energy % of final consumption, electricity access % of population — World Bank API. (oilProduction/oilReserves/electricityProduction have no free data source and are left untouched.)",
    run: require("../fetchEnergyData"),
  },

  trade: {
    label: "Trade",
    description:
      "Exports, imports and trade balance — World Bank API. (majorExportPartners has no free data source and is left untouched.)",
    run: require("../fetchTradeData"),
  },

  climate: {
    label: "Climate",
    description:
      "CO2 emissions per capita — World Bank API. (climateRiskIndex/naturalDisastersPerYear have no free data source and are left untouched.)",
    run: require("../fetchClimateData"),
  },

  transport: {
    label: "Transport",
    description:
      "Rail network length — World Bank API. (roadLength/airports/seaports have no free, currently-updated data source and are left untouched.)",
    run: require("../fetchTransportData"),
  },

  health: {
    label: "Health",
    description:
      "Life expectancy, health spending % of GDP, hospital beds per 1,000 people — World Bank API.",
    run: require("../fetchHealthData"),
  },

  education: {
    label: "Education",
    description:
      "Secondary school enrollment and education spending % of GDP — World Bank API. Literacy rate is included but sparse (only ~65 countries report it).",
    run: require("../fetchEducationData"),
  },

  tourism: {
    label: "Tourism",
    description:
      "International tourist arrivals and tourism receipts — World Bank API. Most recent data point is often 2020 (COVID-era reporting gap, not a bug here).",
    run: require("../fetchTourismData"),
  },

  agriculture: {
    label: "Agriculture",
    description:
      "Arable land %, agricultural land %, and food production index — World Bank API.",
    run: require("../fetchAgricultureData"),
  },

  poverty: {
    label: "Poverty & Inequality",
    description:
      "Poverty headcount ratio ($2.15/day) and income share held by the top/bottom 10% — World Bank API.",
    run: require("../fetchPovertyData"),
  },

  labor: {
    label: "Labor & Employment",
    description:
      "Labor force participation rate and employment share by sector (agriculture/industry/services) — World Bank API.",
    run: require("../fetchLaborData"),
  },

  sanitation: {
    label: "Water & Sanitation",
    description:
      "% of population with access to basic drinking water and basic sanitation — World Bank API.",
    run: require("../fetchSanitationData"),
  },

  gender: {
    label: "Gender",
    description:
      "Female labor force participation rate and % of parliament seats held by women — World Bank API.",
    run: require("../fetchGenderData"),
  },

  tech: {
    label: "Tech",
    description:
      "R&D expenditure % of GDP — World Bank API. (startups/unicorns/techTalentRank have no free data source and are left untouched.)",
    run: require("../fetchTechData"),
  },

  passport: {
    label: "Passport",
    description:
      "Visa-free/on-arrival/e-visa/required destinations, rank/tier/strength score (computed from this data) — ilyankou/passport-index-dataset + mledoze/countries. (Rank history, growth trends, document metadata and dual-citizenship fields have no free source and are left untouched.)",
    run: require("../fetchPassportData"),
  },
};
