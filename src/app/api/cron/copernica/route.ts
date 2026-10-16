import { NextResponse, type NextRequest } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { removeUnfinishedCaches } from "@/lib/data-cache/cleanup";
import { enqueueNightlyJobs, kickWorker, pruneJobs } from "@/lib/jobs/queue";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Parallel worker chains at night: enough to finish in time, few enough to spare Copernica and the database. */
const CHAINS = 2;

/**
 * Nightly (several cron jobs, as the Hobby plan allows one run per job per day): give every customer one
 * job (sync, cached data, RFM, predictions, write-back) and start the workers. Each customer runs on its
 * own, so a large customer can no longer push out or take down the others.
 */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!process.env.DATABASE_URL) return NextResponse.json({ error: "Database is not configured" }, { status: 503 });

  // Tidy up first: once every customer has tonight's job, nothing counts as idle.
  await removeUnfinishedCaches();
  await pruneJobs();
  const created = await enqueueNightlyJobs();
  await Promise.all(Array.from({ length: CHAINS }, () => kickWorker()));
  return NextResponse.json({ created });
}
