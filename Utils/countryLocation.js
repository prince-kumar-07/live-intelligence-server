import "dotenv/config";
import mongoose from "mongoose";
import CountryLocation from "../Model/CountryLocation.js";

 const locations = [
  { name: "Afghanistan", coords: [67, 33] },
  { name: "Albania", coords: [20, 41] },
  { name: "Algeria", coords: [3, 28] },
  { name: "Andorra", coords: [1.6, 42.5] },
  { name: "Angola", coords: [17.8, -11.2] },
  { name: "Argentina", coords: [-64, -34] },
  { name: "Armenia", coords: [45, 40] },
  { name: "Australia", coords: [134, -25] },
  { name: "Austria", coords: [14.5, 47.5] },
  { name: "Azerbaijan", coords: [47.5, 40.5] },

  { name: "Bahamas", coords: [-77, 25] },
  { name: "Bahrain", coords: [50.5, 26] },
  { name: "Bangladesh", coords: [90, 24] },
  { name: "Belgium", coords: [4, 50.8] },
  { name: "Belarus", coords: [28, 53] },
  { name: "Belize", coords: [-88.7, 17.2] },
  { name: "Benin", coords: [2.3, 9.5] },
  { name: "Bhutan", coords: [90.5, 27.5] },
  { name: "Bolivia", coords: [-64, -17] },
  { name: "Bosnia and Herzegovina", coords: [17.8, 44] },
  { name: "Botswana", coords: [24, -22] },
  { name: "Brazil", coords: [-51, -10] },
  { name: "Brunei", coords: [114.7, 4.5] },
  { name: "Bulgaria", coords: [25, 43] },
  { name: "Burkina Faso", coords: [-2, 12] },
  { name: "Burundi", coords: [30, -3] },

  { name: "Cambodia", coords: [104.9, 12.5] },
  { name: "Cameroon", coords: [12, 6] },
  { name: "Canada", coords: [-106, 56] },
  { name: "Central African Republic", coords: [20, 6] },
  { name: "Chad", coords: [18, 15] },
  { name: "Chile", coords: [-71, -30] },
  { name: "China", coords: [104, 35] },
  { name: "Colombia", coords: [-74, 4] },
  { name: "Costa Rica", coords: [-84, 10] },
  { name: "Croatia", coords: [16, 45] },
  { name: "Cuba", coords: [-79.5, 21.5] },
  { name: "Cyprus", coords: [33, 35] },
  { name: "Czech Republic", coords: [15, 49] },

  { name: "Denmark", coords: [10, 56] },
  { name: "Dominican Republic", coords: [-70.5, 19] },

  { name: "Ecuador", coords: [-78, -1] },
  { name: "Egypt", coords: [30, 26] },
  { name: "El Salvador", coords: [-88.9, 13.7] },
  { name: "Estonia", coords: [25, 58.6] },
  { name: "Ethiopia", coords: [40, 9] },

  { name: "Finland", coords: [26, 64] },
  { name: "France", coords: [2, 46] },

  { name: "Georgia", coords: [43.5, 42] },
  { name: "Germany", coords: [10, 51] },
  { name: "Ghana", coords: [-1, 7.9] },
  { name: "Greece", coords: [22, 39] },
  { name: "Guatemala", coords: [-90, 15.5] },

  { name: "Haiti", coords: [-72.3, 19] },
  { name: "Honduras", coords: [-86.5, 15] },
  { name: "Hungary", coords: [19, 47] },

  { name: "Iceland", coords: [-19, 65] },
  { name: "India", coords: [78, 22] },
  { name: "Indonesia", coords: [113, -2] },
  { name: "Iran", coords: [53, 32] },
  { name: "Iraq", coords: [44, 33] },
  { name: "Ireland", coords: [-8, 53] },
  { name: "Israel", coords: [35, 31] },
  { name: "Italy", coords: [12, 42] },

  { name: "Jamaica", coords: [-77.3, 18.1] },
  { name: "Japan", coords: [138, 36] },
  { name: "Jordan", coords: [36, 31] },

  { name: "Kazakhstan", coords: [66, 48] },
  { name: "Kenya", coords: [37, -1] },
  { name: "Kuwait", coords: [47.5, 29] },
  { name: "Kyrgyzstan", coords: [74.5, 41] },

  { name: "Laos", coords: [103.8, 19] },
  { name: "Latvia", coords: [25, 57] },
  { name: "Lebanon", coords: [35.8, 33.8] },
  { name: "Liberia", coords: [-9.5, 6.5] },
  { name: "Libya", coords: [17, 27] },
  { name: "Lithuania", coords: [24, 55] },
  { name: "Luxembourg", coords: [6, 49.8] },

  { name: "Madagascar", coords: [47, -20] },
  { name: "Malaysia", coords: [102, 4] },
  { name: "Maldives", coords: [73, 3] },
  { name: "Mali", coords: [-3, 17] },
  { name: "Malta", coords: [14.4, 35.9] },
  { name: "Mexico", coords: [-102, 23] },
  { name: "Moldova", coords: [28.8, 47] },
  { name: "Mongolia", coords: [103, 46] },
  { name: "Morocco", coords: [-7, 31] },

  { name: "Nepal", coords: [84, 28] },
  { name: "Netherlands", coords: [5, 52] },
  { name: "New Zealand", coords: [174, -41] },
  { name: "Nicaragua", coords: [-85, 13] },
  { name: "Nigeria", coords: [8, 9] },
  { name: "North Korea", coords: [127, 40] },
  { name: "Norway", coords: [8, 61] },

  { name: "Oman", coords: [57, 21] },

  { name: "Pakistan", coords: [69, 30] },
  { name: "Panama", coords: [-80, 9] },
  { name: "Paraguay", coords: [-58, -23] },
  { name: "Peru", coords: [-75, -9] },
  { name: "Philippines", coords: [122, 13] },
  { name: "Poland", coords: [19, 52] },
  { name: "Portugal", coords: [-8, 39.5] },

  { name: "Qatar", coords: [51, 25] },

  { name: "Romania", coords: [25, 46] },
  { name: "Russia", coords: [37, 55] },

  { name: "Saudi Arabia", coords: [45, 24] },
  { name: "Serbia", coords: [21, 44] },
  { name: "Singapore", coords: [103.8, 1.3] },
  { name: "Slovakia", coords: [19.5, 48.7] },
  { name: "Slovenia", coords: [14.9, 46] },
  { name: "Somalia", coords: [46, 5] },
  { name: "South Africa", coords: [24, -29] },
  { name: "South Korea", coords: [127, 36] },
  { name: "Spain", coords: [-4, 40] },
  { name: "Sri Lanka", coords: [81, 7] },
  { name: "Sudan", coords: [30, 15] },
  { name: "Sweden", coords: [15, 62] },
  { name: "Switzerland", coords: [8, 47] },
  { name: "Syria", coords: [38, 35] },

  { name: "Taiwan", coords: [121, 23.7] },
  { name: "Thailand", coords: [101, 15] },
  { name: "Tunisia", coords: [10, 34] },
  { name: "Turkey", coords: [35, 39] },

  { name: "Ukraine", coords: [31, 49] },
  { name: "United Arab Emirates", coords: [54, 24] },
  { name: "United Kingdom", coords: [-3, 55] },
  { name: "United States", coords: [-98, 38] },
  { name: "Uruguay", coords: [-56, -33] },
  { name: "Uzbekistan", coords: [64, 41] },

  { name: "Venezuela", coords: [-66, 7] },
  { name: "Vietnam", coords: [106, 16] },

  { name: "Yemen", coords: [48, 15] },

  { name: "Zambia", coords: [27, -15] },
  { name: "Zimbabwe", coords: [30, -19] },
];

async function run(){

await mongoose.connect(process.env.DATABASE_URL);

await CountryLocation.deleteMany({});

await CountryLocation.insertMany(locations);

console.log("Country locations inserted");

process.exit();

}

run();