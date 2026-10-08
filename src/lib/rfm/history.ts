import { getPrismaClient } from "../prisma";
import type { RfmTrend } from "@/components/rfm-overview";
import type { RfmRunSummary } from "./run";
import { rfmSegments, type RfmSegmentKey } from "./segments";

const dayMs = 24 * 60 * 60 * 1000;

type Snapshot = { measuredAt: Date; segment: string; customers: number };

/** The stored result of the last run, or null when the model is off or has not run yet. */
export async function loadRfmResult(tenantId: string) {
  const config = await getPrismaClient().rfmConfig.findUnique({ where: { tenantId } });
  const summary = config?.enabled && config.lastRunSummary ? config.lastRunSummary as unknown as RfmRunSummary : null;
  return { config, summary };
}

export async function isRfmVisibleToCustomer(tenantId: string) {
  const config = await getPrismaClient().rfmConfig.findUnique({ where: { tenantId }, select: { enabled: true, customerVisible: true, lastRunSummary: true } });
  return Boolean(config?.enabled && config.customerVisible && config.lastRunSummary);
}

export function loadRfmSnapshots(tenantId: string) {
  const since = new Date(Date.now() - 400 * dayMs);
  return getPrismaClient().rfmSegmentSnapshot.findMany({ where: { tenantId, measuredAt: { gte: since } }, orderBy: { measuredAt: "asc" } });
}

export function buildRfmTrend(snapshots: Snapshot[]) {
  const points = new Map<string, { date: string; [segment: string]: number | string }>();
  for (const snapshot of snapshots) {
    const date = snapshot.measuredAt.toISOString().slice(0, 10);
    const point = points.get(date) ?? { date };
    point[snapshot.segment] = snapshot.customers;
    points.set(date, point);
  }
  return [...points.values()];
}

/** Customers per segment now versus the snapshot closest to 30 days earlier. */
export function buildRfmMonthlyChange(snapshots: Snapshot[]): RfmTrend[] {
  if (!snapshots.length) return [];
  const latest = snapshots[snapshots.length - 1].measuredAt.getTime();
  const previousDate = [...new Set(snapshots.map((snapshot) => snapshot.measuredAt.getTime()))].filter((time) => time <= latest - 30 * dayMs).pop();
  return rfmSegments.map((segment) => ({
    key: segment.key as RfmSegmentKey,
    current: snapshots.find((snapshot) => snapshot.measuredAt.getTime() === latest && snapshot.segment === segment.key)?.customers ?? 0,
    previous: previousDate === undefined ? null : snapshots.find((snapshot) => snapshot.measuredAt.getTime() === previousDate && snapshot.segment === segment.key)?.customers ?? null,
  }));
}
