const express = require("express");
const router = express.Router();

const { login, logout, me } = require("../Controller/adminAuth");
const { listSections, refreshSection, refreshAll, getJob } = require("../Controller/adminData");
const { getSchedule, updateSchedule } = require("../Controller/adminSchedule");
const { requireAdmin } = require("../Utils/authMiddleware");

router.post("/login", login);
router.post("/logout", logout);
router.get("/me", requireAdmin, me);

router.get("/sections", requireAdmin, listSections);
router.post("/sections/:key/refresh", requireAdmin, refreshSection);
router.post("/refresh-all", requireAdmin, refreshAll);
router.get("/jobs/:id", requireAdmin, getJob);

router.get("/schedule", requireAdmin, getSchedule);
router.put("/schedule", requireAdmin, updateSchedule);

module.exports = router;
