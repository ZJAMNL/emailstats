import { after, NextResponse, type NextRequest } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { removeUnfinishedCaches } from "@/lib/data-cache/cleanup";
import { hasWaitingJobs, kickWorker, runNextSlice } from "@/lib/jobs/queue";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * The worker: answers at once and then runs one slice of the next job. When there is more work it starts
 * a new call of itself, so every slice gets its own time limit. Called by itself, by the nightly crons
 * and backstops, and right after an admin starts a job.
 */
async function work({ housekeeping }: { housekeeping: boolean }) {
  after(async () => {
    if (housekeeping) await removeUnfinishedCaches().catch(() => 0);
    // Only a worker that did work starts the next one. When all job places are taken a new worker finds
    // nothing to do; starting yet another one then made a rapid chain of empty calls until it broke off.
    // The running workers pick up waiting jobs when their slice ends.
    const ran = await runNextSlice();
    if (ran && (await hasWaitingJobs())) await kickWorker();
  });
  return NextResponse.json({ accepted: true }, { status: 202 });
}

export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!process.env.DATABASE_URL) return NextResponse.json({ error: "Database is not configured" }, { status: 503 });
  // GET is the backstop cron: also tidy up; POST is a worker starting the next one.
  return work({ housekeeping: request.method === "GET" });
}

export async function POST(request: NextRequest) {
  return GET(request);
}
