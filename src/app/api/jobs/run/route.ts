import { after, NextResponse, type NextRequest } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { hasWaitingJobs, kickWorker, runNextSlice } from "@/lib/jobs/queue";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * The worker: answers at once and then runs one slice of the next job. When there is more work it starts
 * a new call of itself, so every slice gets its own time limit. Called by itself, by the nightly crons
 * and backstops, and right after an admin starts a job.
 */
async function work() {
  after(async () => {
    await runNextSlice();
    if (await hasWaitingJobs()) await kickWorker();
  });
  return NextResponse.json({ accepted: true }, { status: 202 });
}

export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!process.env.DATABASE_URL) return NextResponse.json({ error: "Database is not configured" }, { status: 503 });
  return work();
}

export async function POST(request: NextRequest) {
  return GET(request);
}
