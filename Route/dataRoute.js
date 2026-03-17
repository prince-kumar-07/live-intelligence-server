const express = require("express");
const router = express.Router();

const { getCountryByName } = require("../Controller/getData");
const { getCountryNews } = require("../Controller/newsController");
const { getLiveStreams } = require("../Controller/fetchLiveStreams");
const {
  getPassportByCountry,
  getPassportByCode,
  getTopPassports,
  getPassportsByTier,
  comparePassports,
} = require("../Controller/Passport");




router.get("/countries/:name", getCountryByName);
router.get("/news", getCountryNews);
router.get("/streams", getLiveStreams);


router.get("/passport/rank/top/:n",     getTopPassports);
router.get("/passport/tier/:tier",      getPassportsByTier);
router.get("/passport/compare/:a/:b",   comparePassports);
router.get("/passport/code/:countryCode", getPassportByCode);
router.get("/passport/:countryName",    getPassportByCountry);  



module.exports = router;