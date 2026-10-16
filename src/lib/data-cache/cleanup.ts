import { getPrismaClient } from "../prisma";
import { dropCache } from "./ingest";

/**
 * Removes caches that never finished a full refresh (an interrupted run, or a limit hit halfway) for
 * customers without a job in progress: they cannot be used and only take space in the database.
 */
export async function removeUnfinishedCaches() {
  const prisma = getPrismaClient();
  const [orders, lines, events, finished, busy] = await Promise.all([
    prisma.cachedOrder.groupBy({ by: ["tenantId"] }),
    prisma.cachedLine.groupBy({ by: ["tenantId"] }),
    prisma.cachedEvent.groupBy({ by: ["tenantId"] }),
    prisma.dataCache.findMany({ where: { fullRefreshAt: { not: null } }, select: { tenantId: true, kind: true } }),
    prisma.job.findMany({ where: { status: { in: ["queued", "running"] } }, select: { tenantId: true } }),
  ]);
  const done = new Set(finished.map((state) => `${state.tenantId}:${state.kind}`));
  const active = new Set(busy.map((job) => job.tenantId));
  let removed = 0;
  for (const [kind, rows] of [["orders", orders], ["lines", lines], ["events", events]] as const) {
    for (const { tenantId } of rows) {
      if (active.has(tenantId) || done.has(`${tenantId}:${kind}`)) continue;
      await dropCache(tenantId, kind);
      removed++;
    }
  }
  return removed;
}
