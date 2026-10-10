import { HORIZON_DAYS, type PredictLine, type PredictWebEvent } from "./features";

/**
 * Item-to-item recommendations: "customers who bought X also bought Y", weighted towards products a
 * profile recently looked at, with the most popular products as fallback.
 */
export type Recommender = {
  /** For product a: how many buyers of a also bought b. */
  together: Map<string, Map<string, number>>;
  buyers: Map<string, number>;
  popular: string[];
  category: Map<string, string>;
  name: Map<string, string>;
};

const dayMs = 24 * 60 * 60 * 1000;
/** Most recent products per profile that count towards co-purchases; keeps the pair count bounded. */
const MAX_BASKET = 20;
/** Products with fewer buyers say too little about what goes together. */
const MIN_BUYERS = 3;
const MIN_TOGETHER = 2;

export function buildRecommender(lines: PredictLine[], cutoff: Date): Recommender {
  const end = cutoff.getTime();
  const baskets = new Map<string, Map<string, number>>();
  const category = new Map<string, string>();
  const name = new Map<string, string>();
  const recentBuyers = new Map<string, Set<string>>();
  for (const line of lines) {
    if (line.date.getTime() >= end) continue;
    const basket = baskets.get(line.profileId) ?? new Map<string, number>();
    basket.set(line.productId, Math.max(basket.get(line.productId) ?? 0, line.date.getTime()));
    baskets.set(line.profileId, basket);
    if (line.category) category.set(line.productId, line.category);
    if (line.productName) name.set(line.productId, line.productName);
    if (line.date.getTime() >= end - 90 * dayMs) {
      const set = recentBuyers.get(line.productId) ?? new Set<string>();
      set.add(line.profileId);
      recentBuyers.set(line.productId, set);
    }
  }

  const buyers = new Map<string, number>();
  for (const basket of baskets.values()) for (const product of basket.keys()) buyers.set(product, (buyers.get(product) ?? 0) + 1);

  const together = new Map<string, Map<string, number>>();
  for (const basket of baskets.values()) {
    const products = [...basket].sort((left, right) => right[1] - left[1]).slice(0, MAX_BASKET).map(([product]) => product).filter((product) => (buyers.get(product) ?? 0) >= MIN_BUYERS);
    for (const a of products) {
      const row = together.get(a) ?? new Map<string, number>();
      for (const b of products) if (a !== b) row.set(b, (row.get(b) ?? 0) + 1);
      together.set(a, row);
    }
  }

  const popularity = recentBuyers.size ? new Map([...recentBuyers].map(([product, set]) => [product, set.size])) : buyers;
  const popular = [...popularity].sort((left, right) => right[1] - left[1]).slice(0, 50).map(([product]) => product);
  return { together, buyers, popular, category, name };
}

/** Top `k` products a profile has not bought yet, best first. */
export function recommend(model: Recommender, owned: Set<string>, viewed: Map<string, number>, k = 3) {
  const scores = new Map<string, number>();
  const add = (product: string, score: number) => { if (!owned.has(product)) scores.set(product, (scores.get(product) ?? 0) + score); };
  for (const product of owned) {
    const buyers = model.buyers.get(product) ?? 0;
    for (const [other, count] of model.together.get(product) ?? []) if (count >= MIN_TOGETHER && buyers) add(other, count / buyers);
  }
  const maxViews = Math.max(1, ...viewed.values());
  for (const [product, views] of viewed) {
    // Viewed but not bought (browse abandonment) is the strongest single signal, above any co-purchase.
    add(product, 1.2 * (views / maxViews));
    const buyers = model.buyers.get(product) ?? 0;
    for (const [other, count] of model.together.get(product) ?? []) if (count >= MIN_TOGETHER && buyers) add(other, 0.5 * (count / buyers) * (views / maxViews));
  }
  const ranked = [...scores].sort((left, right) => right[1] - left[1]).map(([product]) => product);
  for (const product of model.popular) {
    if (ranked.length >= k) break;
    if (!owned.has(product) && !ranked.includes(product)) ranked.push(product);
  }
  return ranked.slice(0, k);
}

