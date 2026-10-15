import { Prisma } from "@/generated/prisma/client";
import { getAppUrl } from "../app-url";
import { getPrismaClient } from "../prisma";
import { resumableSteps, runStep, stepLabel, type JobStep, type StepContext } from "./steps";

/**
 * The job queue. Every heavy task runs as a job for one customer, in slices that stay well within the
 * 300-second function limit; a slice that is cut off anyway (time or memory) is noticed and retried, and
 * after three attempts the job fails with a clear message instead of taking the environment down.
 */
// JOB_SLICE_MS only shortens slices in tests, to exercise continuing over several slices.
const SLICE_MS = Number(process.env.JOB_SLICE_MS) || 250_000;
/** Room kept free at the end of a slice: for saving, and so a step never starts with too little time. */
const MARGIN_MS = Math.min(30_000, SLICE_MS / 8);
/** A running slice that has not reported for this long has died (the function limit is 300 seconds). */
const STALE_MS = 6 * 60 * 1000;
const MAX_ATTEMPTS = 3;
/** At most this many jobs at once, however many workers are started: spares Copernica and the database. */
const MAX_PARALLEL = 3;
const ACTIVE = ["queued", "running"];

export type JobView = { id: string; trigger: string; steps: JobStep[]; stepIndex: number; status: string; progress: string | null; error: string | null; createdAt: Date; startedAt: Date | null; finishedAt: Date | null };

export async function activeJob(tenantId: string) {
  return getPrismaClient().job.findFirst({ where: { tenantId, status: { in: ACTIVE } }, orderBy: { createdAt: "desc" } });
}

/** The running job of a customer, or else the most recent one, for the status panel. */
export async function latestJob(tenantId: string): Promise<JobView | null> {
  const prisma = getPrismaClient();
  const job = (await activeJob(tenantId)) ?? (await prisma.job.findFirst({ where: { tenantId }, orderBy: { createdAt: "desc" } }));
  return job ? { ...job, steps: job.steps as JobStep[] } : null;
}

/**
 * Adds a job, unless the customer already has one waiting or running: then that one is returned, so two
 * clicks never start two heavy runs for the same customer.
 */
export async function enqueueJob(tenantId: string, steps: JobStep[], { trigger, requestedBy, params }: { trigger: "nightly" | "manual"; requestedBy?: string; params?: StepContext["params"] }) {
  const existing = await activeJob(tenantId);
  if (existing) return { job: existing, created: false };
  const job = await getPrismaClient().job.create({ data: { tenantId, steps, trigger, requestedBy: requestedBy ?? null, params: params ?? undefined } });
  return { job, created: true };
}

/** Takes the oldest job that is waiting, or whose last slice died, so only one worker runs it. */
async function claimNext(now = new Date()) {
  const prisma = getPrismaClient();
  const staleBefore = new Date(now.getTime() - STALE_MS);
  if ((await prisma.job.count({ where: { status: "running", heartbeatAt: { gte: staleBefore } } })) >= MAX_PARALLEL) return null;
  const candidates = await prisma.job.findMany({
    where: { OR: [{ status: "queued" }, { status: "running", heartbeatAt: { lt: staleBefore } }] },
    orderBy: { createdAt: "asc" },
    take: 10,
  });
  for (const candidate of candidates) {
    const died = candidate.status === "running";
    if (died && candidate.attempts + 1 >= MAX_ATTEMPTS) {
      await prisma.job.updateMany({ where: { id: candidate.id, status: "running" }, data: { status: "failed", finishedAt: now, error: `Afgebroken bij "${stepLabel[candidate.steps[candidate.stepIndex] as JobStep] ?? candidate.steps[candidate.stepIndex]}": de stap overschreed ${MAX_ATTEMPTS} keer de tijds- of geheugenlimiet.` } });
      continue;
    }
    const claimed = await prisma.job.updateMany({
      where: { id: candidate.id, status: candidate.status, heartbeatAt: candidate.heartbeatAt },
      data: { status: "running", heartbeatAt: now, startedAt: candidate.startedAt ?? now, ...(died ? { attempts: { increment: 1 } } : {}) },
    });
    if (claimed.count === 1) return { ...candidate, attempts: candidate.attempts + (died ? 1 : 0) };
  }
  return null;
}

/**
 * Runs one slice of the next job. Steps that cannot be split (the calculations) only start at the
 * beginning of a slice, so they always get the full time; the others continue from their cursor.
 */
