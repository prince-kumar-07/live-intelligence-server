import "dotenv/config";
import mongoose from "mongoose";
import IntelData from "../Model/IntelData.js";



export const countries = [
  { name:"USA",      coords:[-77.0369, 38.9072], flag:"🇺🇸", threatLevel:3, military:97, nuclear:true,  alliance:"NATO"        },
  { name:"Russia",   coords:[ 37.6173, 55.7558], flag:"🇷🇺", threatLevel:5, military:89, nuclear:true,  alliance:"CSTO"        },
  { name:"Ukraine",  coords:[ 30.5234, 50.4501], flag:"🇺🇦", threatLevel:5, military:42, nuclear:false, alliance:"NATO-Allied"  },
  { name:"China",    coords:[116.4074, 39.9042], flag:"🇨🇳", threatLevel:4, military:88, nuclear:true,  alliance:"SCO"         },
  { name:"Taiwan",   coords:[121.5654, 25.0330], flag:"🇹🇼", threatLevel:4, military:30, nuclear:false, alliance:"US-Allied"   },
  { name:"Israel",   coords:[ 34.7818, 32.0853], flag:"🇮🇱", threatLevel:4, military:55, nuclear:true,  alliance:"US-Allied"   },
  { name:"Iran",     coords:[ 51.3890, 35.6892], flag:"🇮🇷", threatLevel:4, military:52, nuclear:false, alliance:"Axis"        },
  { name:"Syria",    coords:[ 36.2765, 33.5138], flag:"🇸🇾", threatLevel:3, military:18, nuclear:false, alliance:"Russia-Ally" },
  { name:"N.Korea",  coords:[125.7625, 39.0392], flag:"🇰🇵", threatLevel:5, military:38, nuclear:true,  alliance:"China-Ally"  },
  { name:"India",    coords:[ 77.2090, 28.6139], flag:"🇮🇳", threatLevel:2, military:72, nuclear:true,  alliance:"Neutral"     },
  { name:"Pakistan", coords:[ 73.0479, 33.7215], flag:"🇵🇰", threatLevel:3, military:46, nuclear:true,  alliance:"SCO"         },
  { name:"Turkey",   coords:[ 32.8597, 39.9334], flag:"🇹🇷", threatLevel:3, military:51, nuclear:false, alliance:"NATO"        },
];

export const warEvents = [
  {
    id:1, from:"Russia", to:"Ukraine", type:"Missile Strike",
    severity:"critical", casualties:12, timestamp:"2 min ago",
    description:"Ballistic missile barrage targeting energy infrastructure in Kyiv and Kharkiv oblasts.",
  },
  {
    id:2, from:"Iran", to:"Israel", type:"Drone Attack",
    severity:"high", casualties:0, timestamp:"18 min ago",
    description:"Shahed-136 drone swarm launched from Iranian territory, intercepted over the Negev.",
  },
  {
    id:3, from:"China", to:"Taiwan", type:"Naval Drill",
    severity:"high", casualties:0, timestamp:"1 hr ago",
    description:"PLA carrier group live-fire exercises 40 nm from Taiwan Strait median line.",
  },
  {
    id:4, from:"USA", to:"Syria", type:"Airstrike",
    severity:"medium", casualties:8, timestamp:"3 hr ago",
    description:"F-15E strikes on IRGC-affiliated militia positions in eastern Syria.",
  },
  {
    id:5, from:"Russia", to:"Ukraine", type:"Artillery",
    severity:"critical", casualties:24, timestamp:"5 hr ago",
    description:"Sustained MLRS bombardment along the Zaporizhzhia front, 340+ rounds fired.",
  },
];

