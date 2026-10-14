import { getPrismaClient } from "../prisma";
import type { PredictData } from "./features";
import type { ProfilePredictionResult } from "./model";

/**
 * Did the predicted orders come true? Every predicted order is kept as it was made and judged later
 * against the orders that really followed, with the most popular product as a naive comparison.
 */
const dayMs = 24 * 60 * 60 * 1000;
/** An order from a week before to two weeks after the expected date counts as on time. */
export const EARLY_DAYS = 7;
export const LATE_DAYS = 14;
/** Any order within this many days after the prediction counts as "ordered, other timing". */
export const ANY_ORDER_DAYS = 60;
/** Below this many judged predictions the figures say too little to show. */
export const MIN_JUDGED = 30;
const RETENTION_DAYS = 400;

export type OutcomeStatus = "open" | "op_tijd" | "andere_timing" | "geen_bestelling";
export type OutcomeInput = { predictedAt: Date; expectedAt: Date; productId: string | null; category: string | null; baselineProductId: string | null };
export type Judgement = { status: Exclude<OutcomeStatus, "open">; orderedAt: Date | null; productHit: boolean | null; categoryHit: boolean | null; baselineHit: boolean | null };
type OrderLike = { date: Date };
type LineLike = { date: Date; productId: string; category: string | null };

/** The verdict on one prediction, or null while it can still come true. */
export function evaluateOutcome(outcome: OutcomeInput, orders: OrderLike[], lines: LineLike[], now: Date): Judgement | null {
  const start = outcome.predictedAt.getTime();
  const onTimeFrom = Math.max(start, outcome.expectedAt.getTime() - EARLY_DAYS * dayMs);
  const onTimeTo = outcome.expectedAt.getTime() + LATE_DAYS * dayMs;
  const anyTo = start + ANY_ORDER_DAYS * dayMs;
  const after = orders.filter((order) => order.date.getTime() > start && order.date.getTime() <= now.getTime()).sort((left, right) => left.date.getTime() - right.date.getTime());

  const onTime = after.find((order) => order.date.getTime() >= onTimeFrom && order.date.getTime() <= onTimeTo);
  if (onTime) return judge("op_tijd", onTime.date, onTimeFrom, Math.min(onTimeTo, now.getTime()));
  // Without an on-time order the verdict waits until both windows have closed.
  if (now.getTime() <= Math.max(onTimeTo, anyTo)) return null;
  const other = after.find((order) => order.date.getTime() <= anyTo);
  return other ? judge("andere_timing", other.date, start, anyTo) : judge("geen_bestelling", null, start, anyTo);

  function judge(status: Judgement["status"], orderedAt: Date | null, from: number, to: number): Judgement {
    // What was bought in the window that decided the verdict (order lines carry their order's date).
    const bought = orderedAt ? lines.filter((line) => line.date.getTime() > start && line.date.getTime() >= from && line.date.getTime() <= to) : [];
    return {
      status,
      orderedAt,
      productHit: outcome.productId ? bought.some((line) => line.productId === outcome.productId) : null,
      categoryHit: outcome.category ? bought.some((line) => line.category === outcome.category) : null,
      baselineHit: outcome.baselineProductId ? bought.some((line) => line.productId === outcome.baselineProductId) : null,
    };
  }
}

function groupByProfile<T extends { profileId: string }>(items: T[]) {
  const grouped = new Map<string, T[]>();
  for (const item of items) {
    const list = grouped.get(item.profileId) ?? [];
    list.push(item);
    grouped.set(item.profileId, list);
  }
  return grouped;
}

/** Judges every open prediction of this customer against the orders the nightly run fetched. */
export async function judgeOpenOutcomes(tenantId: string, data: PredictData, now: Date) {
  const prisma = getPrismaClient();
  const open = await prisma.predictionOutcome.findMany({ where: { tenantId, status: "open" }, select: { id: true, copernicaProfileId: true, predictedAt: true, expectedAt: true, productId: true, category: true, baselineProductId: true } });
  const orders = groupByProfile(data.orders);
  const lines = groupByProfile(data.lines);
  const judged = open.flatMap((outcome) => {
    const verdict = evaluateOutcome(outcome, orders.get(outcome.copernicaProfileId) ?? [], lines.get(outcome.copernicaProfileId) ?? [], now);
    return verdict ? [{ id: outcome.id, verdict }] : [];
  });
  for (let index = 0; index < judged.length; index += 500) {
    await prisma.$transaction(judged.slice(index, index + 500).map(({ id, verdict }) => prisma.predictionOutcome.update({ where: { id }, data: { ...verdict, resolvedAt: now } })));
  }
  await prisma.predictionOutcome.deleteMany({ where: { tenantId, resolvedAt: { lt: new Date(now.getTime() - RETENTION_DAYS * dayMs) } } });
  return judged.length;
}

/**
 * Keeps tonight's predicted orders, but only for profiles without an open prediction: a prediction
 * stands until it is judged, so it cannot be moved closer to what actually happens.
 */
