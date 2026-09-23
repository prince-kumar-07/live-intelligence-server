const scheduler = require("../Utils/scheduler");

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

exports.getSchedule = async (req, res) => {
  try {
    const schedule = await scheduler.getSchedule();
    res.status(200).json({ success: true, data: schedule });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateSchedule = async (req, res) => {
  try {
    const { enabled, frequency, dayOfWeek, time } = req.body;

    if (frequency !== undefined && !["daily", "weekly"].includes(frequency)) {
      return res.status(400).json({ success: false, message: "frequency must be 'daily' or 'weekly'" });
    }

    if (dayOfWeek !== undefined && (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6)) {
      return res.status(400).json({ success: false, message: "dayOfWeek must be an integer 0-6" });
    }

    if (time !== undefined && !TIME_RE.test(time)) {
      return res.status(400).json({ success: false, message: "time must be in HH:MM (24-hour) format" });
    }

    const schedule = await scheduler.updateSchedule({ enabled, frequency, dayOfWeek, time });
    res.status(200).json({ success: true, data: schedule });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
