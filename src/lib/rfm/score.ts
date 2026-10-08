import { fmScore, segmentFor, type RfmSegmentKey } from "./segments";

export type RfmOrder = {
  profileId: string;
  date: Date | null;
  amount: number | null;
  status?: string | null;
};

export type RfmOptions = {
  now: Date;
  windowMonths: number;
  /** Minimum order counts for F scores 1–5, ascending (default 1, 2, 3, 4, 5). */
  frequencyThresholds: number[];
  excludedStatuses: string[];
};

export type RfmCustomer = {
  profileId: string;
  lastOrderAt: Date;
  recencyDays: number;
  orderCount: number;
  revenue: number;
  r: number;
  f: number;
  m: number;
  segment: RfmSegmentKey;
};

export type RfmDataQuality = {
  totalOrders: number;
  usedOrders: number;
  excludedStatus: number;
  outsideWindow: number;
  futureDate: number;
  missingDate: number;
  missingProfile: number;
  missingAmount: number;
  negativeAmount: number;
};

const dayMs = 24 * 60 * 60 * 1000;

export function windowStart(now: Date, windowMonths: number) {
  const start = new Date(now);
  start.setUTCMonth(start.getUTCMonth() - windowMonths);
  return start;
}

export function scoreRfm(orders: RfmOrder[], options: RfmOptions) {
  const quality: RfmDataQuality = { totalOrders: orders.length, usedOrders: 0, excludedStatus: 0, outsideWindow: 0, futureDate: 0, missingDate: 0, missingProfile: 0, missingAmount: 0, negativeAmount: 0 };
  const excluded = new Set(options.excludedStatuses.map((status) => status.trim().toLowerCase()).filter(Boolean));
  const start = windowStart(options.now, options.windowMonths).getTime();
  // Allow orders later today (timezone differences), but not genuinely future-dated ones.
  const latestAllowed = options.now.getTime() + dayMs;
  const byProfile = new Map<string, { lastOrderAt: number; orderCount: number; revenue: number }>();

  for (const order of orders) {
    if (!order.profileId) { quality.missingProfile++; continue; }
    if (!order.date || Number.isNaN(order.date.getTime())) { quality.missingDate++; continue; }
    if (order.status && excluded.has(order.status.trim().toLowerCase())) { quality.excludedStatus++; continue; }
    const time = order.date.getTime();
    if (time > latestAllowed) { quality.futureDate++; continue; }
    if (time < start) { quality.outsideWindow++; continue; }

    const customer = byProfile.get(order.profileId) ?? { lastOrderAt: 0, orderCount: 0, revenue: 0 };
    customer.lastOrderAt = Math.max(customer.lastOrderAt, time);
    if (order.amount === null || Number.isNaN(order.amount)) {
      quality.missingAmount++;
      customer.orderCount++;
    } else if (order.amount < 0) {
      // Refunds and credit notes lower the revenue but are not purchases.
      quality.negativeAmount++;
      customer.revenue += order.amount;
    } else {
      customer.orderCount++;
      customer.revenue += order.amount;
    }
    quality.usedOrders++;
    byProfile.set(order.profileId, customer);
  }

  const entries = [...byProfile.entries()].filter(([, customer]) => customer.orderCount > 0);
  const recencyScores = quintileScores(entries.map(([, customer]) => customer.lastOrderAt));
  const monetaryScores = quintileScores(entries.map(([, customer]) => customer.revenue));

  const customers: RfmCustomer[] = entries.map(([profileId, customer], index) => {
    const r = recencyScores[index];
    const f = frequencyScore(customer.orderCount, options.frequencyThresholds);
    const m = monetaryScores[index];
    return {
      profileId,
      lastOrderAt: new Date(customer.lastOrderAt),
      recencyDays: Math.max(0, Math.floor((options.now.getTime() - customer.lastOrderAt) / dayMs)),
      orderCount: customer.orderCount,
      revenue: Math.round(customer.revenue * 100) / 100,
      r,
      f,
      m,
      segment: segmentFor(r, fmScore(f, m)),
    };
  });

  return { customers, quality };
}

/**
 * Scores values 1–5 by quintile, higher values scoring higher. Equal values always share
 * a score (the score of their first rank), so ties never split across quintiles.
 */
export function quintileScores(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const firstIndex = new Map<number, number>();
  sorted.forEach((value, index) => { if (!firstIndex.has(value)) firstIndex.set(value, index); });
  return values.map((value) => Math.min(5, Math.floor((firstIndex.get(value)! * 5) / values.length) + 1));
}

export function frequencyScore(orderCount: number, thresholds: number[]) {
  let score = 1;
  thresholds.slice(0, 5).forEach((threshold, index) => { if (orderCount >= threshold) score = index + 1; });
  return score;
}

/** Orders usable over the full history (no analysis window), for CLV and cohorts. */
export function usableOrders(orders: RfmOrder[], options: Pick<RfmOptions, "now" | "excludedStatuses">) {
  const excluded = new Set(options.excludedStatuses.map((status) => status.trim().toLowerCase()).filter(Boolean));
  const latestAllowed = options.now.getTime() + dayMs;
  const usable: { profileId: string; date: Date; amount: number }[] = [];
  for (const order of orders) {
    if (!order.profileId || !order.date || Number.isNaN(order.date.getTime())) continue;
    if (order.status && excluded.has(order.status.trim().toLowerCase())) continue;
    if (order.date.getTime() > latestAllowed) continue;
    usable.push({ profileId: order.profileId, date: order.date, amount: order.amount ?? 0 });
  }
  return usable;
}
