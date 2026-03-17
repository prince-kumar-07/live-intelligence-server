const mongoose = require("mongoose");

const passportScoreSchema = new mongoose.Schema({

  scores: {
    type: Map,
    of: Number
  },

  lastUpdated: {
    type: Date,
    default: Date.now
  }

});

module.exports = mongoose.model("PassportScores", passportScoreSchema);