require("dotenv").config();
const express = require("express");
const getData = require("./Route/dataRoute");
const dbConnect = require("./Utils/database");
const cors = require("cors");

const PORT = process.env.PORT || 4000;
const app = express();

app.use(cors({
  origin: "http://localhost:5173",
  credentials: true
}));

app.use(express.json());

app.use("/api/v1", getData);

app.get("/", (req, res) => {
  res.send("<h1>This is Homepage baby</h1>");
});

// connect DB
dbConnect();

// start server
app.listen(PORT, () => {
  console.log(`Server started successfully at ${PORT}`);
});