import { NextResponse, type NextRequest } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { getPrismaClient } from "@/lib/prisma";
import { syncTenantCopernicaData } from "@/lib/copernica";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "Database is not configured" }, { status: 503 });
  }

  const tenants = await getPrismaClient().copernicaConnection.findMany({ select: { tenantId: true } });
  const results: Array<{ tenantId: string; ok: boolean }> = [];

  for (const { tenantId } of tenants) {
    try {
      await syncTenantCopernicaData(tenantId);
      results.push({ tenantId, ok: true });
    } catch {
      results.push({ tenantId, ok: false });
    }
  }

  return NextResponse.json({ synced: results.filter((result) => result.ok).length, failed: results.length - results.filter((result) => result.ok).length });
}
