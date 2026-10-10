import { NextResponse, type NextRequest } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { getPrismaClient } from "@/lib/prisma";
import { isWriteBackAllowed } from "@/lib/predict/model";
import { runPredictions } from "@/lib/predict/run";
import { writePredictionsToCopernica } from "@/lib/predict/writeback";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Nightly, after RFM: recalculate the predictive models and write changes back where that is switched on. */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!process.env.DATABASE_URL) return NextResponse.json({ error: "Database is not configured" }, { status: 503 });

  const deadline = Date.now() + 270_000;
  const configs = await getPrismaClient().predictionConfig.findMany({ where: { enabled: true }, select: { tenantId: true, writeBackEnabled: true }, orderBy: { lastRunAt: "asc" } });
  const results: { tenantId: string; calculated: boolean; written?: number; remaining?: number; skippedWrite?: string }[] = [];

  for (const config of configs) {
    // Oldest run first, so a customer skipped for lack of time goes first tomorrow.
    if (Date.now() > deadline - 90_000) break;
    const result: (typeof results)[number] = { tenantId: config.tenantId, calculated: false };
    try {
      const summary = await runPredictions(config.tenantId);
      result.calculated = true;
      if (config.writeBackEnabled) {
        if (isWriteBackAllowed(summary)) {
          const written = await writePredictionsToCopernica(config.tenantId, deadline);
          result.written = written.updated + written.cleared;
          result.remaining = written.remaining;
        } else {
          result.skippedWrite = "Geen model haalde de backtest.";
        }
      }
    } catch {
      // The error is stored on the config by runPredictions; continue with the next customer.
    }
    results.push(result);
  }

  return NextResponse.json({ processed: results.length, total: configs.length, results });
}
