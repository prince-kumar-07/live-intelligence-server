import "dotenv/config";
import mongoose from "mongoose";
import PassportScores from "../Model/PassportScore.js"

export const PASSPORT_SCORES = {
  Japan: 193,
  Singapore: 192,
  Germany: 190,
  France: 190,
  Italy: 189,
  Spain: 189,
  Finland: 188,
  "South Korea": 188,
  Sweden: 188,
  Netherlands: 187,
  Denmark: 187,
  Austria: 187,
  "United Kingdom": 187,
  "United States of America": 186,
  Canada: 185,
  Belgium: 185,
  Switzerland: 185,
  Portugal: 185,
  Ireland: 185,
  Australia: 184,
  "New Zealand": 184,
  Greece: 184,
  Norway: 184,
  Poland: 183,
  Hungary: 183,
  "Czech Republic": 183,
  Slovakia: 182,
  Estonia: 182,
  Lithuania: 182,
  Latvia: 182,
  Slovenia: 182,
  Malaysia: 179,
  Chile: 175,
  Brazil: 171,
  Argentina: 170,
  Israel: 170,
  Mexico: 158,
  Uruguay: 154,
  "Costa Rica": 152,
  Barbados: 157,
  "Trinidad and Tobago": 147,
  Paraguay: 146,
  Mauritius: 148,
  "United Arab Emirates": 180,
  Qatar: 162,
  Kuwait: 172,
  Bahrain: 160,
  Russia: 118,
  Turkey: 114,
  "South Africa": 108,
  Oman: 132,
  "Saudi Arabia": 90,
  Colombia: 148,
  Peru: 142,
  Ecuador: 135,
  Bolivia: 130,
  Panama: 148,
  Jamaica: 87,
  Ukraine: 145,
  Moldova: 122,
  Georgia: 133,
  Armenia: 124,
  Kazakhstan: 76,
  Uzbekistan: 77,
  Belarus: 79,
  Thailand: 82,
  Indonesia: 73,
  Vietnam: 55,
  Philippines: 67,
  Morocco: 67,
  Tunisia: 67,
  Algeria: 52,
  Egypt: 50,
  Jordan: 79,
  Lebanon: 40,
  Albania: 120,
  Serbia: 129,
  "Bosnia and Herzegovina": 124,
  "North Macedonia": 124,
  Montenegro: 131,
  Romania: 175,
  Bulgaria: 175,
  Croatia: 183,
  Cyprus: 175,
  Malta: 186,
  Luxembourg: 187,
  Iceland: 188,
  Liechtenstein: 187,
  Monaco: 185,
  "San Marino": 185,
  Nigeria: 46,
  Kenya: 73,
  Ghana: 67,
  Tanzania: 57,
  Ethiopia: 42,
  Senegal: 55,
  "Ivory Coast": 63,
  Cameroon: 50,
  Uganda: 53,
  Rwanda: 72,
  Zimbabwe: 48,
  Zambia: 65,
  Mozambique: 50,
  Angola: 51,
  "Democratic Republic of the Congo": 45,
  Congo: 48,
  Sudan: 36,
  "South Sudan": 28,
  Somalia: 30,
  Libya: 39,
  Syria: 30,
  Yemen: 31,
  Iraq: 31,
  Iran: 39,
  "North Korea": 42,
  Myanmar: 56,
  Cambodia: 51,
  Bangladesh: 42,
  Nepal: 48,
  "Sri Lanka": 44,
  Laos: 51,
  Mongolia: 62,
  "Papua New Guinea": 51,
  Fiji: 91,
  Guatemala: 121,
  Honduras: 116,
  "El Salvador": 132,
  Nicaragua: 117,
  "Dominican Republic": 148,
  Cuba: 64,
  Haiti: 49,
  Venezuela: 48,
  China: 80,
  India: 60,
  Pakistan: 33,
  Afghanistan: 27,
};


async function run() {

  await mongoose.connect(process.env.DATABASE_URL);

  await PassportScores.deleteMany({});

  await PassportScores.create({
    scores: PASSPORT_SCORES
  });

  console.log("Passport scores inserted");

  process.exit();
}

run();









