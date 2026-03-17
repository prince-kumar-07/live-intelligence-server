/**
 * passportController.js
 *
 * Express controller for passport intelligence data.
 * Fetches full passport details by countryName from req.params.
 *
 * Routes (wire in your router):
 *   GET /passport/:countryName          → getPassportByCountry
 *   GET /passport/code/:countryCode     → getPassportByCode
 *   GET /passport/rank/top/:n           → getTopPassports
 *   GET /passport/tier/:tier            → getPassportsByTier
 *   GET /passport/compare/:a/:b         → comparePassports
 */

"use strict";

const Passport = require("../Model/Passport");

// ─── HELPERS ──────────────────────────────────────────────────────────────────

/**
 * Normalise a country name from URL param.
 * "united-states" → "United States"
 * "japan"         → "Japan"
 * "south%20korea" → "South Korea"
 */
const normaliseName = (raw) =>
  decodeURIComponent(raw)
    .replace(/-/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());

/** Standard JSON success envelope */
const ok = (res, data, meta = {}) =>
  res.status(200).json({ success: true, ...meta, data });

/** Standard JSON error envelope */
const fail = (res, status, message, details = null) =>
  res.status(status).json({
    success: false,
    message,
    ...(details ? { details } : {}),
  });

// ─── FIELD PROJECTION ─────────────────────────────────────────────────────────
// Sent to client — excludes internal Mongoose fields and raw arrays
// when they are redundant (detailed version is sent instead).
const FULL_PROJECTION = {
  __v:         0,
  createdAt:   0,   // managed by timestamps, not needed on client
};

// ─── CONTROLLERS ──────────────────────────────────────────────────────────────

/**
 * GET /passport/:countryName
 *
 * Fetch complete passport document by country name.
 * Supports both exact match and case-insensitive fuzzy match.
 *
 * Params:
 *   countryName  — e.g. "Japan", "united-states", "South%20Korea"
 *
 * Response shape:
 * {
 *   success: true,
 *   data: {
 *     identity:      { countryCode, countryName, countryNameLocal, iso3, region }
 *     ranking:       { passportRank, tier, strengthScore, rankTrend, rankChange }
 *     access: {
 *       summary:     { visaFreeCount, visaOnArrivalCount, eVisaCount, visaRequiredCount, totalDestinations }
 *       byRegion:    accessByRegion
 *       visaFree:    [{ code, maxStay, note }]   ← from visaFreeDetailed
 *       visaOnArrival: [String]
 *       eVisa:       [String]
 *       visaRequired:[String]
 *     }
 *     intelligence:  { visaFreeGrowth, visaFreeChange, visaLost, rankHistory }
 *     document:      { passportValidity, passportCostUSD, processingDays, biometricChip, machineReadable }
 *     restrictions:  { dualCitizenshipAllowed, sanctionedBy, bannedFrom }
 *     meta:          { dataSource, lastUpdated, updatedAt }
 *   }
 * }
 */
