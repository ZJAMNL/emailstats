import { NextResponse, type NextRequest } from "next/server";
import { runAlertsForTenant, type AlertRunResult } from "@/lib/alerts/run";
import { getAppUrl } from "@/lib/app-url";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { getPrismaClient } from "@/lib/prisma";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Daily, after the Copernica sync and the RFM run: check every customer with alerts switched on and mail a digest. */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!process.env.DATABASE_URL) return NextResponse.json({ error: "Database is not configured" }, { status: 503 });

  const now = new Date();
  const appUrl = await getAppUrl();
  const tenants = await getPrismaClient().alertSettings.findMany({ where: { enabled: true }, select: { tenantId: true } });
  const results: AlertRunResult[] = [];
  for (const { tenantId } of tenants) {
    try {
      results.push(await runAlertsForTenant(tenantId, now, appUrl));
    } catch (error) {
      results.push({ tenantId, status: "failed", alerts: 0, error: error instanceof Error ? error.message.slice(0, 200) : "Onbekende fout" });
    }
  }

  return NextResponse.json({ checked: results.length, sent: results.filter((result) => result.status === "sent").length, results });
}
