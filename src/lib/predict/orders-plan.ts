import type { PredictedOrder } from "./model";

/** Which fields of the chosen Copernica collection get what. Only the date and SKU fields are required. */
export type ForecastMapping = {
  collectionId: string;
  dateField: string;
  skuField: string;
  nameField: string | null;
  categoryField: string | null;
  chanceField: string | null;
};

export type ForecastScope = "top10" | "top40" | "all";
export const forecastScopes: Record<ForecastScope, string> = {
  top10: "Alleen de 10% met de grootste kans",
  top40: "De 40% met de grootste kans",
  all: "Iedereen met een verwachte bestelling",
};

export type ForecastProfile = { profileId: string; orderChance: number | null; predictedOrders: PredictedOrder[] };
export type ForecastRecord = { profileId: string; key: string; fields: Record<string, string | number>; hash: string };

/** The profiles in scope, most likely first: only those with a chance and at least one expected order. */
export function profilesInScope(profiles: ForecastProfile[], scope: ForecastScope) {
  const ranked = profiles.filter((profile) => profile.orderChance !== null && profile.predictedOrders.length > 0).sort((left, right) => right.orderChance! - left.orderChance!);
  if (scope === "all") return ranked;
  return ranked.slice(0, Math.ceil(ranked.length * (scope === "top10" ? 0.1 : 0.4)));
}

/**
 * One record per expected order. The hash starts with the collection, so moving to another
 * collection recreates the records there; the chance counts in 5-point steps to avoid daily rewrites.
 */
export function forecastRecords(profiles: ForecastProfile[], mapping: ForecastMapping, perProfile: number): ForecastRecord[] {
  return profiles.flatMap((profile) => profile.predictedOrders.slice(0, Math.min(3, Math.max(1, perProfile))).map((order, index) => {
    const chance = Math.round((profile.orderChance ?? 0) * 100);
    const fields: Record<string, string | number> = { [mapping.dateField]: order.date.slice(0, 10), [mapping.skuField]: order.productId ?? "" };
    if (mapping.nameField) fields[mapping.nameField] = (order.productName ?? "").slice(0, 150);
    if (mapping.categoryField) fields[mapping.categoryField] = (order.category ?? "").slice(0, 100);
    if (mapping.chanceField) fields[mapping.chanceField] = chance;
    const hash = [mapping.collectionId, ...Object.entries(fields).filter(([name]) => name !== mapping.chanceField).map(([name, value]) => `${name}=${value}`), mapping.chanceField ? Math.round(chance / 5) : ""].join("|");
    return { profileId: profile.profileId, key: `bestelling_${index + 1}`, fields, hash };
  }));
}

export const recordKey = (profileId: string, key: string) => `${profileId}\u0000${key}`;
export const hashCollection = (hash: string) => hash.split("|")[0];

export type RecordTask = { profileId: string; key: string; action: "create" | "update" | "move" | "delete" };

/** New, changed, moved (other collection) and no longer expected records. */
export function planRecordWrites(desired: Map<string, string>, written: Map<string, string>): RecordTask[] {
  const split = (id: string) => { const [profileId, key] = id.split("\u0000"); return { profileId, key }; };
  const tasks: RecordTask[] = [];
  for (const [id, hash] of desired) {
    const previous = written.get(id);
    if (previous === undefined) tasks.push({ ...split(id), action: "create" });
    else if (previous !== hash) tasks.push({ ...split(id), action: hashCollection(previous) === hashCollection(hash) ? "update" : "move" });
  }
  for (const id of written.keys()) if (!desired.has(id)) tasks.push({ ...split(id), action: "delete" });
  return tasks;
}
