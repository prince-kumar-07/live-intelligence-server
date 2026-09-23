const mongoose = require("mongoose");
const axios = require("axios");
const Country = require("../Model/Country"); // adjust path if needed

async function updateBordersAndCities() {

  let updated = 0;

  try {

    console.log("Fetching country data...");

    // REST Countries' free API was deprecated (now requires a paid key), so
    // this pulls from the same open dataset it used to mirror — the
    // mledoze/countries project, served free via jsDelivr, no key needed.
    const res = await axios.get(
      process.env.COUNTRIES_DATASET_URL,
      { timeout: 20000 }
    );

    const countries = res.data;

    if (!Array.isArray(countries)) {
      throw new Error(
        "Countries dataset did not return a list. Response: " + JSON.stringify(countries).slice(0, 200)
      );
    }

    for (const c of countries) {

      const iso3 = c.cca3;

      const borders = c.borders || [];

      const capital = c.capital ? c.capital[0] : null;

      let majorCities = [];

      if (capital) majorCities.push(capital);

      await Country.findOneAndUpdate(
        { iso3: iso3 },
        {
          $set: {
            "geography.borders": borders,
            "geography.majorCities": majorCities
          }
        }
      );

      console.log(`Updated ${iso3}`);
      updated++;

    }

    console.log("Finished updating all countries");

  } catch (error) {

    console.error(error);
    throw error;

  }

  return { updated, total: updated };

}

module.exports = updateBordersAndCities;

if (require.main === module) {
  require("dotenv").config();
  require("./database")();
  mongoose.connection.once("open", () => {
    updateBordersAndCities()
      .then((summary) => { console.log(summary); process.exit(0); })
      .catch((err) => { console.error("Fatal:", err); process.exit(1); });
  });
}