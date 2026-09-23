/**
 * Passport.js — Expanded Passport Intelligence Schema
 *
 * Covers:
 *   - Core Henley Index data (rank, visa categories)
 *   - Travel intelligence (growth, trends, regional breakdown)
 *   - Entry requirement details (max stay per destination)
 *   - Passport document metadata
 *   - Historical rank tracking
 *   - Dual citizenship & restrictions
 *   - UI-ready computed fields
 */

"use strict";

const mongoose = require("mongoose");
const { Schema } = mongoose;

// ─── SUB-SCHEMAS ──────────────────────────────────────────────────────────────

/**
 * Detailed entry for a single visa-free destination
 * (used in visaFreeDetailed array)
 */
const VisaDetailSchema = new Schema({
  code:    { type: String, uppercase: true },   // ISO2 destination code
  maxStay: { type: Number, default: null },      // days allowed, null = unknown
  note:    { type: String, default: "" },        // "extendable", "tourist only", etc.
}, { _id: false });

/**
 * Single snapshot in rank history
 */
const RankSnapshotSchema = new Schema({
  year:          { type: Number, required: true },
  quarter:       { type: String, enum: ["Q1","Q2","Q3","Q4"], default: "Q1" },
  rank:          { type: Number },
  visaFreeCount: { type: Number },
}, { _id: false });

/**
 * Regional access breakdown
 * Counts how many VF destinations fall in each world region
 */
const RegionAccessSchema = new Schema({
  europe:     { type: Number, default: 0 },
  asia:       { type: Number, default: 0 },
  americas:   { type: Number, default: 0 },
  africa:     { type: Number, default: 0 },
  oceania:    { type: Number, default: 0 },
  middleEast: { type: Number, default: 0 },
}, { _id: false });

// ─── MAIN SCHEMA ──────────────────────────────────────────────────────────────

const PassportSchema = new Schema({

  // ── IDENTITY ──────────────────────────────────────────────────────────────
  countryCode: {
    type:     String,
    required: true,
    uppercase: true,
    unique:   true,
    index:    true,
    trim:     true,
  },

  countryName: {
    type:     String,
    required: true,
    trim:     true,
    index:    true,                              // allows text search by name
  },

  countryNameLocal: {
    type:  String,
    default: "",                                 // e.g. "日本" for Japan
  },

  iso3: {
    type:     String,
    uppercase: true,
    trim:     true,
    default:  "",                                // 3-letter ISO code
  },

  region: {
    type: String,
    enum: ["Europe","Asia","Americas","Africa","Oceania","Middle East","Other"],
    default: "Other",
  },

  // ── CORE HENLEY DATA ──────────────────────────────────────────────────────
  passportRank: {
    type:    Number,
    default: null,
  },

  tier: {
    type: String,
    enum: ["S","A","B","C","D","E"],
    default: "E",
  },

  strengthScore: {
    type:    Number,
    min:     0,
    max:     100,
    default: 0,                                  // composite 0–100 score
  },

  // ── VISA CATEGORY ARRAYS (ISO2 codes) ─────────────────────────────────────
  visaFree:      { type: [String], default: [] },
  visaOnArrival: { type: [String], default: [] },
  eVisa:         { type: [String], default: [] },
  visaRequired:  { type: [String], default: [] },

  // ── VISA COUNTS ───────────────────────────────────────────────────────────
  visaFreeCount:      { type: Number, default: 0 },
  visaOnArrivalCount: { type: Number, default: 0 },
  eVisaCount:         { type: Number, default: 0 },
  visaRequiredCount:  { type: Number, default: 0 },
  totalDestinations:  { type: Number, default: 0 }, // sum of all four

  // ── DETAILED ENTRY REQUIREMENTS ───────────────────────────────────────────
  visaFreeDetailed: {
    type:    [VisaDetailSchema],
    default: [],
  },                                             // richer version of visaFree

  // ── TRAVEL INTELLIGENCE ───────────────────────────────────────────────────
  visaFreeGrowth: {
    type:    Number,
    default: 0,                                  // +/- vs previous year
  },

  visaFreeChange: {
    type:    [String],
    default: [],                                 // newly added VF ISO2 codes
  },

  visaLost: {
    type:    [String],
    default: [],                                 // recently lost VF ISO2 codes
  },

  rankTrend: {
    type:    String,
    enum:    ["rising","falling","stable","new"],
    default: "stable",
  },

  rankChange: {
    type:    Number,
    default: 0,                                  // +/- positions vs last quarter
  },

  // ── REGIONAL BREAKDOWN ────────────────────────────────────────────────────
  accessByRegion: {
    type:    RegionAccessSchema,
    default: () => ({}),
  },

  // ── HISTORICAL RANKING ────────────────────────────────────────────────────
  rankHistory: {
    type:    [RankSnapshotSchema],
    default: [],
  },

  // ── PASSPORT DOCUMENT METADATA ────────────────────────────────────────────
  passportValidity:  { type: Number, default: 10 },   // years
  passportCostUSD:   { type: Number, default: null },  // USD
  processingDays:    { type: Number, default: null },  // avg business days
  biometricChip:     { type: Boolean, default: true },
  machineReadable:   { type: Boolean, default: true },

  // ── DUAL CITIZENSHIP & RESTRICTIONS ──────────────────────────────────────
  dualCitizenshipAllowed: { type: Boolean, default: null },

  sanctionedBy: {
    type:    [String],
    default: [],                                 // ISO2 codes that restrict/ban
  },

  bannedFrom: {
    type:    [String],
    default: [],                                 // destinations with full ban
  },

  // ── META ──────────────────────────────────────────────────────────────────
  lastUpdated: {
    type:    Date,
    default: Date.now,
  },

  dataSource: {
    type:    String,
    enum:    ["api_v2","api_v3","embedded","derived","manual"],
    default: "derived",
  },

  notes: {
    type:    String,
    default: "",                                 // admin notes / data quality flags
  },

}, {
  timestamps: true,                              // adds createdAt, updatedAt
  collection: "passports",
});

