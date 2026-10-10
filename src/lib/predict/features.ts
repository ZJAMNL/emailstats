import { clvInputs, expectedPurchases, fitBgNbd, probabilityAlive, type BgNbdParams } from "../rfm/clv";

export type PredictOrder = { profileId: string; date: Date; amount: number };
export type PredictLine = { profileId: string; date: Date; productId: string; productName: string; category: string | null };
export type PredictWebEvent = { profileId: string; date: Date; productId: string | null; category: string | null; kind: "view" | "cart" | "other" };
export type PredictData = { orders: PredictOrder[]; lines: PredictLine[]; events: PredictWebEvent[] };

export const HORIZON_DAYS = 30;
/** How far back web behaviour counts for prospects. */
export const PROSPECT_LOOKBACK_DAYS = 90;
const dayMs = 24 * 60 * 60 * 1000;

export const buyerFeatures = ["recency_log", "frequency_log", "monetary_log", "bgnbd_expected_30", "probability_alive", "visits_7", "visits_30", "views_30", "carts_30", "days_since_visit", "views_favorite_category"] as const;
export const prospectFeatures = ["visits_7", "visits_30", "views_30", "carts_30", "days_since_visit", "products_viewed_30", "categories_viewed_30"] as const;

export type ProfileFeatures = { profileId: string; values: number[] };

type WebStats = { visits7: number; visits30: number; views30: number; carts30: number; daysSinceVisit: number; products30: number; categories30: number; categoryViews30: Map<string, number> };

/**
 * Web behaviour per profile in the days before `cutoff`. Only data strictly before the cutoff is used,
 * so a backtest never sees the future.
 */
export function webStats(events: PredictWebEvent[], cutoff: Date): Map<string, WebStats> {
  const end = cutoff.getTime();
  const stats = new Map<string, WebStats & { days7: Set<number>; days30: Set<number>; products: Set<string>; categories: Set<string>; last: number }>();
  for (const event of events) {
    const time = event.date.getTime();
    if (time >= end || time < end - PROSPECT_LOOKBACK_DAYS * dayMs) continue;
    const entry = stats.get(event.profileId) ?? { visits7: 0, visits30: 0, views30: 0, carts30: 0, daysSinceVisit: 0, products30: 0, categories30: 0, categoryViews30: new Map(), days7: new Set(), days30: new Set(), products: new Set(), categories: new Set(), last: 0 };
    const day = Math.floor(time / dayMs);
    entry.last = Math.max(entry.last, time);
    if (time >= end - 30 * dayMs) {
      entry.days30.add(day);
      if (time >= end - 7 * dayMs) entry.days7.add(day);
      if (event.kind === "cart") entry.carts30++;
      if (event.productId) { entry.views30++; entry.products.add(event.productId); }
      if (event.category) { entry.categories.add(event.category); entry.categoryViews30.set(event.category, (entry.categoryViews30.get(event.category) ?? 0) + 1); }
    }
    stats.set(event.profileId, entry);
  }
  return new Map([...stats].map(([profileId, entry]) => [profileId, {
    visits7: entry.days7.size,
    visits30: entry.days30.size,
    views30: entry.views30,
    carts30: entry.carts30,
    daysSinceVisit: (end - entry.last) / dayMs,
    products30: entry.products.size,
    categories30: entry.categories.size,
    categoryViews30: entry.categoryViews30,
  }]));
}

const noWeb: WebStats = { visits7: 0, visits30: 0, views30: 0, carts30: 0, daysSinceVisit: PROSPECT_LOOKBACK_DAYS, products30: 0, categories30: 0, categoryViews30: new Map() };

/** The category a profile bought most often before the cutoff. */
export function favoriteCategories(lines: PredictLine[], cutoff: Date) {
  const counts = new Map<string, Map<string, number>>();
  for (const line of lines) {
    if (!line.category || line.date.getTime() >= cutoff.getTime()) continue;
    const perProfile = counts.get(line.profileId) ?? new Map<string, number>();
    perProfile.set(line.category, (perProfile.get(line.category) ?? 0) + 1);
    counts.set(line.profileId, perProfile);
  }
  return new Map([...counts].map(([profileId, perProfile]) => [profileId, [...perProfile].sort((left, right) => right[1] - left[1])[0][0]]));
}

/** Features for everyone who bought before the cutoff, plus the BG/NBD expectation used as baseline. */
export function buyerFeatureRows(data: PredictData, cutoff: Date): { rows: ProfileFeatures[]; baseline: Map<string, number> } {
  const before = data.orders.filter((order) => order.date.getTime() < cutoff.getTime());
  const inputs = clvInputs(before, cutoff);
  let params: BgNbdParams | null = null;
  try {
    params = inputs.length >= 50 ? fitBgNbd(inputs) : null;
  } catch {
    params = null;
  }
  const yearAgo = cutoff.getTime() - 365 * dayMs;
  const perProfile = new Map<string, { last: number; orders: number; revenue: number }>();
  for (const order of before) {
    const entry = perProfile.get(order.profileId) ?? { last: 0, orders: 0, revenue: 0 };
    entry.last = Math.max(entry.last, order.date.getTime());
    if (order.date.getTime() >= yearAgo) { entry.orders++; entry.revenue += Math.max(0, order.amount); }
    perProfile.set(order.profileId, entry);
  }
  const web = webStats(data.events, cutoff);
  const favorites = favoriteCategories(data.lines, cutoff);
  const baseline = new Map<string, number>();
  const rows = inputs.map((input) => {
    const history = perProfile.get(input.profileId)!;
    const stats = web.get(input.profileId) ?? noWeb;
    const favorite = favorites.get(input.profileId);
    const expected = params ? expectedPurchases(params, input, HORIZON_DAYS / 7) : 0;
    baseline.set(input.profileId, expected);
    return {
      profileId: input.profileId,
      values: [
        Math.log1p((cutoff.getTime() - history.last) / dayMs),
        Math.log1p(history.orders),
        Math.log1p(history.revenue),
        Math.log1p(expected),
        params ? probabilityAlive(params, input) : 0.5,
        stats.visits7,
        stats.visits30,
        Math.log1p(stats.views30),
        stats.carts30,
        stats.daysSinceVisit,
        favorite ? stats.categoryViews30.get(favorite) ?? 0 : 0,
      ],
    };
  });
  return { rows, baseline };
}

/** Features for profiles with recent web activity who had not bought anything before the cutoff. */
export function prospectFeatureRows(data: PredictData, cutoff: Date): ProfileFeatures[] {
  const buyers = new Set(data.orders.filter((order) => order.date.getTime() < cutoff.getTime()).map((order) => order.profileId));
  return [...webStats(data.events, cutoff)]
    .filter(([profileId]) => !buyers.has(profileId))
    .map(([profileId, stats]) => ({
      profileId,
      values: [stats.visits7, stats.visits30, Math.log1p(stats.views30), stats.carts30, stats.daysSinceVisit, stats.products30, stats.categories30],
    }));
}

/** Who ordered in the horizon after the cutoff. */
export function purchasedAfter(orders: PredictOrder[], cutoff: Date, days = HORIZON_DAYS) {
  const start = cutoff.getTime();
  const end = start + days * dayMs;
  return new Set(orders.filter((order) => order.date.getTime() >= start && order.date.getTime() < end).map((order) => order.profileId));
}
