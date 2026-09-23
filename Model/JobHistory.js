const mongoose = require("mongoose");

// One document per section — holds only the most recent completed run, so
// "last updated" survives a server restart. Full per-run log streaming
// during an active job still lives in jobRunner's in-memory store; this is
// just the durable snapshot of the latest result.
const jobHistorySchema = new mongoose.Schema({
  sectionKey: { type: String, required: true, unique: true, index: true },
  status: { type: String, enum: ["success", "error"], required: true },
  startedAt: Date,
  finishedAt: Date,
  summary: mongoose.Schema.Types.Mixed,
  error: String,
  logs: [{ level: String, message: String, time: Date }],
}, { timestamps: true });

module.exports = mongoose.model("JobHistory", jobHistorySchema);
