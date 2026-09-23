require("dotenv").config();
const mongoose = require("mongoose");
const fs = require("fs");

const Country = require("../Model/Country");

async function updateGovernmentData(){

await mongoose.connect(process.env.DATABASE_URL);

console.log("MongoDB Connected");

/* read JSON file */

const data = JSON.parse(
fs.readFileSync("./Utils/governmentData.json","utf-8")
);

let updated = 0;

for(const item of data){

const result = await Country.updateOne(
{ iso3:item.iso3 },
{
$set:{
"government.governmentType":item.governmentType,
"government.headOfState":item.headOfState
}
}
);

if(result.modifiedCount > 0){
updated++;
console.log("Updated:",item.iso3);
}

}

console.log("Total Updated:",updated);

mongoose.connection.close();

}

updateGovernmentData();