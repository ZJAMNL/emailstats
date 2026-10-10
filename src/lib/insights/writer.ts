import { CopernicaError, copernicaSend, createdId, getTenantCopernica, mapInBatches } from "../copernica";
import { getPrismaClient } from "../prisma";
import { isWriteBackAllowed } from "../predict/model";
import type { PredictionRunSummary } from "../predict/run";
import { listCollectionFields, listCollections } from "../rfm/copernica-orders";
import { desiredInsightRecords, emptyLegacyRfmProfileFields, INSIGHTS_COLLECTION, INSIGHTS_DESCRIPTION, insightFields, obsoleteInsightFields, planInsightWrites, recordKey } from "./fields";

export type InsightWriteSummary = { at: string; created: number; updated: number; deleted: number; failed: number; remaining: number; error?: string };
export type InsightsStatus = { collectionId: string | null; missingFields: string[]; obsoleteFields: string[] };

const BATCH = 200;
const CONCURRENCY = 8;

async function findCollection(jwt: string, databaseId: string) {
  return (await listCollections(jwt, databaseId)).find((collection) => collection.name.toLowerCase() === INSIGHTS_COLLECTION.toLowerCase()) ?? null;
}

/** Whether the collection and all its fields exist; null when Copernica cannot be reached. */
export async function insightsStatus(tenantId: string): Promise<InsightsStatus | null> {
  const connected = await getTenantCopernica(tenantId);
  if (!connected) return null;
  const collection = await findCollection(connected.jwt, connected.connection.databaseId);
  if (!collection) return { collectionId: null, missingFields: insightFields.map((field) => field.name), obsoleteFields: [] };
  const existing = new Set((await listCollectionFields(connected.jwt, collection.id)).map((field) => field.name.toLowerCase()));
  return {
    collectionId: collection.id,
    missingFields: insightFields.map((field) => field.name).filter((name) => !existing.has(name.toLowerCase())),
    obsoleteFields: obsoleteInsightFields.filter((name) => existing.has(name.toLowerCase())),
  };
}

/**
 * Creates the collection (when missing) and every missing field, and removes the fields of the first
 * version (one wide row per profile). Other fields are never touched.
 */
export async function ensureInsightsCollection(tenantId: string) {
  const connected = await getTenantCopernica(tenantId);
  if (!connected) throw new Error("Deze klant heeft nog geen Copernica-koppeling.");
  const { jwt, connection } = connected;
  let collection = await findCollection(jwt, connection.databaseId);
  let createdCollection = false;
  if (!collection) {
    const id = createdId(await copernicaSend(jwt, "POST", `database/${encodeURIComponent(connection.databaseId)}/collections`, { name: INSIGHTS_COLLECTION, description: INSIGHTS_DESCRIPTION }));
    collection = id ? { id, name: INSIGHTS_COLLECTION } : await findCollection(jwt, connection.databaseId);
    if (!collection) throw new Error("De collectie is aangemaakt maar niet teruggevonden.");
    createdCollection = true;
  }
  const current = await listCollectionFields(jwt, collection.id);
  const existing = new Set(current.map((field) => field.name.toLowerCase()));
  const removedFields: string[] = [];
  for (const field of current) {
    if (!obsoleteInsightFields.some((name) => name.toLowerCase() === field.name.toLowerCase())) continue;
    await copernicaSend(jwt, "DELETE", `collection/${encodeURIComponent(collection.id)}/field/${encodeURIComponent(field.id)}`, {});
    removedFields.push(field.name);
  }
  const createdFields: string[] = [];
  for (const field of insightFields) {
    if (existing.has(field.name.toLowerCase())) continue;
    await copernicaSend(jwt, "POST", `collection/${encodeURIComponent(collection.id)}/fields`, {
      name: field.name,
      type: field.type,
      description: field.description,
      ...(field.length ? { length: field.length } : {}),
      index: field.index,
      displayed: field.name === "Type" || field.name === "Waarde",
    });
    createdFields.push(field.name);
  }
  return { createdCollection, createdFields, removedFields };
}

