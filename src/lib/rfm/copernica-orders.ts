import { copernicaGet, mapInBatches, type CopernicaList } from "../copernica";
import { parseAmount, parseCopernicaDate } from "./parse";
import type { RfmOrder } from "./score";

export type CopernicaCollection = { ID: number | string; name: string };
export type CopernicaField = { ID: number | string; name: string; type?: string };
type CopernicaSubprofile = { ID: number | string; profile: number | string; fields?: Record<string, unknown>; removed?: boolean | string };

const pageSize = 1000;
const pageConcurrency = 4;

export type OrderFieldMapping = { dateField: string; amountField: string; statusField?: string | null };

export async function listCollections(jwt: string, databaseId: string) {
  const result = await copernicaGet<CopernicaList<CopernicaCollection>>(jwt, `database/${encodeURIComponent(databaseId)}/collections`, new URLSearchParams({ limit: "1000" }));
  return (result.data ?? []).map((collection) => ({ id: String(collection.ID), name: collection.name }));
}

export async function listCollectionFields(jwt: string, collectionId: string) {
  const result = await copernicaGet<CopernicaList<CopernicaField>>(jwt, `collection/${encodeURIComponent(collectionId)}/fields`, new URLSearchParams({ limit: "1000" }));
  return (result.data ?? []).map((field) => ({ id: String(field.ID), name: field.name, type: field.type ?? "" }));
}

export async function countDatabaseProfiles(jwt: string, databaseId: string) {
  const result = await copernicaGet<CopernicaList<unknown>>(jwt, `database/${encodeURIComponent(databaseId)}/profiles`, new URLSearchParams({ start: "0", limit: "1", total: "true" }));
  return Number(result.total ?? 0);
}

export async function sampleOrders(jwt: string, collectionId: string, limit = 5) {
  const result = await copernicaGet<CopernicaList<CopernicaSubprofile>>(jwt, `collection/${encodeURIComponent(collectionId)}/subprofiles`, new URLSearchParams({ start: "0", limit: String(limit), total: "true", orderby: "id", order: "desc" }));
  return { total: Number(result.total ?? 0), rows: (result.data ?? []).map((row) => ({ profile: String(row.profile), fields: stringFields(row.fields) })) };
}

/** Fetches every order subprofile of a collection and maps it onto the configured fields. */
export async function fetchAllOrders(jwt: string, collectionId: string, mapping: OrderFieldMapping) {
  const path = `collection/${encodeURIComponent(collectionId)}/subprofiles`;
  const pageParams = (start: number) => new URLSearchParams({ start: String(start), limit: String(pageSize), total: "true" });
  const first = await copernicaGet<CopernicaList<CopernicaSubprofile>>(jwt, path, pageParams(0));
  const total = Number(first.total ?? first.data?.length ?? 0);
  const starts: number[] = [];
  for (let start = pageSize; start < total; start += pageSize) starts.push(start);

  const pages = await mapInBatches(starts, pageConcurrency, (start) => copernicaGet<CopernicaList<CopernicaSubprofile>>(jwt, path, pageParams(start)));
  const rows = [first, ...pages].flatMap((page) => page.data ?? []);

  return {
    total,
    pages: starts.length + 1,
    orders: rows
      .filter((row) => !isTruthy(row.removed))
      .map((row): RfmOrder => {
        const fields = row.fields ?? {};
        return {
          profileId: row.profile ? String(row.profile) : "",
          date: parseCopernicaDate(fields[mapping.dateField]),
          amount: parseAmount(fields[mapping.amountField]),
          status: mapping.statusField ? String(fields[mapping.statusField] ?? "") : null,
        };
      }),
  };
}

function stringFields(fields: Record<string, unknown> | undefined) {
  return Object.fromEntries(Object.entries(fields ?? {}).map(([key, value]) => [key, value === null || value === undefined ? "" : String(value)]));
}

function isTruthy(value: unknown) {
  return value === true || value === "yes" || value === "1" || value === 1;
}
