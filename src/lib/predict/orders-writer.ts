import { CopernicaError, copernicaSend, createdId, getTenantCopernica, mapInBatches } from "../copernica";
import { getPrismaClient } from "../prisma";
import { listCollectionFields, listCollections } from "../rfm/copernica-orders";
import type { PredictedOrder } from "./model";
import { forecastRecords, planRecordWrites, profilesInScope, recordKey, type ForecastMapping, type ForecastScope } from "./orders-plan";

export type ForecastWriteSummary = { at: string; created: number; updated: number; deleted: number; failed: number; remaining: number; error?: string };

/** Suggested collection when the customer has none yet; the beheerder can also pick an existing one. */
export const FORECAST_COLLECTION = "Verwachte_bestellingen";
const suggestedFields = [
  { name: "Datum", type: "empty_date", description: "Verwachte besteldatum" },
  { name: "SKU", type: "text", length: 100, description: "Product-ID/SKU van het verwachte product (leeg bij alleen een categorie)" },
  { name: "Productnaam", type: "text", length: 150, description: "Naam van het verwachte product" },
  { name: "Categorie", type: "text", length: 100, description: "Categorie of productgroep" },
  { name: "Kans", type: "integer", description: "Kans op een bestelling in de komende 30 dagen (0–100)" },
] as const;

const BATCH = 200;
const CONCURRENCY = 8;

/** Creates (or completes) the suggested collection and returns the mapping onto its fields. */
export async function createForecastCollection(tenantId: string) {
  const connected = await getTenantCopernica(tenantId);
  if (!connected) throw new Error("Deze klant heeft nog geen Copernica-koppeling.");
  const { jwt, connection } = connected;
  const find = async () => (await listCollections(jwt, connection.databaseId)).find((collection) => collection.name.toLowerCase() === FORECAST_COLLECTION.toLowerCase()) ?? null;
  let collection = await find();
  if (!collection) {
    const id = createdId(await copernicaSend(jwt, "POST", `database/${encodeURIComponent(connection.databaseId)}/collections`, { name: FORECAST_COLLECTION, description: "Verwachte bestellingen per profiel, bijgewerkt door het E-mail Statistieken-dashboard." }));
    collection = id ? { id, name: FORECAST_COLLECTION } : await find();
    if (!collection) throw new Error("De collectie is aangemaakt maar niet teruggevonden.");
  }
  const existing = new Set((await listCollectionFields(jwt, collection.id)).map((field) => field.name.toLowerCase()));
  for (const field of suggestedFields) {
    if (existing.has(field.name.toLowerCase())) continue;
    await copernicaSend(jwt, "POST", `collection/${encodeURIComponent(collection.id)}/fields`, { name: field.name, type: field.type, description: field.description, ...("length" in field ? { length: field.length } : {}), index: field.name === "SKU" || field.name === "Datum", displayed: field.name !== "Kans" });
  }
  return { collectionId: collection.id, collectionName: collection.name, dateField: "Datum", skuField: "SKU", nameField: "Productnaam", categoryField: "Categorie", chanceField: "Kans" };
}

/**
 * Brings the chosen collection in line with the latest predictions: one record per expected order,
 * for the profiles in scope. Records that no longer apply are deleted. Stops at the deadline.
 */
