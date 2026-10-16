import { copernicaGet, mapInBatches, type CopernicaList } from "../copernica";
import { getPrismaClient } from "../prisma";
import { parseAmount, parseCopernicaDate } from "../rfm/parse";
import { mappingHash, type CacheSource } from "./sources";

/**
 * Keeps a customer's orders, order lines and web events in our database, so the models no longer fetch
 * everything from Copernica every night. Normally only rows newer than the last one seen are fetched
 * (newest first, until a known row turns up). A full refresh, needed at the start, after a mapping change
 * and once a week for changed or removed rows, runs in steps across several worker slices.
 */
const PAGE = 1000;
const PARALLEL = 4;
const FULL_REFRESH_DAYS = 7;
export const EVENT_DAYS = 120;
const dayMs = 24 * 60 * 60 * 1000;

type Subprofile = { ID: number | string; profile: number | string; fields?: Record<string, unknown>; removed?: boolean | string };
/** `maxId`: during a full refresh the highest id seen; when incremental the boundary (rows above it are new) and `newest` the highest new id. */
export type IngestCursor = { mode: "full" | "incremental"; generation: number; start: number; maxId: string; newest?: string; rows: number; total?: number };
export type IngestResult = { done: boolean; cursor: IngestCursor | null; progress: string };

const text = (value: unknown) => (value === null || value === undefined ? "" : String(value).trim());
const removed = (row: Subprofile) => row.removed === true || row.removed === "yes" || row.removed === "1";
const kindLabel = { orders: "orders", lines: "orderregels", events: "webtracking" } as const;

function pageParams(source: CacheSource, start: number, order: "asc" | "desc", now: Date) {
  const params = new URLSearchParams({ start: String(start), limit: String(PAGE), total: "true", orderby: "id", order });
  // Web events: only the window the models use.
  if (source.kind === "events") params.append("fields[]", `${source.dateField}>=${new Date(now.getTime() - EVENT_DAYS * dayMs).toISOString().slice(0, 10)}`);
  return params;
}

function fetchPage(jwt: string, source: CacheSource, start: number, order: "asc" | "desc", now: Date) {
  return copernicaGet<CopernicaList<Subprofile>>(jwt, `collection/${encodeURIComponent(source.collectionId)}/subprofiles`, pageParams(source, start, order, now));
}

/** Writes rows in one statement per batch (insert, or update when the subprofile is already cached). */
async function store(tenantId: string, source: CacheSource, rows: Subprofile[], generation: number) {
  const prisma = getPrismaClient();
  const usable = rows.filter((row) => !removed(row) && row.profile);
  for (let index = 0; index < usable.length; index += 2000) {
    const batch = usable.slice(index, index + 2000);
    const ids = batch.map((row) => String(row.ID));
    const profiles = batch.map((row) => String(row.profile));
    const field = (name: string | null) => batch.map((row) => (name ? text(row.fields?.[name]) || null : null));
    if (source.kind === "orders") {
      const dates = batch.map((row) => parseCopernicaDate(row.fields?.[source.dateField])?.toISOString() ?? null);
      const amounts = batch.map((row) => parseAmount(row.fields?.[source.amountField]));
      await prisma.$executeRaw`
        INSERT INTO "CachedOrder" ("tenantId", "subprofileId", "profileId", "orderKey", "date", "amount", "status", "generation")
        SELECT ${tenantId}, u.* , ${generation} FROM unnest(${ids}::text[], ${profiles}::text[], ${field(source.keyField)}::text[], ${dates}::timestamp(3)[], ${amounts}::float8[], ${field(source.statusField)}::text[]) AS u
        ON CONFLICT ("tenantId", "subprofileId") DO UPDATE SET "profileId" = EXCLUDED."profileId", "orderKey" = EXCLUDED."orderKey", "date" = EXCLUDED."date", "amount" = EXCLUDED."amount", "status" = EXCLUDED."status", "generation" = EXCLUDED."generation"`;
    } else if (source.kind === "lines") {
      const keep = batch.map((row) => Boolean(text(row.fields?.[source.orderField]) && text(row.fields?.[source.productField])));
      const pick = <T,>(values: T[]) => values.filter((_, position) => keep[position]);
      await prisma.$executeRaw`
        INSERT INTO "CachedLine" ("tenantId", "subprofileId", "profileId", "orderKey", "productId", "productName", "category", "generation")
        SELECT ${tenantId}, u.*, ${generation} FROM unnest(${pick(ids)}::text[], ${pick(profiles)}::text[], ${pick(field(source.orderField))}::text[], ${pick(field(source.productField))}::text[], ${pick(field(source.nameField))}::text[], ${pick(field(source.categoryField))}::text[]) AS u
        ON CONFLICT ("tenantId", "subprofileId") DO UPDATE SET "profileId" = EXCLUDED."profileId", "orderKey" = EXCLUDED."orderKey", "productId" = EXCLUDED."productId", "productName" = EXCLUDED."productName", "category" = EXCLUDED."category", "generation" = EXCLUDED."generation"`;
    } else {
      const dates = batch.map((row) => parseCopernicaDate(row.fields?.[source.dateField])?.toISOString() ?? null);
      const keep = dates.map(Boolean);
      const pick = <T,>(values: T[]) => values.filter((_, position) => keep[position]);
      await prisma.$executeRaw`
        INSERT INTO "CachedEvent" ("tenantId", "subprofileId", "profileId", "date", "productId", "category", "eventType", "generation")
        SELECT ${tenantId}, u.*, ${generation} FROM unnest(${pick(ids)}::text[], ${pick(profiles)}::text[], ${pick(dates)}::timestamp(3)[], ${pick(field(source.productField))}::text[], ${pick(field(source.categoryField))}::text[], ${pick(field(source.eventField))}::text[]) AS u
        ON CONFLICT ("tenantId", "subprofileId") DO UPDATE SET "profileId" = EXCLUDED."profileId", "date" = EXCLUDED."date", "productId" = EXCLUDED."productId", "category" = EXCLUDED."category", "eventType" = EXCLUDED."eventType", "generation" = EXCLUDED."generation"`;
    }
  }
  return usable.length;
}

