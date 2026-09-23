import mongoose from "mongoose";

const countryLocationSchema = new mongoose.Schema({

  name: {
    type: String,
    required: true
  },

  coords: {
    type: [Number],
    required: true
  }

},{timestamps:true});

export default mongoose.model("CountryLocation", countryLocationSchema);