export async function writeForecastOrders(tenantId: string, deadline: number): Promise<ForecastWriteSummary> {
  const prisma = getPrismaClient();
  const config = await prisma.predictionConfig.findUnique({ where: { tenantId } });
  if (!config?.forecastCollectionId || !config.forecastDateField || !config.forecastSkuField) throw new Error("Kies eerst de collectie en de velden voor datum en SKU.");
  const connected = await getTenantCopernica(tenantId);
  if (!connected) throw new Error("Deze klant heeft nog geen Copernica-koppeling.");

  const mapping: ForecastMapping = { collectionId: config.forecastCollectionId, dateField: config.forecastDateField, skuField: config.forecastSkuField, nameField: config.forecastNameField, categoryField: config.forecastCategoryField, chanceField: config.forecastChanceField };
  const [rows, writtenRows] = await Promise.all([
    config.enabled && config.writeBackEnabled ? prisma.profilePrediction.findMany({ where: { tenantId, orderChance: { not: null } }, select: { copernicaProfileId: true, orderChance: true, predictedOrders: true } }) : Promise.resolve([]),
    prisma.insightWriteBack.findMany({ where: { tenantId }, select: { copernicaProfileId: true, insightKey: true, subprofileId: true, hash: true } }),
  ]);
  const profiles = profilesInScope(rows.map((row) => ({ profileId: row.copernicaProfileId, orderChance: row.orderChance, predictedOrders: (row.predictedOrders ?? []) as PredictedOrder[] })), config.forecastScope as ForecastScope);
  const desired = new Map(forecastRecords(profiles, mapping, config.forecastRecords).map((record) => [recordKey(record.profileId, record.key), record]));
  const written = new Map(writtenRows.map((row) => [recordKey(row.copernicaProfileId, row.insightKey), row]));
  const tasks = planRecordWrites(new Map([...desired].map(([id, record]) => [id, record.hash])), new Map([...written].map(([id, row]) => [id, row.hash])));

  const { jwt } = connected;
  const remove = async (subprofileId: string) => {
    try {
      await copernicaSend(jwt, "DELETE", `subprofile/${encodeURIComponent(subprofileId)}`, {});
    } catch (error) {
      // Already gone in Copernica: that is what we wanted.
      if (!(error instanceof CopernicaError && error.status === 404)) throw error;
    }
  };
  const create = async (profileId: string, fields: Record<string, string | number>) => {
    const id = createdId(await copernicaSend(jwt, "POST", `profile/${encodeURIComponent(profileId)}/subprofiles/${encodeURIComponent(mapping.collectionId)}`, fields));
    if (!id) throw new Error("Copernica gaf geen id terug.");
    return id;
  };

  const summary: ForecastWriteSummary = { at: new Date().toISOString(), created: 0, updated: 0, deleted: 0, failed: 0, remaining: tasks.length };
  for (let index = 0; index < tasks.length && Date.now() < deadline; index += BATCH) {
    const saved: { profileId: string; key: string; subprofileId: string; hash: string }[] = [];
    const removed: { profileId: string; key: string }[] = [];
    let forbidden = false;
    await mapInBatches(tasks.slice(index, index + BATCH), CONCURRENCY, async ({ profileId, key, action }) => {
      if (forbidden) return;
      const id = recordKey(profileId, key);
      try {
        if (action === "delete") {
          await remove(written.get(id)!.subprofileId);
          removed.push({ profileId, key });
          summary.deleted++;
          return;
        }
        const record = desired.get(id)!;
        let subprofileId: string | null = null;
        if (action === "update") {
          subprofileId = written.get(id)!.subprofileId;
          try {
            await copernicaSend(jwt, "PUT", `subprofile/${encodeURIComponent(subprofileId)}/fields`, record.fields);
            summary.updated++;
          } catch (error) {
            // Someone removed the record in Copernica; put it back.
            if (!(error instanceof CopernicaError && error.status === 404)) throw error;
            subprofileId = null;
          }
        }
        if (action === "move") await remove(written.get(id)!.subprofileId);
        if (!subprofileId) {
          subprofileId = await create(profileId, record.fields);
          summary.created++;
        }
        saved.push({ profileId, key, subprofileId, hash: record.hash });
      } catch (error) {
        if (error instanceof CopernicaError && (error.status === 401 || error.status === 403)) forbidden = true;
        summary.failed++;
      }
    });
    const writtenAt = new Date();
    await prisma.$transaction([
      ...saved.map((item) => prisma.insightWriteBack.upsert({
        where: { tenantId_copernicaProfileId_insightKey: { tenantId, copernicaProfileId: item.profileId, insightKey: item.key } },
        create: { tenantId, copernicaProfileId: item.profileId, insightKey: item.key, subprofileId: item.subprofileId, hash: item.hash, writtenAt },
        update: { subprofileId: item.subprofileId, hash: item.hash, writtenAt },
      })),
      ...removed.map((item) => prisma.insightWriteBack.deleteMany({ where: { tenantId, copernicaProfileId: item.profileId, insightKey: item.key } })),
    ]);
    if (forbidden) {
      summary.error = "Copernica weigert het schrijven: het API-token heeft geen schrijfrechten.";
      break;
    }
  }
  summary.remaining = Math.max(0, tasks.length - summary.created - summary.updated - summary.deleted);
  await prisma.predictionConfig.update({ where: { tenantId }, data: { forecastWriteAt: new Date(), forecastWriteSummary: summary } });
  return summary;
}
