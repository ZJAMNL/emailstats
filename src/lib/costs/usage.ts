import { getPrismaClient } from "../prisma";

export type JobName = "copernica-sync" | "ingest" | "rfm" | "rfm-write" | "predictions" | "forecast-write" | "alerts";

/** Runs a job for a customer and records how long it took (also when it fails), for the cost dashboard. */
export async function measureJob<T>(tenantId: string | null, job: JobName, task: () => Promise<T>): Promise<T> {
  const started = Date.now();
  let ok = false;
  try {
    const result = await task();
    ok = true;
    return result;
  } finally {
    // Measuring must never break the job itself.
    await getPrismaClient().jobRun.create({ data: { tenantId, job, startedAt: new Date(started), durationMs: Date.now() - started, ok } }).catch(() => undefined);
  }
}
