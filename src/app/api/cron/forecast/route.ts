import { NextResponse, type NextRequest } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { writeForecastOrders } from "@/lib/predict/orders-writer";
import { getPrismaClient } from "@/lib/prisma";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Nightly, after the predictions (05:30): write the expected orders to each customer's chosen
 * Copernica collection. Also runs right after write-back is switched off, to remove the records.
 */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!process.env.DATABASE_URL) return NextResponse.json({ error: "Database is not configured" }, { status: 503 });

  const deadline = Date.now() + 270_000;
  const configs = await getPrismaClient().predictionConfig.findMany({
    where: { forecastCollectionId: { not: null }, OR: [{ writeBackEnabled: true }, { tenant: { insightWrites: { some: {} } } }] },
    select: { tenantId: true },
    orderBy: { forecastWriteAt: { sort: "asc", nulls: "first" } },
  });
  const results: { tenantId: string; written?: number; remaining?: number; error?: string }[] = [];
  for (const { tenantId } of configs) {
    if (Date.now() > deadline - 30_000) break;
    try {
      const summary = await writeForecastOrders(tenantId, deadline);
      results.push({ tenantId, written: summary.created + summary.updated + summary.deleted, remaining: summary.remaining });
    } catch (error) {
      results.push({ tenantId, error: error instanceof Error ? error.message.slice(0, 200) : "Onbekende fout" });
    }
  }
  return NextResponse.json({ processed: results.length, results });
}