/** Distinct categories of the recommendations, in order. */
export function recommendedCategories(model: Recommender, products: string[]) {
  return [...new Set(products.map((product) => model.category.get(product)).filter((value): value is string => Boolean(value)))];
}

/** Products bought before the cutoff, and products viewed in the 30 days before it, per profile. */
export function profileHistory(lines: PredictLine[], events: PredictWebEvent[], cutoff: Date) {
  const end = cutoff.getTime();
  const owned = new Map<string, Set<string>>();
  for (const line of lines) {
    if (line.date.getTime() >= end) continue;
    const set = owned.get(line.profileId) ?? new Set<string>();
    set.add(line.productId);
    owned.set(line.profileId, set);
  }
  const viewed = new Map<string, Map<string, number>>();
  for (const event of events) {
    const time = event.date.getTime();
    if (!event.productId || time >= end || time < end - 30 * dayMs) continue;
    const map = viewed.get(event.profileId) ?? new Map<string, number>();
    map.set(event.productId, (map.get(event.productId) ?? 0) + (event.kind === "cart" ? 3 : 1));
    viewed.set(event.profileId, map);
  }
  return { owned, viewed };
}

export type RecommendationBacktest = { evaluated: number; hitRate: number | null; baselineHitRate: number | null; categoryHitRate: number | null; categoryBaselineHitRate: number | null };

/**
 * Trains on everything before the cutoff and checks, for everyone who bought in the following
 * horizon, whether one of the three recommendations (or categories) was actually bought,
 * against simply recommending the most popular products.
 */
export function backtestRecommendations(lines: PredictLine[], events: PredictWebEvent[], cutoff: Date): RecommendationBacktest {
  const model = buildRecommender(lines, cutoff);
  const { owned, viewed } = profileHistory(lines, events, cutoff);
  const start = cutoff.getTime();
  const bought = new Map<string, Set<string>>();
  for (const line of lines) {
    const time = line.date.getTime();
    if (time < start || time >= start + HORIZON_DAYS * dayMs) continue;
    const set = bought.get(line.profileId) ?? new Set<string>();
    set.add(line.productId);
    bought.set(line.profileId, set);
  }
  const popularCategories = recommendedCategories(model, model.popular).slice(0, 3);
  let evaluated = 0, hits = 0, baselineHits = 0, categoryEvaluated = 0, categoryHits = 0, categoryBaselineHits = 0;
  for (const [profileId, products] of bought) {
    const has = owned.get(profileId) ?? new Set<string>();
    // Only products that are new to this customer can be recommended.
    const newProducts = [...products].filter((product) => !has.has(product));
    if (!newProducts.length) continue;
    evaluated++;
    const recommended = recommend(model, has, viewed.get(profileId) ?? new Map());
    const baseline = model.popular.filter((product) => !has.has(product)).slice(0, 3);
    if (newProducts.some((product) => recommended.includes(product))) hits++;
    if (newProducts.some((product) => baseline.includes(product))) baselineHits++;
    const boughtCategories = new Set(newProducts.map((product) => model.category.get(product)).filter(Boolean));
    if (boughtCategories.size) {
      categoryEvaluated++;
      const categories = recommendedCategories(model, recommend(model, has, viewed.get(profileId) ?? new Map(), 10)).slice(0, 3);
      if (categories.some((value) => boughtCategories.has(value))) categoryHits++;
      if (popularCategories.some((value) => boughtCategories.has(value))) categoryBaselineHits++;
    }
  }
  return {
    evaluated,
    hitRate: evaluated ? hits / evaluated : null,
    baselineHitRate: evaluated ? baselineHits / evaluated : null,
    categoryHitRate: categoryEvaluated ? categoryHits / categoryEvaluated : null,
    categoryBaselineHitRate: categoryEvaluated ? categoryBaselineHits / categoryEvaluated : null,
  };
}
