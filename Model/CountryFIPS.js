import mongoose from "mongoose";

const fipsSchema = new mongoose.Schema({

  codes:{
    type: Map,
    of: String
  }

});

export default mongoose.model("CountryFips", fipsSchema);