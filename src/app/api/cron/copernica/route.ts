import { NextResponse, type NextRequest } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { getPrismaClient } from "@/lib/prisma";
import { syncTenantCopernicaData } from "@/lib/copernica";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Nightly, in three runs (separate daily cron jobs, as the Hobby plan allows one run per job per day): sync the
 * customers whose data is oldest first and stop before the time limit, so a customer that did not fit goes first
 * in the next run instead of being skipped every night.
 */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "Database is not configured" }, { status: 503 });
  }

  const deadline = Date.now() + 240_000;
  // Counts are stored per day: a customer synced since midnight (UTC) has today's measurement already.
  const freshSince = new Date();
  freshSince.setUTCHours(0, 0, 0, 0);
  const connections = await getPrismaClient().copernicaConnection.findMany({
    where: { OR: [{ lastSyncedAt: null }, { lastSyncedAt: { lt: freshSince } }] },
    select: { tenantId: true },
    orderBy: { lastSyncedAt: { sort: "asc", nulls: "first" } },
  });
  const results: Array<{ tenantId: string; ok: boolean; seconds: number }> = [];

  for (const { tenantId } of connections) {
    // Leave room for one more customer; the rest follow in the next run.
    if (Date.now() > deadline - 60_000) break;
    const started = Date.now();
    try {
      await syncTenantCopernicaData(tenantId);
      results.push({ tenantId, ok: true, seconds: Math.round((Date.now() - started) / 1000) });
    } catch {
      results.push({ tenantId, ok: false, seconds: Math.round((Date.now() - started) / 1000) });
    }
  }

  return NextResponse.json({ synced: results.filter((result) => result.ok).length, failed: results.filter((result) => !result.ok).length, remaining: connections.length - results.length, results });
}