function removeOtherGenerations(kind: CacheSource["kind"], tenantId: string, generation: number) {
  const prisma = getPrismaClient();
  const where = { tenantId, generation: { not: generation } };
  return kind === "orders" ? prisma.cachedOrder.deleteMany({ where }) : kind === "lines" ? prisma.cachedLine.deleteMany({ where }) : prisma.cachedEvent.deleteMany({ where });
}

async function highestGeneration(kind: CacheSource["kind"], tenantId: string) {
  const prisma = getPrismaClient();
  const result = kind === "orders"
    ? await prisma.cachedOrder.aggregate({ where: { tenantId }, _max: { generation: true } })
    : kind === "lines" ? await prisma.cachedLine.aggregate({ where: { tenantId }, _max: { generation: true } })
    : await prisma.cachedEvent.aggregate({ where: { tenantId }, _max: { generation: true } });
  return result._max.generation ?? 0;
}

function countRows(kind: CacheSource["kind"], tenantId: string) {
  const prisma = getPrismaClient();
  return kind === "orders" ? prisma.cachedOrder.count({ where: { tenantId } }) : kind === "lines" ? prisma.cachedLine.count({ where: { tenantId } }) : prisma.cachedEvent.count({ where: { tenantId } });
}

const larger = (left: string, right: string) => (BigInt(left) >= BigInt(right) ? left : right);
const maxOf = (rows: Subprofile[], current: string) => rows.reduce((max, row) => larger(max, String(row.ID)), current);

/** Removes a customer's cached rows of one kind and its state: the models then read from Copernica again. */
export async function dropCache(tenantId: string, kind: CacheSource["kind"]) {
  const prisma = getPrismaClient();
  if (kind === "orders") await prisma.cachedOrder.deleteMany({ where: { tenantId } });
  else if (kind === "lines") await prisma.cachedLine.deleteMany({ where: { tenantId } });
  else await prisma.cachedEvent.deleteMany({ where: { tenantId } });
  await prisma.dataCache.deleteMany({ where: { tenantId, kind } });
}

/**
 * One slice of filling the cache for one collection; call again with the returned cursor until done.
 * `tooLarge` is asked every few pages: when the database passes its limit the cache of this kind is
 * removed altogether (a partial cache is useless and only takes space).
 */
