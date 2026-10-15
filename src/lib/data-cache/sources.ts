import { createHash } from "node:crypto";
import { getPrismaClient } from "../prisma";

/**
 * Which Copernica collections a customer's models read, with the fields that matter. The hash of this
 * mapping is stored with the cache: when an admin changes a field, the cache is rebuilt.
 */
export type CacheKind = "orders" | "lines" | "events";

export type OrderSource = { kind: "orders"; collectionId: string; dateField: string; amountField: string; statusField: string | null; keyField: string | null };
export type LineSource = { kind: "lines"; collectionId: string; orderField: string; productField: string; nameField: string | null; categoryField: string | null };
export type EventSource = { kind: "events"; collectionId: string; dateField: string; productField: string | null; categoryField: string | null; eventField: string | null };
export type CacheSource = OrderSource | LineSource | EventSource;

export function mappingHash(source: CacheSource) {
  return createHash("sha256").update(JSON.stringify(source)).digest("hex").slice(0, 32);
}

/** The collections this customer needs cached, in the order they are filled. */
export async function cacheSources(tenantId: string): Promise<CacheSource[]> {
  const prisma = getPrismaClient();
  const [rfm, predict] = await Promise.all([
    prisma.rfmConfig.findUnique({ where: { tenantId }, select: { enabled: true, collectionId: true, dateField: true, amountField: true, statusField: true } }),
    prisma.predictionConfig.findUnique({ where: { tenantId }, select: { enabled: true, orderKeyField: true, lineCollectionId: true, lineOrderField: true, lineProductField: true, lineNameField: true, lineCategoryField: true, webCollectionId: true, webDateField: true, webProductField: true, webCategoryField: true, webEventField: true } }),
  ]);
  const sources: CacheSource[] = [];
  if (!rfm?.enabled) return sources;
  sources.push({ kind: "orders", collectionId: rfm.collectionId, dateField: rfm.dateField, amountField: rfm.amountField, statusField: rfm.statusField ?? null, keyField: predict?.enabled ? predict.orderKeyField || null : null });
  if (predict?.enabled && predict.lineCollectionId) {
    sources.push({ kind: "lines", collectionId: predict.lineCollectionId, orderField: predict.lineOrderField, productField: predict.lineProductField, nameField: predict.lineNameField ?? null, categoryField: predict.lineCategoryField ?? null });
    if (predict.webCollectionId && predict.webDateField) sources.push({ kind: "events", collectionId: predict.webCollectionId, dateField: predict.webDateField, productField: predict.webProductField ?? null, categoryField: predict.webCategoryField ?? null, eventField: predict.webEventField ?? null });
  }
  return sources;
}