/**
 * Brings Klantinzichten in line with what is switched on: RFM records when RFM write-back is on,
 * prediction records when prediction write-back is on and a model passed its backtest. Records that
 * no longer apply are deleted. Stops at the deadline; the next run continues.
 */
export async function writeInsightsToCopernica(tenantId: string, deadline: number): Promise<InsightWriteSummary> {
  const prisma = getPrismaClient();
  const connected = await getTenantCopernica(tenantId);
  if (!connected) throw new Error("Deze klant heeft nog geen Copernica-koppeling.");
  const collection = await findCollection(connected.jwt, connected.connection.databaseId);
  if (!collection) throw new Error(`De collectie ${INSIGHTS_COLLECTION} bestaat nog niet in Copernica.`);

  const [rfmConfig, predictionConfig] = await Promise.all([
    prisma.rfmConfig.findUnique({ where: { tenantId }, select: { enabled: true, writeBackEnabled: true } }),
    prisma.predictionConfig.findUnique({ where: { tenantId }, select: { enabled: true, writeBackEnabled: true, lastRunSummary: true } }),
  ]);
  const includeRfm = Boolean(rfmConfig?.enabled && rfmConfig.writeBackEnabled);
  const includeAi = Boolean(predictionConfig?.enabled && predictionConfig.writeBackEnabled && predictionConfig.lastRunSummary && isWriteBackAllowed(predictionConfig.lastRunSummary as unknown as PredictionRunSummary));

  const [rfmRows, aiRows, writtenRows] = await Promise.all([
    includeRfm ? prisma.rfmProfileScore.findMany({ where: { tenantId }, select: { copernicaProfileId: true, segment: true, previousSegment: true, r: true, f: true, m: true, predictedClv: true, probabilityAlive: true } }) : Promise.resolve([]),
    includeAi ? prisma.profilePrediction.findMany({ where: { tenantId }, select: { copernicaProfileId: true, isBuyer: true, purchaseProbability: true, intentBand: true, favoriteCategory: true, nextCategory: true, recommendations: true, recommendationNames: true, recommendationCategories: true, lastVisitAt: true } }) : Promise.resolve([]),
    prisma.insightWriteBack.findMany({ where: { tenantId }, select: { copernicaProfileId: true, insightKey: true, subprofileId: true, hash: true } }),
  ]);

  const today = new Date().toISOString().slice(0, 10);
  const rfmById = new Map(rfmRows.map((row) => [row.copernicaProfileId, row]));
  // Only profiles with an actual prediction: a prospect whose model failed its backtest gets no records.
  const aiById = new Map(aiRows.filter((row) => row.purchaseProbability !== null || row.recommendations.length > 0 || row.favoriteCategory).map((row) => [row.copernicaProfileId, row]));
  const desired = new Map<string, { fields: Record<string, string | number>; hash: string }>();
  for (const profileId of new Set([...rfmById.keys(), ...aiById.keys()])) {
    for (const record of desiredInsightRecords(rfmById.get(profileId) ?? null, aiById.get(profileId) ?? null, today)) desired.set(recordKey(profileId, record.key), record);
  }
  const written = new Map(writtenRows.map((row) => [recordKey(row.copernicaProfileId, row.insightKey), row]));
  const tasks = planInsightWrites(new Map([...desired].map(([key, value]) => [key, value.hash])), new Map([...written].map(([key, row]) => [key, row.hash])));

  const { jwt } = connected;
  const summary: InsightWriteSummary = { at: new Date().toISOString(), created: 0, updated: 0, deleted: 0, failed: 0, remaining: tasks.length };

  for (let index = 0; index < tasks.length && Date.now() < deadline; index += BATCH) {
    const batch = tasks.slice(index, index + BATCH);
    const saved: { profileId: string; insightKey: string; subprofileId: string; hash: string }[] = [];
    const removed: { profileId: string; insightKey: string }[] = [];
    let forbidden = false;
    await mapInBatches(batch, CONCURRENCY, async ({ profileId, insightKey, action }) => {
      if (forbidden) return;
      const key = recordKey(profileId, insightKey);
      try {
        if (action === "delete") {
          try {
            await copernicaSend(jwt, "DELETE", `subprofile/${encodeURIComponent(written.get(key)!.subprofileId)}`, {});
          } catch (error) {
            // Already gone in Copernica: that is what we wanted.
            if (!(error instanceof CopernicaError && error.status === 404)) throw error;
          }
          removed.push({ profileId, insightKey });
          summary.deleted++;
          return;
        }
        const record = desired.get(key)!;
        let subprofileId = action === "update" ? written.get(key)!.subprofileId : null;
        if (subprofileId) {
          try {
            await copernicaSend(jwt, "PUT", `subprofile/${encodeURIComponent(subprofileId)}/fields`, record.fields);
          } catch (error) {
            // Someone removed the record in Copernica; put it back.
            if (!(error instanceof CopernicaError && error.status === 404)) throw error;
            subprofileId = null;
          }
        }
        if (!subprofileId) {
          subprofileId = createdId(await copernicaSend(jwt, "POST", `profile/${encodeURIComponent(profileId)}/subprofiles/${encodeURIComponent(collection.id)}`, record.fields));
          if (!subprofileId) throw new Error("Copernica gaf geen id terug.");
          summary.created++;
        } else {
          summary.updated++;
        }
        saved.push({ profileId, insightKey, subprofileId, hash: record.hash });
      } catch (error) {
        if (error instanceof CopernicaError && (error.status === 401 || error.status === 403)) forbidden = true;
        summary.failed++;
      }
    });
    const writtenAt = new Date();
    await prisma.$transaction([
      ...saved.map((item) => prisma.insightWriteBack.upsert({
        where: { tenantId_copernicaProfileId_insightKey: { tenantId, copernicaProfileId: item.profileId, insightKey: item.insightKey } },
        create: { tenantId, copernicaProfileId: item.profileId, insightKey: item.insightKey, subprofileId: item.subprofileId, hash: item.hash, writtenAt },
        update: { subprofileId: item.subprofileId, hash: item.hash, writtenAt },
      })),
      ...removed.map((item) => prisma.insightWriteBack.deleteMany({ where: { tenantId, copernicaProfileId: item.profileId, insightKey: item.insightKey } })),
    ]);
    if (forbidden) {
      summary.error = "Copernica weigert het schrijven: het API-token heeft geen schrijfrechten.";
      break;
    }
  }
  summary.remaining = Math.max(0, tasks.length - summary.created - summary.updated - summary.deleted);
  await prisma.rfmConfig.update({ where: { tenantId }, data: { insightsWriteAt: new Date(), insightsWriteSummary: summary } });
  return summary;
}