// ─── INDEXES ──────────────────────────────────────────────────────────────────
PassportSchema.index({ passportRank: 1 });
PassportSchema.index({ tier: 1 });
PassportSchema.index({ region: 1 });
PassportSchema.index({ visaFreeCount: -1 });
PassportSchema.index({ strengthScore: -1 });
PassportSchema.index({ countryName: "text" });  // full-text search

// ─── VIRTUAL ──────────────────────────────────────────────────────────────────

/** Percentage of all destinations accessible visa-free */
PassportSchema.virtual("visaFreePercent").get(function () {
  if (!this.totalDestinations) return 0;
  return +((this.visaFreeCount / this.totalDestinations) * 100).toFixed(1);
});

/** Full access count (visaFree + visaOnArrival + eVisa) */
PassportSchema.virtual("openAccessCount").get(function () {
  return this.visaFreeCount + this.visaOnArrivalCount + this.eVisaCount;
});

// ─── METHODS ──────────────────────────────────────────────────────────────────

/** Recompute all *Count fields from the arrays. Call before save. */
PassportSchema.methods.syncCounts = function () {
  this.visaFreeCount      = this.visaFree.length;
  this.visaOnArrivalCount = this.visaOnArrival.length;
  this.eVisaCount         = this.eVisa.length;
  this.visaRequiredCount  = this.visaRequired.length;
  this.totalDestinations  =
    this.visaFreeCount + this.visaOnArrivalCount +
    this.eVisaCount    + this.visaRequiredCount;
};

/** Derive tier from passportRank */
PassportSchema.methods.computeTier = function () {
  const r = this.passportRank;
  if (!r)    { this.tier = "E"; return; }
  if (r <= 2)  this.tier = "S";
  else if (r <= 6)  this.tier = "A";
  else if (r <= 15) this.tier = "B";
  else if (r <= 30) this.tier = "C";
  else if (r <= 60) this.tier = "D";
  else              this.tier = "E";
};

/** Compute strengthScore from rank + visaFreeCount */
PassportSchema.methods.computeStrength = function () {
  const MAX_RANK = 113;
  const MAX_VF   = 193;
  const rankScore = this.passportRank
    ? ((MAX_RANK - this.passportRank) / MAX_RANK) * 60
    : 0;
  const vfScore   = (this.visaFreeCount / MAX_VF) * 40;
  this.strengthScore = Math.round(rankScore + vfScore);
};

// ─── PRE-SAVE HOOK ────────────────────────────────────────────────────────────
PassportSchema.pre("save", function (next) {
  this.syncCounts();
  this.computeTier();
  this.computeStrength();
  this.lastUpdated = new Date();
  next();
});

// ─── STATICS ──────────────────────────────────────────────────────────────────

/** Get top N passports by rank */
PassportSchema.statics.getTopN = function (n = 10) {
  return this.find({ passportRank: { $ne: null } })
    .sort({ passportRank: 1 })
    .limit(n)
    .select("countryCode countryName passportRank visaFreeCount tier strengthScore");
};

/** Find by ISO2 code */
PassportSchema.statics.findByCode = function (iso2) {
  return this.findOne({ countryCode: iso2.toUpperCase() });
};

/** Get all passports in a tier */
PassportSchema.statics.getByTier = function (tier) {
  return this.find({ tier }).sort({ passportRank: 1 });
};

module.exports = mongoose.models.Passport
  ? mongoose.model("Passport")
  : mongoose.model("Passport", PassportSchema);