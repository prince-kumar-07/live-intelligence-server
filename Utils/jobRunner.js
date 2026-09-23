const crypto = require("crypto");
const sections = require("./sections");
const JobHistory = require("../Model/JobHistory");

// In-memory job store — gives live progress/log streaming while a job is
// running. Each section's most recent COMPLETED result is also persisted
// to MongoDB (see persistJobHistory/loadPersistedHistory below) so "last
// run" survives a server restart instead of resetting to "Never run".
const jobs = new Map();
const latestJobBySection = new Map();
let latestQueueJobId = null;

const MAX_PERSISTED_LOGS = 100;

function persistJobHistory(job) {
  JobHistory.updateOne(
    { sectionKey: job.sectionKey },
    {
      $set: {
        status: job.status,
        startedAt: job.startedAt,
        finishedAt: job.finishedAt,
        summary: job.summary,
        error: job.error,
        logs: job.logs.slice(-MAX_PERSISTED_LOGS),
      },
    },
    { upsert: true }
  ).catch((err) => console.error(`Failed to persist job history for "${job.sectionKey}":`, err.message));
}

// Call once at server startup — restores each section's last-known result
// so the dashboard doesn't show "Never run" right after a restart.
async function loadPersistedHistory() {
  const records = await JobHistory.find({}).lean();
  for (const rec of records) {
    const job = {
      id: crypto.randomUUID(),
      type: "single",
      sectionKey: rec.sectionKey,
      status: rec.status,
      startedAt: rec.startedAt,
      finishedAt: rec.finishedAt,
      logs: rec.logs || [],
      summary: rec.summary,
      error: rec.error,
      settled: true,
    };
    jobs.set(job.id, job);
    latestJobBySection.set(rec.sectionKey, job.id);
  }
}

const JOB_TIMEOUT_MS = 5 * 60 * 1000;

let activeJob = null; // the single/queue job currently holding the lock

function serializeJob(job) {
  if (!job) return null;

  if (job.type === "queue") {
    return {
      id: job.id,
      type: "queue",
      status: job.status,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
      currentSectionKey: job.currentSectionKey,
      steps: job.stepJobIds.map((id) => serializeJob(jobs.get(id))),
      progress: { completed: job.completedCount, total: job.totalCount },
    };
  }

  return {
    id: job.id,
    type: "single",
    sectionKey: job.sectionKey,
    status: job.status,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    logs: job.logs,
    summary: job.summary,
    error: job.error,
  };
}

// Runs one section's fetcher, writing into `job`. Does not touch the
// activeJob lock — the caller (startJob or the queue runner) owns that.
function runSection(sectionKey, job) {
  const section = sections[sectionKey];

  const push = (level) => (...args) => {
    job.logs.push({
      level,
      message: args.map(String).join(" "),
      time: new Date().toISOString(),
    });
  };

  const original = { log: console.log, warn: console.warn, error: console.error };
  console.log = (...a) => { push("info")(...a); original.log(...a); };
  console.warn = (...a) => { push("warn")(...a); original.warn(...a); };
  console.error = (...a) => { push("error")(...a); original.error(...a); };

  const restore = () => {
    console.log = original.log;
    console.warn = original.warn;
    console.error = original.error;
  };

  return new Promise((resolve) => {
    // Belt-and-suspenders: if a fetcher hangs (e.g. a stalled request with
    // no axios timeout), don't let it wedge the whole console — resolve
    // this step as an error instead of hanging forever.
    const watchdog = setTimeout(() => {
      if (job.settled) return;
      job.settled = true;
      job.status = "error";
      job.error = `Timed out after ${JOB_TIMEOUT_MS / 1000}s (the underlying fetch never returned).`;
      job.finishedAt = new Date().toISOString();
      restore();
      persistJobHistory(job);
      resolve();
    }, JOB_TIMEOUT_MS);

    section
      .run()
      .then((summary) => {
        if (job.settled) return;
        job.settled = true;
        job.status = "success";
        job.summary = summary ?? null;
      })
      .catch((err) => {
        if (job.settled) return;
        job.settled = true;
        job.status = "error";
        job.error = err.message || String(err);
      })
      .finally(() => {
        clearTimeout(watchdog);
        if (!job.finishedAt) {
          restore();
          job.finishedAt = new Date().toISOString();
          persistJobHistory(job);
        }
        resolve();
      });
  });
}

function makeJob(sectionKey) {
  const job = {
    id: crypto.randomUUID(),
    type: "single",
    sectionKey,
    status: "running",
    startedAt: new Date().toISOString(),
    finishedAt: null,
    logs: [],
    summary: null,
    error: null,
    settled: false,
  };
  jobs.set(job.id, job);
  latestJobBySection.set(sectionKey, job.id);
  return job;
}

function startJob(sectionKey) {
  if (!sections[sectionKey]) {
    const err = new Error(`Unknown section: ${sectionKey}`);
    err.status = 404;
    throw err;
  }

  if (activeJob) {
    const err = new Error(
      `A refresh is already running (${describeActive()}). Wait for it to finish.`
    );
    err.status = 409;
    throw err;
  }

  const job = makeJob(sectionKey);
  activeJob = job;

  runSection(sectionKey, job).then(() => {
    if (activeJob === job) activeJob = null;
  });

  return serializeJob(job);
}

function describeActive() {
  if (!activeJob) return "nothing";
  if (activeJob.type === "queue") return `refresh-all, currently on "${activeJob.currentSectionKey}"`;
  return `"${activeJob.sectionKey}"`;
}

// Runs every section sequentially as one queued job. One section failing
// doesn't stop the queue — it moves on to the next.
function startQueue(sectionKeys) {
  const keys = sectionKeys ?? Object.keys(sections);
  const unknown = keys.find((k) => !sections[k]);
  if (unknown) {
    const err = new Error(`Unknown section: ${unknown}`);
    err.status = 404;
    throw err;
  }

  if (activeJob) {
    const err = new Error(
      `A refresh is already running (${describeActive()}). Wait for it to finish.`
    );
    err.status = 409;
    throw err;
  }

  const queueJob = {
    id: crypto.randomUUID(),
    type: "queue",
    status: "running",
    startedAt: new Date().toISOString(),
    finishedAt: null,
    currentSectionKey: keys[0] ?? null,
    stepJobIds: [],
    completedCount: 0,
    totalCount: keys.length,
  };
  jobs.set(queueJob.id, queueJob);
  latestQueueJobId = queueJob.id;
  activeJob = queueJob;

  (async () => {
    for (const key of keys) {
      queueJob.currentSectionKey = key;
      const stepJob = makeJob(key);
      queueJob.stepJobIds.push(stepJob.id);

      await runSection(key, stepJob);

      queueJob.completedCount++;
    }

    queueJob.status = "success";
    queueJob.currentSectionKey = null;
    queueJob.finishedAt = new Date().toISOString();
    if (activeJob === queueJob) activeJob = null;
  })();

  return serializeJob(queueJob);
}

function getJob(id) {
  return serializeJob(jobs.get(id));
}

function getLatestJobForSection(sectionKey) {
  const id = latestJobBySection.get(sectionKey);
  return id ? getJob(id) : null;
}

function getLatestQueueJob() {
  return latestQueueJobId ? getJob(latestQueueJobId) : null;
}

function isBusy() {
  return activeJob !== null;
}

module.exports = {
  startJob,
  startQueue,
  getJob,
  getLatestJobForSection,
  getLatestQueueJob,
  isBusy,
  loadPersistedHistory,
};