export async function recordPredictions(tenantId: string, predictions: ProfilePredictionResult[], data: PredictData, sent: Map<string, number>, now: Date) {
  const prisma = getPrismaClient();
  const open = new Set((await prisma.predictionOutcome.findMany({ where: { tenantId, status: "open" }, select: { copernicaProfileId: true }, distinct: ["copernicaProfileId"] })).map((row) => row.copernicaProfileId));
  const popular = popularProducts(data, now);
  const owned = new Map<string, Set<string>>();
  for (const line of data.lines) {
    if (line.date.getTime() > now.getTime()) continue;
    const set = owned.get(line.profileId) ?? new Set<string>();
    set.add(line.productId);
    owned.set(line.profileId, set);
  }
  const rows = predictions
    .filter((prediction) => prediction.predictedOrders.length && !open.has(prediction.profileId))
    .flatMap((prediction) => {
      // The naive guess: the most popular product this customer does not have yet.
      const has = owned.get(prediction.profileId) ?? new Set<string>();
      const baselineProductId = popular.find((product) => !has.has(product)) ?? null;
      return prediction.predictedOrders.map((order, index) => ({
        tenantId,
        copernicaProfileId: prediction.profileId,
        predictedAt: now,
        rank: index + 1,
        expectedAt: new Date(order.date),
        productId: order.productId,
        productName: order.productName,
        category: order.category,
        source: order.source,
        orderChance: prediction.orderChance,
        sentToCopernica: index < (sent.get(prediction.profileId) ?? 0),
        baselineProductId,
      }));
    });
  for (let index = 0; index < rows.length; index += 5000) await prisma.predictionOutcome.createMany({ data: rows.slice(index, index + 5000) });
  return rows.length;
}

/** Products by number of buyers in the last 90 days. */
function popularProducts(data: PredictData, now: Date) {
  const since = now.getTime() - 90 * dayMs;
  const buyers = new Map<string, Set<string>>();
  for (const line of data.lines) {
    if (line.date.getTime() < since || line.date.getTime() > now.getTime()) continue;
    const set = buyers.get(line.productId) ?? new Set<string>();
    set.add(line.profileId);
    buyers.set(line.productId, set);
  }
  return [...buyers].sort((left, right) => right[1].size - left[1].size).slice(0, 50).map(([product]) => product);
}

// ---------------------------------------------------------------- report

export type OutcomeRow = {
  predictedAt: Date;
  expectedAt: Date;
  productId: string | null;
  source: string;
  orderChance: number | null;
  status: string;
  orderedAt: Date | null;
  productHit: boolean | null;
  categoryHit: boolean | null;
  baselineHit: boolean | null;
};

export type OutcomeReport = {
  trackingSince: Date | null;
  open: number;
  judged: number;
  onTime: number;
  otherTiming: number;
  noOrder: number;
  /** Rows with a predicted product and a naive guess, so both are judged on the same predictions. */
  product: { n: number; hits: number; baselineHits: number };
  category: { n: number; hits: number };
  calibration: { label: string; n: number; averageChance: number; ordered: number }[];
  sources: { source: string; n: number; ordered: number; productN: number; productHits: number }[];
  /** Median days between the expected and the actual order date (negative: earlier than expected). */
  medianDaysOff: number | null;
};

const chanceBuckets = [[0, 0.2], [0.2, 0.4], [0.4, 0.6], [0.6, 0.8], [0.8, 1.01]] as const;
const sourceOrder = ["herhaalaankoop", "aanbeveling", "categorie"];

export function summarizeOutcomes(rows: OutcomeRow[]): OutcomeReport {
  const judged = rows.filter((row) => row.status !== "open");
  const ordered = (row: OutcomeRow) => row.status === "op_tijd" || row.status === "andere_timing";
  const withBoth = judged.filter((row) => row.productHit !== null && row.baselineHit !== null);
  const withCategory = judged.filter((row) => row.categoryHit !== null);
  const days = judged.filter((row) => row.orderedAt).map((row) => Math.round((row.orderedAt!.getTime() - row.expectedAt.getTime()) / dayMs)).sort((left, right) => left - right);
  return {
    trackingSince: rows.length ? new Date(Math.min(...rows.map((row) => row.predictedAt.getTime()))) : null,
    open: rows.length - judged.length,
    judged: judged.length,
    onTime: judged.filter((row) => row.status === "op_tijd").length,
    otherTiming: judged.filter((row) => row.status === "andere_timing").length,
    noOrder: judged.filter((row) => row.status === "geen_bestelling").length,
    product: { n: withBoth.length, hits: withBoth.filter((row) => row.productHit).length, baselineHits: withBoth.filter((row) => row.baselineHit).length },
    category: { n: withCategory.length, hits: withCategory.filter((row) => row.categoryHit).length },
    calibration: chanceBuckets.map(([from, to]) => {
      const inBucket = judged.filter((row) => row.orderChance !== null && row.orderChance >= from && row.orderChance < to);
      return {
        label: `${Math.round(from * 100)}–${Math.min(100, Math.round(to * 100))}%`,
        n: inBucket.length,
        averageChance: inBucket.length ? inBucket.reduce((sum, row) => sum + row.orderChance!, 0) / inBucket.length : 0,
        ordered: inBucket.filter(ordered).length,
      };
    }).filter((bucket) => bucket.n > 0),
    sources: sourceOrder.map((source) => {
      const ofSource = judged.filter((row) => row.source === source);
      const withProduct = ofSource.filter((row) => row.productHit !== null);
      return { source, n: ofSource.length, ordered: ofSource.filter(ordered).length, productN: withProduct.length, productHits: withProduct.filter((row) => row.productHit).length };
    }).filter((row) => row.n > 0),
    medianDaysOff: days.length ? days[Math.floor(days.length / 2)] : null,
  };
}

/** Only the first expected order per profile counts as "the" prediction for whether someone orders. */
export async function loadOutcomeReport(tenantId: string, { sentOnly }: { sentOnly: boolean }) {
  const rows = await getPrismaClient().predictionOutcome.findMany({
    where: { tenantId, ...(sentOnly ? { sentToCopernica: true } : {}) },
    select: { predictedAt: true, expectedAt: true, productId: true, source: true, orderChance: true, status: true, orderedAt: true, productHit: true, categoryHit: true, baselineHit: true, rank: true },
  });
  const firstOnly = rows.filter((row) => row.rank === 1);
  return { profiles: summarizeOutcomes(firstOnly), predictions: summarizeOutcomes(rows) };
}
