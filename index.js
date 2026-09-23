require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cookieParser = require("cookie-parser");
const getData = require("./Route/dataRoute");
const adminRoute = require("./Route/adminRoute");
const dbConnect = require("./Utils/database");
const scheduler = require("./Utils/scheduler");
const jobRunner = require("./Utils/jobRunner");
const cors = require("cors");

const PORT = process.env.PORT || 4000;
const app = express();

app.use(cors({
  origin: "http://localhost:5173",
  credentials: true
}));

app.use(express.json());
app.use(cookieParser());

app.use("/api/v1", getData);
app.use("/api/v1/admin", adminRoute);

app.get("/", (req, res) => {
  res.send("<h1>This is Homepage baby</h1>");
});

// connect DB
dbConnect();
mongoose.connection.once("open", () => {
  scheduler.init().catch((err) => console.error("Scheduler init failed:", err));
  jobRunner.loadPersistedHistory().catch((err) => console.error("Job history load failed:", err));
});

// start server
app.listen(PORT, () => {
  console.log(`Server started successfully at ${PORT}`);
});