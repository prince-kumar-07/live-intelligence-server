const axios = require("axios");

// Get free API key:
// 1. Go to https://console.cloud.google.com
// 2. Create project → Enable "YouTube Data API v3"
// 3. Credentials → Create API K

// ISO2 country codes for YouTube regionCode param
const COUNTRY_ISO2 = {
  "afghanistan":"AF","albania":"AL","algeria":"DZ","angola":"AO","argentina":"AR",
  "armenia":"AM","australia":"AU","austria":"AT","azerbaijan":"AZ","bahrain":"BH",
  "bangladesh":"BD","belarus":"BY","belgium":"BE","bolivia":"BO","brazil":"BR",
  "brunei":"BN","bulgaria":"BG","cambodia":"KH","cameroon":"CM","canada":"CA",
  "chile":"CL","china":"CN","colombia":"CO","costa rica":"CR","croatia":"HR",
  "cuba":"CU","cyprus":"CY","czech republic":"CZ","czechia":"CZ","denmark":"DK",
  "ecuador":"EC","egypt":"EG","el salvador":"SV","eritrea":"ER","estonia":"EE",
  "ethiopia":"ET","finland":"FI","france":"FR","georgia":"GE","germany":"DE",
  "ghana":"GH","greece":"GR","guatemala":"GT","haiti":"HT","honduras":"HN",
  "hungary":"HU","iceland":"IS","india":"IN","indonesia":"ID","iran":"IR",
  "iraq":"IQ","ireland":"IE","israel":"IL","italy":"IT","jamaica":"JM",
  "japan":"JP","jordan":"JO","kazakhstan":"KZ","kenya":"KE","north korea":"KP",
  "south korea":"KR","kuwait":"KW","kyrgyzstan":"KG","laos":"LA","latvia":"LV",
  "lebanon":"LB","libya":"LY","lithuania":"LT","luxembourg":"LU","malaysia":"MY",
  "mexico":"MX","moldova":"MD","mongolia":"MN","montenegro":"ME","morocco":"MA",
  "mozambique":"MZ","myanmar":"MM","nepal":"NP","netherlands":"NL",
  "new zealand":"NZ","nicaragua":"NI","nigeria":"NG","norway":"NO","oman":"OM",
  "pakistan":"PK","panama":"PA","paraguay":"PY","peru":"PE","philippines":"PH",
  "poland":"PL","portugal":"PT","qatar":"QA","romania":"RO","russia":"RU",
  "rwanda":"RW","saudi arabia":"SA","senegal":"SN","serbia":"RS","singapore":"SG",
  "slovakia":"SK","slovenia":"SI","somalia":"SO","south africa":"ZA","spain":"ES",
  "sri lanka":"LK","sudan":"SD","sweden":"SE","switzerland":"CH","syria":"SY",
  "taiwan":"TW","tajikistan":"TJ","tanzania":"TZ","thailand":"TH","tunisia":"TN",
  "turkey":"TR","uganda":"UG","ukraine":"UA","uae":"AE","united arab emirates":"AE",
  "united kingdom":"GB","uk":"GB","united states":"US","usa":"US",
  "uruguay":"UY","uzbekistan":"UZ","venezuela":"VE","vietnam":"VN","yemen":"YE",
  "zambia":"ZM","zimbabwe":"ZW",
};

// Stream types
const STREAM_TYPES = {
  general: "{country} live stream",
  city: "{country} city live cam",
  traffic: "{country} traffic live camera",
  nature: "{country} nature live cam",
  news: "{country} news live",
  weather: "{country} weather live cam",
};

async function fetchLiveStreams({ country, type = "general", limit = 10 }) {

  const iso2 = COUNTRY_ISO2[country.toLowerCase().trim()];
  if (!iso2) throw new Error(`Country not found: "${country}"`);

  const queryTemplate = STREAM_TYPES[type.toLowerCase()] ?? STREAM_TYPES.general;
  const searchQuery = queryTemplate.replace("{country}", country);

  const url = "https://www.googleapis.com/youtube/v3/search";

  const { data } = await axios.get(url, {
    timeout: 15000,
    params: {
      key: YOUTUBE_API_KEY,
      q: searchQuery,
      part: "snippet",
      type: "video",
      eventType: "live",
      regionCode: iso2,
      maxResults: limit,
      relevanceLanguage: "en",
      safeSearch: "moderate",
      order: "viewCount",
    },
  });

  const items = data?.items ?? [];

  if (items.length === 0) return [];

  return items.map(item => {
    const videoId = item.id?.videoId;
    return {
      title: item.snippet?.title,
      channel: item.snippet?.channelTitle,
      description: item.snippet?.description,
      thumbnail: item.snippet?.thumbnails?.high?.url ?? item.snippet?.thumbnails?.default?.url,
      videoId,
      watchUrl: `https://www.youtube.com/watch?v=${videoId}`,
      embedUrl: `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1`,
      publishedAt: item.snippet?.publishedAt,
      country,
      type,
    };
  });
}


// Controller
const getLiveStreams = async (req, res) => {

  try {

    const { country, type = "general", limit = 10 } = req.query;

    if (!country) {
      return res.status(400).json({
        error: "country query param required"
      });
    }

    const streams = await fetchLiveStreams({
      country,
      type,
      limit: parseInt(limit),
    });

    res.json({
      country,
      type,
      count: streams.length,
      streams
    });

  } catch (error) {

    res.status(500).json({
      error: error.message
    });

  }

};

module.exports = { getLiveStreams };