/** Ends the transition: empties the old RFM_ profile fields of every profile we wrote them to. */
export async function clearLegacyRfmProfileFields(tenantId: string, deadline: number) {
  const prisma = getPrismaClient();
  const connected = await getTenantCopernica(tenantId);
  if (!connected) throw new Error("Deze klant heeft nog geen Copernica-koppeling.");
  const rows = await prisma.rfmWriteBack.findMany({ where: { tenantId }, select: { copernicaProfileId: true } });
  let cleared = 0;
  let failed = 0;
  for (let index = 0; index < rows.length && Date.now() < deadline; index += BATCH) {
    const done: string[] = [];
    let forbidden = false;
    await mapInBatches(rows.slice(index, index + BATCH), CONCURRENCY, async ({ copernicaProfileId }) => {
      if (forbidden) return;
      try {
        await copernicaSend(connected.jwt, "PUT", `profile/${encodeURIComponent(copernicaProfileId)}/fields`, emptyLegacyRfmProfileFields);
        done.push(copernicaProfileId);
      } catch (error) {
        // A profile that no longer exists has nothing left to clear.
        if (error instanceof CopernicaError && error.status === 404) { done.push(copernicaProfileId); return; }
        if (error instanceof CopernicaError && (error.status === 401 || error.status === 403)) forbidden = true;
        failed++;
      }
    });
    await prisma.rfmWriteBack.deleteMany({ where: { tenantId, copernicaProfileId: { in: done } } });
    cleared += done.length;
    if (forbidden) break;
  }
  return { cleared, failed, remaining: Math.max(0, rows.length - cleared) };
}
