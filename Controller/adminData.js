const sections = require("../Utils/sections");
const jobRunner = require("../Utils/jobRunner");

exports.listSections = (req, res) => {
  const data = Object.entries(sections).map(([key, section]) => ({
    key,
    label: section.label,
    description: section.description,
    lastJob: jobRunner.getLatestJobForSection(key),
  }));

  res.status(200).json({
    success: true,
    data,
    busy: jobRunner.isBusy(),
    latestQueueJob: jobRunner.getLatestQueueJob(),
  });
};

exports.refreshSection = (req, res) => {
  try {
    const job = jobRunner.startJob(req.params.key);
    res.status(202).json({ success: true, data: job });
  } catch (error) {
    res.status(error.status || 500).json({ success: false, message: error.message });
  }
};

exports.refreshAll = (req, res) => {
  try {
    const job = jobRunner.startQueue();
    res.status(202).json({ success: true, data: job });
  } catch (error) {
    res.status(error.status || 500).json({ success: false, message: error.message });
  }
};

exports.getJob = (req, res) => {
  const job = jobRunner.getJob(req.params.id);
  if (!job) {
    return res.status(404).json({ success: false, message: "Job not found" });
  }
  res.status(200).json({ success: true, data: job });
};