export async function ingestSlice(tenantId: string, source: CacheSource, jwt: string, cursor: IngestCursor | null, deadline: number, tooLarge: () => Promise<boolean>, now = new Date()): Promise<IngestResult> {
  const prisma = getPrismaClient();
  const hash = mappingHash(source);
  const state = await prisma.dataCache.findUnique({ where: { tenantId_kind: { tenantId, kind: source.kind } } });
  const needsFull = !state || state.mappingHash !== hash || state.collectionId !== source.collectionId || !state.fullRefreshAt || now.getTime() - state.fullRefreshAt.getTime() > FULL_REFRESH_DAYS * dayMs;
  // A new full refresh gets a generation above anything in the table, so every row it does not see is removed,
  // also when the cache state was lost while rows remained.
  const current: IngestCursor = cursor ?? (needsFull
    ? { mode: "full", generation: Math.max(state?.generation ?? 0, await highestGeneration(source.kind, tenantId)) + 1, start: 0, maxId: "0", rows: 0 }
    : { mode: "incremental", generation: state!.generation, start: 0, maxId: String(state!.maxSubprofileId), rows: 0 });
  const label = kindLabel[source.kind];

  if (current.mode === "full") {
    // Oldest first: rows added during the refresh land at the end and are picked up as well.
    while (Date.now() < deadline) {
      if (await tooLarge()) {
        await dropCache(tenantId, source.kind);
        return { done: true, cursor: null, progress: `${label}: cache gestopt en opgeruimd, de database is te groot; de berekening haalt de gegevens rechtstreeks uit Copernica` };
      }
      const starts = Array.from({ length: PARALLEL }, (_, index) => current.start + index * PAGE).filter((start) => current.total === undefined || start < current.total);
      if (!starts.length) break;
      const pages = await mapInBatches(starts, PARALLEL, (start) => fetchPage(jwt, source, start, "asc", now));
      current.total = Math.max(...pages.map((page) => Number(page.total ?? 0)));
      const rows = pages.flatMap((page) => page.data ?? []);
      current.rows += await store(tenantId, source, rows, current.generation);
      current.maxId = maxOf(rows, current.maxId);
      current.start += starts.length * PAGE;
      if (!rows.length || current.start >= current.total) break;
    }
    if (current.total !== undefined && current.start < current.total) {
      return { done: false, cursor: current, progress: `${label}: ${current.rows.toLocaleString("nl-NL")} van ${current.total.toLocaleString("nl-NL")} opgehaald (volledige verversing)` };
    }
    // Done: anything not seen in this refresh was removed in Copernica (or no longer matches the window).
    await removeOtherGenerations(source.kind, tenantId, current.generation);
    const rowCount = await countRows(source.kind, tenantId);
    const data = { collectionId: source.collectionId, mappingHash: hash, maxSubprofileId: BigInt(current.maxId), rowCount, generation: current.generation, fullRefreshAt: now, incrementalAt: now };
    await prisma.dataCache.upsert({ where: { tenantId_kind: { tenantId, kind: source.kind } }, create: { tenantId, kind: source.kind, ...data }, update: data });
    return { done: true, cursor: null, progress: `${label}: ${rowCount.toLocaleString("nl-NL")} rijen volledig ververst` };
  }

  // Incremental: newest first until a row we already have.
  const known = BigInt(current.maxId);
  let newest = current.newest ?? current.maxId;
  let reachedKnown = false;
  while (Date.now() < deadline && !reachedKnown) {
    const page = await fetchPage(jwt, source, current.start, "desc", now);
    const rows = page.data ?? [];
    const fresh = rows.filter((row) => BigInt(String(row.ID)) > known);
    current.rows += await store(tenantId, source, fresh, current.generation);
    newest = maxOf(fresh, newest);
    reachedKnown = !rows.length || fresh.length < rows.length;
    current.start += PAGE;
  }
  if (!reachedKnown) return { done: false, cursor: { ...current, newest }, progress: `${label}: ${current.rows.toLocaleString("nl-NL")} nieuwe rijen opgehaald` };
  if (source.kind === "events") await prisma.cachedEvent.deleteMany({ where: { tenantId, date: { lt: new Date(now.getTime() - EVENT_DAYS * dayMs) } } });
  const rowCount = await countRows(source.kind, tenantId);
  await prisma.dataCache.update({ where: { tenantId_kind: { tenantId, kind: source.kind } }, data: { maxSubprofileId: BigInt(larger(newest, current.maxId)), rowCount, incrementalAt: now } });
  return { done: true, cursor: null, progress: `${label}: ${current.rows.toLocaleString("nl-NL")} nieuwe rijen, ${rowCount.toLocaleString("nl-NL")} in totaal` };
}
