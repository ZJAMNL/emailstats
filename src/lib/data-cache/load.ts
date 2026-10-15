import { getPrismaClient } from "../prisma";
import type { SubprofileRow } from "../rfm/copernica-orders";
import type { RfmOrder } from "../rfm/score";
import { mappingHash, type CacheSource, type EventSource, type LineSource } from "./sources";

/** Whether the cache holds a complete copy for exactly this mapping (a full refresh finished). */
export async function cacheReady(tenantId: string, source: CacheSource) {
  const state = await getPrismaClient().dataCache.findUnique({ where: { tenantId_kind: { tenantId, kind: source.kind } }, select: { mappingHash: true, collectionId: true, fullRefreshAt: true } });
  return Boolean(state?.fullRefreshAt && state.mappingHash === mappingHash(source) && state.collectionId === source.collectionId);
}

/** Orders in the same shape as fetched from Copernica. */
export async function loadCachedOrders(tenantId: string): Promise<RfmOrder[]> {
  const rows = await getPrismaClient().cachedOrder.findMany({ where: { tenantId }, select: { subprofileId: true, profileId: true, orderKey: true, date: true, amount: true, status: true } });
  return rows.map((row) => ({ key: row.orderKey ?? row.subprofileId, profileId: row.profileId, date: row.date, amount: row.amount, status: row.status }));
}

/** Order lines as Copernica rows with the mapped fields, so the model input is built exactly as before. */
export async function loadCachedLineRows(tenantId: string, source: LineSource): Promise<SubprofileRow[]> {
  const rows = await getPrismaClient().cachedLine.findMany({ where: { tenantId }, select: { subprofileId: true, profileId: true, orderKey: true, productId: true, productName: true, category: true } });
  return rows.map((row) => ({
    id: row.subprofileId,
    profile: row.profileId,
    fields: {
      [source.orderField]: row.orderKey,
      [source.productField]: row.productId,
      ...(source.nameField ? { [source.nameField]: row.productName ?? "" } : {}),
      ...(source.categoryField ? { [source.categoryField]: row.category ?? "" } : {}),
    },
  }));
}

export async function loadCachedEventRows(tenantId: string, source: EventSource, since: Date): Promise<SubprofileRow[]> {
  const rows = await getPrismaClient().cachedEvent.findMany({ where: { tenantId, date: { gte: since } }, select: { subprofileId: true, profileId: true, date: true, productId: true, category: true, eventType: true } });
  return rows.map((row) => ({
    id: row.subprofileId,
    profile: row.profileId,
    fields: {
      // ISO text, as parseCopernicaDate reads it.
      [source.dateField]: row.date.toISOString().slice(0, 19).replace("T", " "),
      ...(source.productField ? { [source.productField]: row.productId ?? "" } : {}),
      ...(source.categoryField ? { [source.categoryField]: row.category ?? "" } : {}),
      ...(source.eventField ? { [source.eventField]: row.eventType ?? "" } : {}),
    },
  }));
}