export async function runNextSlice() {
  const prisma = getPrismaClient();
  const job = await claimNext();
  if (!job) return null;
  const sliceStart = Date.now();
  const deadline = sliceStart + SLICE_MS;
  const steps = job.steps as JobStep[];
  let stepIndex = job.stepIndex;
  let cursor: unknown = job.cursor;
  let progress = job.progress;
  try {
    while (stepIndex < steps.length) {
      const step = steps[stepIndex];
      if (!resumableSteps.has(step) && Date.now() - sliceStart > 5_000) break;
      if (Date.now() > deadline - MARGIN_MS) break;
      await prisma.job.update({ where: { id: job.id }, data: { heartbeatAt: new Date(), progress: `${stepLabel[step]}…` } });
      const result = await runStep(step, { tenantId: job.tenantId, cursor, params: job.params as StepContext["params"], deadline: deadline - MARGIN_MS });
      progress = result.progress ? `${stepLabel[step]}: ${result.progress}` : stepLabel[step];
      if (result.done) {
        stepIndex++;
        cursor = null;
      } else {
        cursor = result.cursor ?? null;
      }
      // A finished step resets the attempts: only a step that keeps dying fails the job.
      await prisma.job.update({ where: { id: job.id }, data: { stepIndex, cursor: cursor === null ? Prisma.DbNull : (cursor as object), progress, heartbeatAt: new Date(), ...(result.done ? { attempts: 0 } : {}) } });
      if (!result.done) break;
    }
    const finished = stepIndex >= steps.length;
    await prisma.job.update({ where: { id: job.id }, data: finished ? { status: "done", finishedAt: new Date(), cursor: Prisma.DbNull, error: null } : { status: "queued" } });
    return { jobId: job.id, finished };
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 300) : "Onbekende fout";
    const failed = job.attempts + 1 >= MAX_ATTEMPTS;
    await prisma.job.update({ where: { id: job.id }, data: failed ? { status: "failed", finishedAt: new Date(), error: `${stepLabel[steps[stepIndex]]}: ${message}` } : { status: "queued", attempts: { increment: 1 }, error: message } });
    return { jobId: job.id, finished: failed };
  }
}

/** Work for another worker run: waiting jobs, and jobs whose last slice died. */
export async function hasWaitingJobs(now = new Date()) {
  const staleBefore = new Date(now.getTime() - STALE_MS);
  return (await getPrismaClient().job.count({ where: { OR: [{ status: "queued" }, { status: "running", heartbeatAt: { lt: staleBefore } }] } })) > 0;
}

/**
 * Starts a worker run in a fresh function call (with its own time limit). The worker answers at once
 * and works afterwards, so this only waits for that answer.
 */
export async function kickWorker() {
  const secret = process.env.CRON_SECRET;
  if (!secret) return;
  try {
    await fetch(`${await getAppUrl()}/api/jobs/run`, { method: "POST", headers: { authorization: `Bearer ${secret}` }, cache: "no-store", signal: AbortSignal.timeout(15_000) });
  } catch {
    // The backstop crons pick the work up if this call does not get through.
  }
}

/** Nightly: one job per active customer with Copernica, unless it already has one today. */
export async function enqueueNightlyJobs(now = new Date()) {
  const prisma = getPrismaClient();
  const today = new Date(now);
  today.setUTCHours(0, 0, 0, 0);
  const tenants = await prisma.tenant.findMany({ where: { status: "active", copernica: { isNot: null } }, select: { id: true, jobs: { where: { trigger: "nightly", createdAt: { gte: today } }, select: { id: true }, take: 1 } } });
  let created = 0;
  for (const tenant of tenants) {
    if (tenant.jobs.length) continue;
    const result = await enqueueJob(tenant.id, ["sync", "ingest", "rfm", "rfm-write", "predictions", "forecast-write"], { trigger: "nightly" });
    if (result.created) created++;
  }
  return created;
}

/** Old jobs are kept 30 days, for the status panel and to see what went wrong. */
export async function pruneJobs(now = new Date()) {
  await getPrismaClient().job.deleteMany({ where: { status: { in: ["done", "failed"] }, createdAt: { lt: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) } } });
}

/**
 * The latest job in the shape the status panel needs (dates as text, step labels filled in). A job that
 * finished well over half a day ago is old news and not shown; a failed one stays until the next job.
 */
export async function jobStatusFor(tenantId: string, now = new Date()) {
  const job = await latestJob(tenantId);
  if (!job || (job.status === "done" && job.finishedAt && now.getTime() - job.finishedAt.getTime() > 12 * 60 * 60 * 1000)) return null;
  return {
    id: job.id,
    trigger: job.trigger,
    steps: job.steps.map((step) => ({ key: step, label: stepLabel[step] ?? step })),
    stepIndex: job.stepIndex,
    status: job.status,
    progress: job.progress,
    error: job.error,
    createdAt: job.createdAt.toISOString(),
    finishedAt: job.finishedAt?.toISOString() ?? null,
  };
}
