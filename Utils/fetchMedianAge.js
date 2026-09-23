const mongoose = require("mongoose");
const Country = require("../Model/Country");

async function updateMedianAge(){

const medianAgeData = {
USA:38.5,
IND:28.2,
DEU:45.7,
FRA:42.3,
JPN:49.5,
CHN:39.0,
BRA:33.5,
RUS:40.3
};

let updated = 0;

for(const iso in medianAgeData){

await Country.updateOne(
{ iso3:iso },
{ $set:{ "demographics.medianAge": medianAgeData[iso] } }
);

updated++;

}

console.log("Median age updated");

return { updated, total: Object.keys(medianAgeData).length };

}

module.exports = updateMedianAge;

if (require.main === module) {
  require("dotenv").config();
  require("./database")();
  mongoose.connection.once("open", () => {
    updateMedianAge()
      .then((summary) => { console.log(summary); process.exit(0); })
      .catch((err) => { console.error("Fatal:", err); process.exit(1); });
  });
}