import { NextResponse, type NextRequest } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { getPrismaClient } from "@/lib/prisma";
import { runPredictions } from "@/lib/predict/run";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Nightly, after RFM: recalculate the predictive models. Writing to Copernica happens in /api/cron/insights. */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!process.env.DATABASE_URL) return NextResponse.json({ error: "Database is not configured" }, { status: 503 });

  const deadline = Date.now() + 270_000;
  const configs = await getPrismaClient().predictionConfig.findMany({ where: { enabled: true }, select: { tenantId: true }, orderBy: { lastRunAt: "asc" } });
  const results: { tenantId: string; calculated: boolean }[] = [];

  for (const { tenantId } of configs) {
    // Oldest run first, so a customer skipped for lack of time goes first tomorrow.
    if (Date.now() > deadline - 90_000) break;
    try {
      await runPredictions(tenantId);
      results.push({ tenantId, calculated: true });
    } catch {
      // The error is stored on the config by runPredictions; continue with the next customer.
      results.push({ tenantId, calculated: false });
    }
  }

  return NextResponse.json({ processed: results.length, total: configs.length, results });
}
