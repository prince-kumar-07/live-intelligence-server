import "dotenv/config";
import mongoose from "mongoose";
import CountryFips from "../Model/CountryFIPS.js";

export const COUNTRY_FIPS = {
  "afghanistan":"AF","albania":"AL","algeria":"AG","angola":"AO","argentina":"AR",
  "armenia":"AM","australia":"AS","austria":"AU","azerbaijan":"AJ","bahrain":"BA",
  "bangladesh":"BG","belarus":"BO","belgium":"BE","belize":"BH","benin":"BN",
  "bhutan":"BT","bolivia":"BL","bosnia":"BK","botswana":"BC","brazil":"BR",
  "brunei":"BX","bulgaria":"BU","burkina faso":"UV","burundi":"BY","cambodia":"CB",
  "cameroon":"CM","canada":"CA","chad":"CD","chile":"CI","china":"CH",
  "colombia":"CO","costa rica":"CS","croatia":"HR","cuba":"CU","cyprus":"CY",
  "czech republic":"EZ","czechia":"EZ","denmark":"DA","djibouti":"DJ",
  "dominican republic":"DR","dr congo":"CF","ecuador":"EC","egypt":"EG",
  "el salvador":"ES","eritrea":"ER","estonia":"EN","ethiopia":"ET","fiji":"FJ",
  "finland":"FI","france":"FR","gabon":"GB","georgia":"GG","germany":"GM",
  "ghana":"GH","greece":"GR","guatemala":"GT","guinea":"GV","haiti":"HA",
  "honduras":"HO","hungary":"HU","iceland":"IC","india":"IN","indonesia":"ID",
  "iran":"IR","iraq":"IZ","ireland":"EI","israel":"IS","italy":"IT",
  "ivory coast":"IV","jamaica":"JM","japan":"JA","jordan":"JO","kazakhstan":"KZ",
  "kenya":"KE","north korea":"KN","south korea":"KS","kuwait":"KU",
  "kyrgyzstan":"KG","laos":"LA","latvia":"LG","lebanon":"LE","liberia":"LI",
  "libya":"LY","lithuania":"LH","luxembourg":"LU","madagascar":"MA","malawi":"MI",
  "malaysia":"MY","mali":"ML","mauritania":"MR","mexico":"MX","moldova":"MD",
  "mongolia":"MN","montenegro":"MJ","morocco":"MO","mozambique":"MZ",
  "myanmar":"BM","namibia":"WA","nepal":"NP","netherlands":"NL","new zealand":"NZ",
  "nicaragua":"NU","niger":"NG","nigeria":"NI","norway":"NO","oman":"MU",
  "pakistan":"PK","panama":"PM","paraguay":"PA","peru":"PE","philippines":"PS",
  "poland":"PL","portugal":"PO","qatar":"QA","romania":"RO","russia":"RS",
  "rwanda":"RW","saudi arabia":"SA","senegal":"SG","serbia":"RI","singapore":"SN",
  "slovakia":"LO","slovenia":"SI","somalia":"SO","south africa":"SF",
  "south sudan":"OD","spain":"SP","sri lanka":"CE","sudan":"SU","sweden":"SW",
  "switzerland":"SZ","syria":"SY","taiwan":"TW","tajikistan":"TI","tanzania":"TZ",
  "thailand":"TH","togo":"TO","tunisia":"TS","turkey":"TU","turkmenistan":"TX",
  "uganda":"UG","ukraine":"UP","uae":"AE","united arab emirates":"AE",
  "united kingdom":"UK","uk":"UK","united states":"US","usa":"US",
  "uruguay":"UY","uzbekistan":"UZ","venezuela":"VE","vietnam":"VM","yemen":"YM",
  "zambia":"ZA","zimbabwe":"ZI",
};

async function run(){
    
await mongoose.connect(process.env.DATABASE_URL);

 await CountryFips.deleteMany({});

 await CountryFips.create({
   codes: COUNTRY_FIPS
 });

 console.log("FIPS inserted");

 process.exit();

}

run();