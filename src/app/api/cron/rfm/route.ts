import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getPrismaClient } from "@/lib/prisma";
import { runRfm } from "@/lib/rfm/run";
import { writeRfmToCopernica } from "@/lib/rfm/writeback";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Nightly: recalculate every enabled RFM model and write changes back to Copernica where that is switched on. */
export async function GET(request: NextRequest) {
  const expectedSecret = process.env.CRON_SECRET;
  const providedSecret = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!expectedSecret || !providedSecret || !constantTimeEquals(providedSecret, expectedSecret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!process.env.DATABASE_URL) return NextResponse.json({ error: "Database is not configured" }, { status: 503 });

  const deadline = Date.now() + 270_000;
  const configs = await getPrismaClient().rfmConfig.findMany({ where: { enabled: true }, select: { tenantId: true, writeBackEnabled: true }, orderBy: { lastRunAt: "asc" } });
  const results: { tenantId: string; calculated: boolean; written?: number; remaining?: number }[] = [];

  for (const config of configs) {
    // Oldest run first, so a tenant skipped for lack of time goes first tomorrow.
    if (Date.now() > deadline - 60_000) break;
    const result: (typeof results)[number] = { tenantId: config.tenantId, calculated: false };
    try {
      await runRfm(config.tenantId);
      result.calculated = true;
      if (config.writeBackEnabled) {
        const summary = await writeRfmToCopernica(config.tenantId, deadline);
        result.written = summary.updated + summary.cleared;
        result.remaining = summary.remaining;
      }
    } catch {
      // The error is stored on the config by runRfm; continue with the next tenant.
    }
    results.push(result);
  }

  return NextResponse.json({ processed: results.length, total: configs.length, results });
}

function constantTimeEquals(left: string, right: string) {
  const leftHash = createHash("sha256").update(left).digest();
  const rightHash = createHash("sha256").update(right).digest();
  return timingSafeEqual(leftHash, rightHash);
}
