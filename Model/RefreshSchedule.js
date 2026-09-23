const mongoose = require("mongoose");

// Singleton document — one row holds the whole admin console's
// auto-refresh configuration.
const refreshScheduleSchema = new mongoose.Schema({
  enabled: { type: Boolean, default: false },
  frequency: { type: String, enum: ["daily", "weekly"], default: "daily" },
  dayOfWeek: { type: Number, min: 0, max: 6, default: 0 }, // 0=Sunday, only used when frequency="weekly"
  time: { type: String, default: "02:00" }, // "HH:MM", 24-hour, server-local time
  lastRunAt: { type: Date, default: null },
  lastRunStatus: { type: String, default: null },
}, { timestamps: true });

module.exports = mongoose.model("RefreshSchedule", refreshScheduleSchema);