export const predictedConflicts = [
  {
    id:"p1", from:"China", to:"Taiwan",
    probability:74, trend:"rising", timeline:"12–18 months", classification:"CRITICAL",
    drivers:[
      "PLA encirclement drills up 340% in 2024",
      "Xi Jinping 2027 reunification deadline",
      "TSMC semiconductor leverage as trigger",
      "US Taiwan Relations Act ambiguity exploited",
    ],
    indicators:{ Military:82, Political:78, Economic:44, Intelligence:71 },
    lastUpdated:"6 hr ago",
  },
  {
    id:"p2", from:"Iran", to:"Israel",
    probability:65, trend:"rising", timeline:"3–9 months", classification:"HIGH",
    drivers:[
      "Direct exchange of strikes post-Oct 7 precedent",
      "Iranian nuclear 60% enrichment threshold",
      "Hezbollah proxy pressure from south Lebanon",
      "IRGC generals assassinated on Iranian soil",
    ],
    indicators:{ Military:70, Political:74, Economic:35, Intelligence:68 },
    lastUpdated:"30 min ago",
  },
  {
    id:"p3", from:"N.Korea", to:"USA",
    probability:38, trend:"rising", timeline:"6–24 months", classification:"HIGH",
    drivers:[
      "Hwasong-18 solid-fuel ICBM now operational",
      "Russia-DPRK military technology exchange",
      "ICBM tests breaching UN resolutions",
      "Kim Jong-un internal consolidation complete",
    ],
    indicators:{ Military:61, Political:52, Economic:18, Intelligence:44 },
    lastUpdated:"2 hr ago",
  },
  {
    id:"p4", from:"India", to:"Pakistan",
    probability:29, trend:"stable", timeline:"12–36 months", classification:"MEDIUM",
    drivers:[
      "Kashmir Line of Control skirmishes rising",
      "Indus Waters Treaty suspension",
      "Pakistan economic collapse destabilising military",
      "Cross-border terror attacks attributed to ISI",
    ],
    indicators:{ Military:48, Political:55, Economic:39, Intelligence:30 },
    lastUpdated:"1 day ago",
  },
  {
    id:"p5", from:"Turkey", to:"Syria",
    probability:51, trend:"stable", timeline:"6–18 months", classification:"HIGH",
    drivers:[
      "SDF/YPG expansion in northern Syria",
      "Erdoğan domestic pressure for military action",
      "US withdrawal reducing deterrence signals",
      "Refugee crisis fuelling opposition",
    ],
    indicators:{ Military:60, Political:65, Economic:28, Intelligence:49 },
    lastUpdated:"4 hr ago",
  },
];

export const intelAlerts = [
  { id:"a1", level:"CRITICAL", text:"Russian strategic bombers on 4-hour alert at Engels-2 air base.", time:"8 min ago"  },
  { id:"a2", level:"HIGH",     text:"PLA amphibious assault group departing Zhoushan naval base.",    time:"22 min ago" },
  { id:"a3", level:"HIGH",     text:"IRGC Quds Force encrypted comms surge — 3× baseline detected.",  time:"1 hr ago"   },
  { id:"a4", level:"MEDIUM",   text:"Hwasong-18 ICBM mobile launcher repositioning observed via sat.", time:"2 hr ago"   },
  { id:"a5", level:"MEDIUM",   text:"Wagner Group redeployment Mali→Libya — 2,400 personnel.",        time:"6 hr ago"   },
];

export const SEVERITY_COLOR = { critical:"#e84545", high:"#f59e0b", medium:"#60a5fa", low:"#4ade80" };
export const ALERT_COLOR    = { CRITICAL:"#e84545", HIGH:"#f59e0b", MEDIUM:"#60a5fa" };
export const TREND_ICON     = { rising:"↑", stable:"→", falling:"↓" };

// import {
//   countries,
//   warEvents,
//   predictedConflicts,
//   intelAlerts,
//   SEVERITY_COLOR,
//   ALERT_COLOR,
//   TREND_ICON
// } from "./intelDataset.js";

async function run(){

await mongoose.connect(process.env.DATABASE_URL);

 await IntelData.deleteMany({});

 await IntelData.create({

   countries,
   warEvents,
   predictedConflicts,
   intelAlerts,
   SEVERITY_COLOR,
   ALERT_COLOR,
   TREND_ICON

 });

 console.log("Intel dataset stored successfully");

 process.exit();

}

run();