const getPassportByCountry = async (req, res) => {
  try {
    const name = normaliseName(req.params.countryName);

    if (!name || name.length < 2) {
      return fail(res, 400, "Invalid country name");
    }

    // 1. Try exact match first (fastest)
    let doc = await Passport.findOne({ countryName: name }, FULL_PROJECTION).lean();

    // 2. Case-insensitive regex fallback
    if (!doc) {
      doc = await Passport.findOne(
        { countryName: { $regex: new RegExp(`^${name}$`, "i") } },
        FULL_PROJECTION
      ).lean();
    }

    // 3. Partial match — e.g. "Korea" → "South Korea"
    if (!doc) {
      doc = await Passport.findOne(
        { countryName: { $regex: new RegExp(name, "i") } },
        FULL_PROJECTION
      ).lean();
    }

    if (!doc) {
      return fail(res, 404, `No passport data found for "${name}"`);
    }

    // ── Shape the response ──────────────────────────────────────────────────
    const shaped = {

      identity: {
        countryCode:      doc.countryCode,
        countryName:      doc.countryName,
        countryNameLocal: doc.countryNameLocal || "",
        iso3:             doc.iso3 || "",
        region:           doc.region || "Other",
      },

      ranking: {
        passportRank:  doc.passportRank,
        tier:          doc.tier,
        strengthScore: doc.strengthScore,
        rankTrend:     doc.rankTrend   || "stable",
        rankChange:    doc.rankChange  ?? 0,
      },

      access: {
        summary: {
          visaFreeCount:      doc.visaFreeCount      ?? 0,
          visaOnArrivalCount: doc.visaOnArrivalCount ?? 0,
          eVisaCount:         doc.eVisaCount         ?? 0,
          visaRequiredCount:  doc.visaRequiredCount  ?? 0,
          totalDestinations:  doc.totalDestinations  ?? 0,
        },
        byRegion:     doc.accessByRegion || {},
        // prefer detailed (has maxStay), fall back to plain codes
        visaFree:     doc.visaFreeDetailed?.length
                        ? doc.visaFreeDetailed
                        : (doc.visaFree || []).map(c => ({ code: c, maxStay: null, note: "" })),
        visaOnArrival: doc.visaOnArrival || [],
        eVisa:         doc.eVisa         || [],
        visaRequired:  doc.visaRequired  || [],
      },

      intelligence: {
        visaFreeGrowth:  doc.visaFreeGrowth  ?? 0,
        visaFreeChange:  doc.visaFreeChange  || [],
        visaLost:        doc.visaLost        || [],
        rankHistory:     doc.rankHistory     || [],
      },

      document: {
        passportValidity: doc.passportValidity ?? 10,
        passportCostUSD:  doc.passportCostUSD  ?? null,
        processingDays:   doc.processingDays   ?? null,
        biometricChip:    doc.biometricChip    ?? true,
        machineReadable:  doc.machineReadable  ?? true,
      },

      restrictions: {
        dualCitizenshipAllowed: doc.dualCitizenshipAllowed ?? null,
        sanctionedBy:           doc.sanctionedBy || [],
        bannedFrom:             doc.bannedFrom   || [],
      },

      meta: {
        dataSource:  doc.dataSource  || "unknown",
        lastUpdated: doc.lastUpdated,
        updatedAt:   doc.updatedAt,
      },
    };

    return ok(res, shaped);

  } catch (err) {
    console.error("[getPassportByCountry]", err);
    return fail(res, 500, "Internal server error", err.message);
  }
};

/**
 * GET /passport/code/:countryCode
 *
 * Fetch by ISO2 country code (e.g. "JP", "US", "IN").
 * Same shaped response as getPassportByCountry.
 */
const getPassportByCode = async (req, res) => {
  try {
    const code = req.params.countryCode?.toUpperCase().trim();

    if (!code || code.length !== 2) {
      return fail(res, 400, "countryCode must be a 2-letter ISO code (e.g. JP)");
    }

    const doc = await Passport.findOne({ countryCode: code }, FULL_PROJECTION).lean();

    if (!doc) {
      return fail(res, 404, `No passport data found for code "${code}"`);
    }

    // Reuse the same shaping logic via a lightweight internal call
    req.params.countryName = doc.countryName;
    return getPassportByCountry(req, res);

  } catch (err) {
    console.error("[getPassportByCode]", err);
    return fail(res, 500, "Internal server error", err.message);
  }
};

/**
 * GET /passport/rank/top/:n
 *
 * Returns top N passports sorted by rank.
 * Default n = 10, max = 50.
 *
 * Response: array of lightweight ranking cards
 */
const getTopPassports = async (req, res) => {
  try {
    const n = Math.min(parseInt(req.params.n) || 10, 50);

    const docs = await Passport.find(
      { passportRank: { $ne: null } },
      {
        countryCode:   1, countryName: 1, countryNameLocal: 1,
        passportRank:  1, tier: 1, strengthScore: 1,
        visaFreeCount: 1, rankTrend: 1, rankChange: 1,
        accessByRegion:1, region: 1,
        _id: 0,
      }
    )
      .sort({ passportRank: 1 })
      .limit(n)
      .lean();

    return ok(res, docs, { count: docs.length });

  } catch (err) {
    console.error("[getTopPassports]", err);
    return fail(res, 500, "Internal server error", err.message);
  }
};

/**
 * GET /passport/tier/:tier
 *
 * Returns all passports in a given tier (S, A, B, C, D, E).
 * Sorted by rank ascending.
 */
