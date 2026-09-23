const cron = require("node-cron");
const RefreshSchedule = require("../Model/RefreshSchedule");
const jobRunner = require("./jobRunner");

let task = null; // the currently-armed node-cron task, if any

function buildCronExpression(schedule) {
  const [hour, minute] = schedule.time.split(":").map(Number);

  if (schedule.frequency === "weekly") {
    return `${minute} ${hour} * * ${schedule.dayOfWeek}`;
  }
  return `${minute} ${hour} * * *`; // daily
}

function arm(schedule) {
  if (task) {
    task.stop();
    task = null;
  }

  if (!schedule.enabled) return;

  const expression = buildCronExpression(schedule);

  task = cron.schedule(expression, async () => {
    const doc = await RefreshSchedule.findOne();
    if (!doc || !doc.enabled) return;

    if (jobRunner.isBusy()) {
      doc.lastRunAt = new Date();
      doc.lastRunStatus = "skipped (console was already busy)";
      await doc.save();
      return;
    }

    doc.lastRunAt = new Date();
    doc.lastRunStatus = "started";
    await doc.save();

    try {
      jobRunner.startQueue();
    } catch (err) {
      doc.lastRunStatus = `failed to start: ${err.message}`;
      await doc.save();
    }
  });
}

// Call once at server startup — loads the persisted schedule and arms the
// cron job if it was left enabled.
async function init() {
  let schedule = await RefreshSchedule.findOne();
  if (!schedule) {
    schedule = await RefreshSchedule.create({});
  }
  arm(schedule);
}

async function getSchedule() {
  let schedule = await RefreshSchedule.findOne();
  if (!schedule) {
    schedule = await RefreshSchedule.create({});
  }
  return schedule;
}

async function updateSchedule(patch) {
  const schedule = await getSchedule();

  if (patch.enabled !== undefined) schedule.enabled = !!patch.enabled;
  if (patch.frequency !== undefined) schedule.frequency = patch.frequency;
  if (patch.dayOfWeek !== undefined) schedule.dayOfWeek = patch.dayOfWeek;
  if (patch.time !== undefined) schedule.time = patch.time;

  await schedule.save();
  arm(schedule);

  return schedule;
}

module.exports = { init, getSchedule, updateSchedule };
