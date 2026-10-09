import { createHash, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

/** Whether the request carries the Vercel cron secret (Authorization: Bearer <CRON_SECRET>). */
export function isAuthorizedCron(request: NextRequest) {
  const expectedSecret = process.env.CRON_SECRET;
  const providedSecret = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  return Boolean(expectedSecret && providedSecret && constantTimeEquals(providedSecret, expectedSecret));
}

function constantTimeEquals(left: string, right: string) {
  const leftHash = createHash("sha256").update(left).digest();
  const rightHash = createHash("sha256").update(right).digest();
  return timingSafeEqual(leftHash, rightHash);
}