const getPassportsByTier = async (req, res) => {
  try {
    const tier = req.params.tier?.toUpperCase().trim();
    const validTiers = ["S","A","B","C","D","E"];

    if (!validTiers.includes(tier)) {
      return fail(
        res, 400,
        `Invalid tier "${tier}". Must be one of: ${validTiers.join(", ")}`
      );
    }

    const docs = await Passport.find(
      { tier },
      {
        countryCode:        1, countryName: 1, passportRank: 1,
        tier:               1, strengthScore: 1,
        visaFreeCount:      1, visaOnArrivalCount: 1,
        eVisaCount:         1, visaRequiredCount: 1,
        totalDestinations:  1, rankTrend: 1,
        region:             1, accessByRegion: 1,
        _id: 0,
      }
    )
      .sort({ passportRank: 1 })
      .lean();

    return ok(res, docs, { tier, count: docs.length });

  } catch (err) {
    console.error("[getPassportsByTier]", err);
    return fail(res, 500, "Internal server error", err.message);
  }
};

/**
 * GET /passport/compare/:a/:b
 *
 * Side-by-side comparison of two passports.
 * :a and :b can be ISO2 codes OR country names.
 *
 * Response:
 * {
 *   a: { ...passport },
 *   b: { ...passport },
 *   diff: {
 *     rankDiff:    Number   (a.rank - b.rank, negative = a is stronger)
 *     visaFreeDiff:Number   (a.vfCount - b.vfCount)
 *     strengthDiff:Number
 *     onlyInA:    [String]  (countries A can enter VF but B cannot)
 *     onlyInB:    [String]  (countries B can enter VF but A cannot)
 *     shared:     [String]  (VF countries both can enter)
 *   }
 * }
 */
const comparePassports = async (req, res) => {
  try {
    const rawA = normaliseName(req.params.a);
    const rawB = normaliseName(req.params.b);

    const findOne = async (raw) => {
      // Try ISO2 code first (2 chars)
      if (raw.length === 2) {
        return Passport.findOne(
          { countryCode: raw.toUpperCase() },
          FULL_PROJECTION
        ).lean();
      }
      // Exact name
      let d = await Passport.findOne({ countryName: raw }, FULL_PROJECTION).lean();
      if (!d) {
        d = await Passport.findOne(
          { countryName: { $regex: new RegExp(`^${raw}$`, "i") } },
          FULL_PROJECTION
        ).lean();
      }
      return d;
    };

    const [docA, docB] = await Promise.all([findOne(rawA), findOne(rawB)]);

    if (!docA) return fail(res, 404, `Country "${rawA}" not found`);
    if (!docB) return fail(res, 404, `Country "${rawB}" not found`);

    const setA = new Set(docA.visaFree || []);
    const setB = new Set(docB.visaFree || []);

    const onlyInA = [...setA].filter(c => !setB.has(c));
    const onlyInB = [...setB].filter(c => !setA.has(c));
    const shared  = [...setA].filter(c =>  setB.has(c));

    const summary = (doc) => ({
      countryCode:      doc.countryCode,
      countryName:      doc.countryName,
      passportRank:     doc.passportRank,
      tier:             doc.tier,
      strengthScore:    doc.strengthScore,
      visaFreeCount:    doc.visaFreeCount      ?? 0,
      visaOnArrivalCount: doc.visaOnArrivalCount ?? 0,
      eVisaCount:       doc.eVisaCount         ?? 0,
      visaRequiredCount:doc.visaRequiredCount  ?? 0,
      totalDestinations:doc.totalDestinations  ?? 0,
      rankTrend:        doc.rankTrend,
      accessByRegion:   doc.accessByRegion     || {},
    });

    return ok(res, {
      a:    summary(docA),
      b:    summary(docB),
      diff: {
        rankDiff:     (docA.passportRank ?? 999) - (docB.passportRank ?? 999),
        visaFreeDiff: (docA.visaFreeCount ?? 0)  - (docB.visaFreeCount ?? 0),
        strengthDiff: (docA.strengthScore ?? 0)  - (docB.strengthScore ?? 0),
        onlyInA,
        onlyInB,
        shared,
        sharedCount:  shared.length,
      },
    });

  } catch (err) {
    console.error("[comparePassports]", err);
    return fail(res, 500, "Internal server error", err.message);
  }
};

// ─── EXPORTS ──────────────────────────────────────────────────────────────────

module.exports = {
  getPassportByCountry,
  getPassportByCode,
  getTopPassports,
  getPassportsByTier,
  comparePassports,
};