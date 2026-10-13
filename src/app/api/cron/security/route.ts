import { NextResponse, type NextRequest } from "next/server";
import { getAppUrl } from "@/lib/app-url";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { runSecurityScan } from "@/lib/security/scan";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Weekly on Monday morning: test the platform's security and mail the result to the superbeheerders. */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!process.env.DATABASE_URL) return NextResponse.json({ error: "Database is not configured" }, { status: 503 });

  const result = await runSecurityScan({ baseUrl: await getAppUrl(), trigger: "cron", sendMail: true });
  return NextResponse.json({ status: result.status, findings: result.findings.length, emailedTo: result.emailedTo.length });
}
