import type { SubprofileRow } from "../rfm/copernica-orders";
import { parseCopernicaDate } from "../rfm/parse";
import type { RfmOrder } from "../rfm/score";
import type { PredictData, PredictWebEvent } from "./features";

export const WEB_LOOKBACK_DAYS = 120;
const dayMs = 24 * 60 * 60 * 1000;

export type PredictMapping = {
  lineOrderField: string;
  lineProductField: string;
  lineNameField: string | null;
  lineCategoryField: string | null;
  webDateField: string | null;
  webProductField: string | null;
  webCategoryField: string | null;
  webEventField: string | null;
};

export type DataQuality = { orders: number; lines: number; linesWithoutOrder: number; linesWithoutProduct: number; events: number; eventsWithoutDate: number };

const text = (value: unknown) => (value === null || value === undefined ? "" : String(value).trim());
const cartPattern = /cart|winkelwagen|basket|mandje|checkout/i;

/**
 * Turns Copernica rows into model input. Order lines get their date (and, when missing, their
 * profile) from the order they belong to; lines without a known order are left out and counted.
 */
export function assemblePredictData(
  orders: RfmOrder[],
  lineRows: SubprofileRow[],
  eventRows: SubprofileRow[],
  mapping: PredictMapping,
  options: { now: Date; excludedStatuses: string[] },
): { data: PredictData; quality: DataQuality } {
  const excluded = new Set(options.excludedStatuses.map((status) => status.trim().toLowerCase()).filter(Boolean));
  const latest = options.now.getTime() + dayMs;
  const usable = orders.filter((order): order is RfmOrder & { date: Date } =>
    Boolean(order.profileId && order.date && !Number.isNaN(order.date.getTime()) && order.date.getTime() <= latest && !(order.status && excluded.has(order.status.trim().toLowerCase()))));
  const byKey = new Map(usable.filter((order) => order.key).map((order) => [order.key!, order]));

  const quality: DataQuality = { orders: usable.length, lines: 0, linesWithoutOrder: 0, linesWithoutProduct: 0, events: 0, eventsWithoutDate: 0 };
  const lines: PredictData["lines"] = [];
  for (const row of lineRows) {
    const order = byKey.get(text(row.fields[mapping.lineOrderField]));
    const productId = text(row.fields[mapping.lineProductField]);
    if (!order) { quality.linesWithoutOrder++; continue; }
    if (!productId) { quality.linesWithoutProduct++; continue; }
    lines.push({
      profileId: row.profile || order.profileId,
      date: order.date,
      productId,
      productName: (mapping.lineNameField && text(row.fields[mapping.lineNameField])) || productId,
      category: (mapping.lineCategoryField && text(row.fields[mapping.lineCategoryField])) || null,
    });
  }
  quality.lines = lines.length;

  const events: PredictWebEvent[] = [];
  const since = options.now.getTime() - WEB_LOOKBACK_DAYS * dayMs;
  if (mapping.webDateField) {
    for (const row of eventRows) {
      const date = parseCopernicaDate(row.fields[mapping.webDateField]);
      if (!row.profile || !date) { quality.eventsWithoutDate++; continue; }
      // The API filter may not apply to every field type; filter here as well.
      if (date.getTime() < since || date.getTime() > latest) continue;
      const productId = (mapping.webProductField && text(row.fields[mapping.webProductField])) || null;
      const kind = mapping.webEventField && cartPattern.test(text(row.fields[mapping.webEventField])) ? "cart" : productId ? "view" : "other";
      events.push({ profileId: row.profile, date, productId, category: (mapping.webCategoryField && text(row.fields[mapping.webCategoryField])) || null, kind });
    }
  }
  quality.events = events.length;

  return { data: { orders: usable.map((order) => ({ profileId: order.profileId, date: order.date, amount: order.amount ?? 0 })), lines, events }, quality };
}
