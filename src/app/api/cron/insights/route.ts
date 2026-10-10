import { NextResponse, type NextRequest } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { clearLegacyRfmProfileFields, writeInsightsToCopernica } from "@/lib/insights/writer";
import { getPrismaClient } from "@/lib/prisma";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Nightly, after RFM (05:00) and the predictions (05:30): bring the Copernica collection Klantinzichten
 * in line, and empty the old RFM_ profile fields for customers whose transition period has ended.
 */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!process.env.DATABASE_URL) return NextResponse.json({ error: "Database is not configured" }, { status: 503 });

  const prisma = getPrismaClient();
  const deadline = Date.now() + 270_000;
  const configs = await prisma.rfmConfig.findMany({
    select: { tenantId: true, writeBackEnabled: true, profileFieldsEnabled: true, tenant: { select: { predictionConfig: { select: { writeBackEnabled: true } }, _count: { select: { insightWrites: true, rfmWrites: true } } } } },
    orderBy: { insightsWriteAt: { sort: "asc", nulls: "first" } },
  });
  const results: { tenantId: string; written?: number; remaining?: number; legacyCleared?: number; error?: string }[] = [];

  for (const config of configs) {
    if (Date.now() > deadline - 30_000) break;
    const writes = config.writeBackEnabled || config.tenant.predictionConfig?.writeBackEnabled || config.tenant._count.insightWrites > 0;
    const clearLegacy = !config.profileFieldsEnabled && config.tenant._count.rfmWrites > 0;
    if (!writes && !clearLegacy) continue;
    const result: (typeof results)[number] = { tenantId: config.tenantId };
    try {
      if (writes) {
        const summary = await writeInsightsToCopernica(config.tenantId, deadline);
        result.written = summary.created + summary.updated + summary.deleted;
        result.remaining = summary.remaining;
      }
      if (clearLegacy) result.legacyCleared = (await clearLegacyRfmProfileFields(config.tenantId, deadline)).cleared;
    } catch (error) {
      // Usually the collection was not created yet for this customer; the admin page says so.
      result.error = error instanceof Error ? error.message.slice(0, 200) : "Onbekende fout";
    }
    results.push(result);
  }

  return NextResponse.json({ processed: results.length, results });
}
