const mongoose = require("mongoose");

const countrySchema = new mongoose.Schema({

  name: {
    type: String,
    required: true,
    trim: true
  },

  countryCode: {
    type: String,
    required: true,
    uppercase: true
  },

  iso3: {
    type: String,
    required: true,
    uppercase: true
  },

  continent: String,
  region: String,
  capital: String,

  population: Number,

  currency: String,
  currencySymbol: String,

  language: [String],

  timezone: String,

  latitude: Number,
  longitude: Number,

  flag: String,

  internetUsers: Number,

  cyberRiskScore: {
    type: Number,
    default: 0
  },

  threatLevel: {
    type: String,
    enum: ["low", "medium", "high", "critical"],
    default: "low"
  },

  geography: {
    area: Number,
    landlocked: Boolean,
    borders: [String],
    coastlineLength: Number,
    majorCities: [String]
  },

  demographics: {
    populationDensity: Number,
    urbanPopulation: Number,
    medianAge: Number
  },

  economy: {
    gdp: Number,
    gdpPerCapita: Number,
    inflationRate: Number,
    unemploymentRate: Number,
    minimumWage: Number
  },

  infrastructure: {
    internetPenetration: Number,
    mobileSubscriptions: Number,
    dataCenters: Number,
    submarineCables: Number,
    cloudRegions: Number
  },

  cyber: {
    cyberSecurityIndex: Number,
    dataBreaches: Number,
    malwareIncidents: Number,
    phishingIncidents: Number,
    ransomwareIncidents: Number
  },

  government: {
    governmentType: String,
    headOfState: String,
    independenceYear: Number,
    unMember: Boolean,
    natoMember: Boolean,
    euMember: Boolean
  },

  rankings: {
    passportRank: Number,
    happinessRank: Number,
    peaceRank: Number,
    militaryRank: Number,

    corruptionIndex: Number,
    hdiIndex: Number,
    democracyIndex: Number,
    pressFreedomIndex: Number,
    innovationIndex: Number,
    cyberSecurityIndexRank: Number
  },

  /* ---------------- NEW SECTIONS ---------------- */

  military: {
    activePersonnel: Number,
    reservePersonnel: Number,
    defenseBudget: Number,
    nuclearWeapons: Number
  },

  energy: {
    oilProduction: Number,
    oilReserves: Number,
    electricityProduction: Number,
    renewableEnergyPercent: Number
  },

  trade: {
    exports: Number,
    imports: Number,
    tradeBalance: Number,
    majorExportPartners: [String]
  },

  risk: {
    politicalStability: Number,
    terrorismIndex: Number,
    disasterRiskIndex: Number
  },

  tech: {
    startups: Number,
    unicorns: Number,
    techTalentRank: Number
  },

  climate: {
    co2Emissions: Number,
    climateRiskIndex: Number,
    naturalDisastersPerYear: Number
  },

  transport: {
    airports: Number,
    seaports: Number,
    railLength: Number,
    roadLength: Number
  }

}, { timestamps: true });

module.exports = mongoose.model("Country", countrySchema);