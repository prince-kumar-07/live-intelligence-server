import mongoose from "mongoose";

const intelSchema = new mongoose.Schema({

  countries: [
    {
      name: String,
      coords: [Number],
      flag: String,
      threatLevel: Number,
      military: Number,
      nuclear: Boolean,
      alliance: String
    }
  ],

  warEvents: [
    {
      id: Number,
      from: String,
      to: String,
      type: String,
      severity: String,
      casualties: Number,
      timestamp: String,
      description: String
    }
  ],

  predictedConflicts: [
    {
      id: String,
      from: String,
      to: String,
      probability: Number,
      trend: String,
      timeline: String,
      classification: String,
      drivers: [String],

      indicators: {
        Military: Number,
        Political: Number,
        Economic: Number,
        Intelligence: Number
      },

      lastUpdated: String
    }
  ],

  intelAlerts: [
    {
      id: String,
      level: String,
      text: String,
      time: String
    }
  ],

  SEVERITY_COLOR: Object,
  ALERT_COLOR: Object,
  TREND_ICON: Object

},{timestamps:true});

export default mongoose.model("IntelData", intelSchema);