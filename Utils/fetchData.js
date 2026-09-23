require("dotenv").config();
const mongoose = require("mongoose");
const axios = require("axios");
const Passport = require("../Model/Passport");

const MONGO_URI = process.env.DATABASE_URL;

async function importPassportData() {

  await mongoose.connect(MONGO_URI);
  console.log("MongoDB connected");

  // Get all countries
  const res = await axios.get("https://restcountries.com/v3.1/all");
  const countries = res.data;

  let inserted = 0;

  for (const c of countries) {

    if (!c.cca2) continue;

    const countryCode = c.cca2.toUpperCase();

    const doc = {
      countryCode,

      passportRank: null,

      visaFree: [],
      visaOnArrival: [],
      eVisa: [],
      visaRequired: [],

      visaFreeCount: 0,
      visaOnArrivalCount: 0,
      eVisaCount: 0,
      visaRequiredCount: 0
    };

    await Passport.updateOne(
      { countryCode },
      { $set: doc },
      { upsert: true }
    );

    inserted++;
  }

  console.log(`Inserted/Updated ${inserted} passport documents`);

  process.exit();
}

importPassportData();