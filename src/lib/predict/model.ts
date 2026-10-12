import { buyerFeatureRows, buyerFeatures, favoriteCategories, HORIZON_DAYS, prospectFeatureRows, prospectFeatures, purchasedAfter, type PredictData, type ProfileFeatures } from "./features";
import { auc, liftAt, predictLogistic, trainLogistic } from "./logistic";
import { actualRevenue, dueProducts, forecastCustomers, MAX_FORECAST_DAYS, repurchaseIntervals } from "./forecast";
import { backtestRecommendations, buildRecommender, profileHistory, recommend, recommendedCategories, type RecommendationBacktest } from "./recommend";

const dayMs = 24 * 60 * 60 * 1000;
const MIN_ROWS = 200;
const MIN_POSITIVES = 20;
const MIN_RECOMMENDATION_CASES = 30;

export type Verdict = "sterk" | "matig" | "onvoldoende";
export type IntentBand = "Hoog" | "Midden" | "Laag";

export type PropensityReport =
  | { status: "insufficient"; reason: string; profiles: number; positives: number }
  | {
      status: "ok";
      verdict: Verdict;
      usable: boolean;
      /** Out-of-time test: trained on the situation 60 days ago, tested on 30 days ago. */
      auc: number;
      lift: number;
      /** The same test for the existing BG/NBD expectation alone (buyers only). */
      baselineAuc: number | null;
      testProfiles: number;
      testPositives: number;
      /** Actual purchase rate per band in the test: does "Hoog" really buy more? */
      bands: { band: IntentBand; profiles: number; purchaseRate: number }[];
      /** Feature weights of the final model (standardised), strongest first. */
      drivers: { feature: string; weight: number }[];
    };

export type PredictionReport = {
  ranAt: string;
  data: { orders: number; lines: number; events: number; products: number; linesWithCategory: number; eventsWithProduct: number; firstEvent: string | null; truncated: string[] };
  buyers: PropensityReport;
  prospects: PropensityReport;
  recommendations: RecommendationBacktest & { verdict: Verdict; usable: boolean };
  scored: { buyers: number; prospects: number; bands: { group: "buyers" | "prospects"; band: IntentBand; profiles: number }[]; nextCategories: { category: string; profiles: number }[] };
  /** Absent in reports from before the revenue forecast existed. */
  forecast?: ForecastReport;
};

export type ForecastReport = {
  available: boolean;
  /** Existing customers, from the customer value models. */
  existing: { customers: number; orders30: number; revenue30: number; orders90: number; revenue90: number } | null;
  /** Prospects expected to place a first order, when the prospect model passed its backtest. */
  newCustomers: { orders30: number; revenue30: number } | null;
  /** The forecast made 30 days ago for existing customers, against what they actually spent since. */
  backtest: { predicted: number; actual: number } | null;
  categories: { category: string; orders: number; revenue: number }[];
  products: { productId: string; name: string; category: string | null; orders: number }[];
  /** Profiles with a predicted order in the next 30 and 90 days. */
  profilesWithOrder30: number;
  profilesWithOrder90: number;
  repeatProducts: number;
};

export type PredictedOrder = { productId: string | null; productName: string | null; category: string | null; date: string; source: "herhaalaankoop" | "aanbeveling" | "categorie" };

export type ProfilePredictionResult = {
  profileId: string;
  isBuyer: boolean;
  probability: number | null;
  band: IntentBand | null;
  favoriteCategory: string | null;
  nextCategory: string | null;
  recommendations: string[];
  /** Product names of the recommendations, in the same order (the id when no name is known). */
  recommendationNames: string[];
  recommendationCategories: (string | null)[];
  lastVisitAt: Date | null;
  /** Chance of an order in the next 30 days: the propensity model when it passed, else the customer value model (buyers). */
  orderChance: number | null;
  nextOrderAt: Date | null;
  expectedRevenue30: number | null;
  expectedRevenue90: number | null;
  /** Up to three expected orders: products due for a repeat purchase first, then recommendations, else a category. */
  predictedOrders: PredictedOrder[];
};

export function verdictFor(aucValue: number, lift: number): Verdict {
  if (aucValue >= 0.75 && lift >= 3) return "sterk";
  if (aucValue >= 0.65 && lift >= 2) return "matig";
  return "onvoldoende";
}

/** Top 10% of scores is "Hoog", the next 30% "Midden", the rest "Laag". */
export function bandThresholds(scores: number[]) {
  const sorted = [...scores].sort((left, right) => right - left);
  const at = (share: number) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * share) - 1))] ?? 1;
  return { high: at(0.1), medium: at(0.4) };
}

export function bandFor(score: number, thresholds: { high: number; medium: number }): IntentBand {
  return score >= thresholds.high ? "Hoog" : score >= thresholds.medium ? "Midden" : "Laag";
}

type FeatureBuilder = (data: PredictData, cutoff: Date) => { rows: ProfileFeatures[]; baseline?: Map<string, number> };

/** Train at `trainCutoff`, test at `testCutoff`, then train the final model on the test cutoff. */
function propensity(data: PredictData, build: FeatureBuilder, features: readonly string[], cutoffs: { train: Date; test: Date }): { report: PropensityReport; final: ReturnType<typeof trainLogistic> | null } {
  const labelled = (cutoff: Date) => {
    const { rows, baseline } = build(data, cutoff);
    const bought = purchasedAfter(data.orders, cutoff);
    return { rows, baseline, labels: rows.map((row) => (bought.has(row.profileId) ? 1 : 0)) };
  };
  const train = labelled(cutoffs.train);
  const test = labelled(cutoffs.test);
  const positives = (labels: number[]) => labels.reduce((sum, label) => sum + label, 0);
  for (const [name, set] of [["training", train], ["test", test]] as const) {
    if (set.rows.length < MIN_ROWS) return { report: { status: "insufficient", reason: `Te weinig profielen in de ${name}periode (${set.rows.length}, minimaal ${MIN_ROWS}).`, profiles: set.rows.length, positives: positives(set.labels) }, final: null };
    if (positives(set.labels) < MIN_POSITIVES) return { report: { status: "insufficient", reason: `Te weinig aankopen in de ${name}periode (${positives(set.labels)}, minimaal ${MIN_POSITIVES}).`, profiles: set.rows.length, positives: positives(set.labels) }, final: null };
  }

  const model = trainLogistic(train.rows.map((row) => row.values), train.labels, [...features]);
  const scores = test.rows.map((row) => predictLogistic(model, row.values));
  const aucValue = auc(scores, test.labels) ?? 0.5;
  const lift = liftAt(scores, test.labels) ?? 1;
  const baselineAuc = test.baseline ? auc(test.rows.map((row) => test.baseline!.get(row.profileId) ?? 0), test.labels) : null;
  const thresholds = bandThresholds(scores);
  const bands = (["Hoog", "Midden", "Laag"] as const).map((band) => {
    const members = scores.map((score, index) => ({ band: bandFor(score, thresholds), label: test.labels[index] })).filter((item) => item.band === band);
    return { band, profiles: members.length, purchaseRate: members.length ? members.reduce((sum, item) => sum + item.label, 0) / members.length : 0 };
  });
  const verdict = verdictFor(aucValue, lift);
  // A buyer model that does worse than BG/NBD alone adds nothing; then the existing RFM fields suffice.
  const usable = verdict !== "onvoldoende" && (baselineAuc === null || aucValue >= baselineAuc - 0.005);

  const final = trainLogistic(test.rows.map((row) => row.values), test.labels, [...features]);
  const drivers = final.weights.map((weight, index) => ({ feature: features[index], weight })).sort((left, right) => Math.abs(right.weight) - Math.abs(left.weight));
  return { report: { status: "ok", verdict, usable, auc: aucValue, lift, baselineAuc, testProfiles: test.rows.length, testPositives: positives(test.labels), bands, drivers }, final };
}

/** Everything the nightly run produces for one customer: the backtest report and a prediction per profile. */
export function buildPredictions(data: PredictData, now: Date): { report: PredictionReport; predictions: ProfilePredictionResult[] } {
  const test = new Date(now.getTime() - HORIZON_DAYS * dayMs);
  const train = new Date(now.getTime() - 2 * HORIZON_DAYS * dayMs);

  const buyers = propensity(data, buyerFeatureRows, buyerFeatures, { train, test });
  const prospects = propensity(data, (input, cutoff) => ({ rows: prospectFeatureRows(input, cutoff) }), prospectFeatures, { train, test });
  const recommendationTest = backtestRecommendations(data.lines, data.events, test);
  const recommendationUsable = recommendationTest.evaluated >= MIN_RECOMMENDATION_CASES && recommendationTest.hitRate !== null && recommendationTest.baselineHitRate !== null && recommendationTest.hitRate > recommendationTest.baselineHitRate * 1.1;
  const recommendationVerdict: Verdict = !recommendationUsable ? "onvoldoende" : recommendationTest.hitRate! >= recommendationTest.baselineHitRate! * 1.5 ? "sterk" : "matig";

  // Score today with the final models.
  const scoreGroup = (rows: ProfileFeatures[], model: ReturnType<typeof trainLogistic> | null, usable: boolean) => {
    if (!model || !usable) return { scores: new Map<string, number>(), thresholds: null };
    const scores = new Map(rows.map((row) => [row.profileId, predictLogistic(model, row.values)]));
    return { scores, thresholds: bandThresholds([...scores.values()]) };
  };
  const buyerRows = buyerFeatureRows(data, now).rows;
  const prospectRows = prospectFeatureRows(data, now);
  const buyerScores = scoreGroup(buyerRows, buyers.final, buyers.report.status === "ok" && buyers.report.usable);
  const prospectScores = scoreGroup(prospectRows, prospects.final, prospects.report.status === "ok" && prospects.report.usable);

  const recommender = buildRecommender(data.lines, now);
  const { owned, viewed } = profileHistory(data.lines, data.events, now);
  const favorites = favoriteCategories(data.lines, now);
  const lastVisit = new Map<string, number>();
  for (const event of data.events) if (event.date.getTime() <= now.getTime()) lastVisit.set(event.profileId, Math.max(lastVisit.get(event.profileId) ?? 0, event.date.getTime()));

  // Revenue forecast for existing customers, and how the same forecast 30 days ago turned out.
  const forecast = forecastCustomers(data.orders, now);
  const earlier = forecastCustomers(data.orders, test);
  const backtest = earlier ? { predicted: earlier.totals.revenue30, actual: actualRevenue(data.orders, new Set(earlier.perProfile.keys()), test) } : null;
  const due = dueProducts(data.lines, repurchaseIntervals(data.lines, now), now);
  const newCustomerValue = firstOrderValue(data, now);
  const day = (time: number) => new Date(Math.floor(time / dayMs) * dayMs);

  const predictions = [
    ...buyerRows.map((row) => ({ row, isBuyer: true, group: buyerScores })),
    ...prospectRows.map((row) => ({ row, isBuyer: false, group: prospectScores })),
  ].map(({ row, isBuyer, group }): ProfilePredictionResult => {
    const probability = group.scores.get(row.profileId) ?? null;
    const products = recommendationUsable ? recommend(recommender, owned.get(row.profileId) ?? new Set(), viewed.get(row.profileId) ?? new Map()) : [];
    const customer = isBuyer ? forecast?.perProfile.get(row.profileId) : undefined;
    const orderChance = probability ?? (customer ? 1 - Math.exp(-customer.expected30) : null);
    const visit = lastVisit.get(row.profileId);
    // The expected date follows from the same chance that is shown: an 81% chance within 30 days means about
    // 12 days (median waiting time at that rate). Beyond 90 days it is too uncertain to call an order.
    const waitDays = orderChance !== null && orderChance > 0 ? (Math.LN2 * HORIZON_DAYS) / -Math.log(1 - Math.min(orderChance, 0.999)) : Infinity;
    const nextOrderAt = waitDays <= MAX_FORECAST_DAYS ? day(now.getTime() + Math.max(1, Math.round(waitDays)) * dayMs) : null;
    const nextCategory = recommendationUsable ? recommendedCategories(recommender, products)[0] ?? null : null;
    const predictedOrders: PredictedOrder[] = [];
    for (const item of due.get(row.profileId) ?? []) predictedOrders.push({ productId: item.productId, productName: recommender.name.get(item.productId) ?? item.productId, category: recommender.category.get(item.productId) ?? null, date: day(Math.max(item.due.getTime(), now.getTime() + dayMs)).toISOString(), source: "herhaalaankoop" });
    if (nextOrderAt) {
      for (const product of products) if (!predictedOrders.some((order) => order.productId === product)) predictedOrders.push({ productId: product, productName: recommender.name.get(product) ?? product, category: recommender.category.get(product) ?? null, date: nextOrderAt.toISOString(), source: "aanbeveling" });
      const category = nextCategory ?? favorites.get(row.profileId) ?? null;
      if (!predictedOrders.length && category) predictedOrders.push({ productId: null, productName: null, category, date: nextOrderAt.toISOString(), source: "categorie" });
    }
    return {
      profileId: row.profileId,
      isBuyer,
      probability,
      band: probability !== null && group.thresholds ? bandFor(probability, group.thresholds) : null,
      favoriteCategory: favorites.get(row.profileId) ?? null,
      nextCategory,
      recommendations: products,
      recommendationNames: products.map((product) => recommender.name.get(product) ?? product),
      recommendationCategories: products.map((product) => recommender.category.get(product) ?? null),
      lastVisitAt: visit ? new Date(visit) : null,
      orderChance,
      nextOrderAt,
      expectedRevenue30: customer ? customer.expected30 * customer.orderValue : probability !== null ? probability * newCustomerValue : null,
      expectedRevenue90: customer ? customer.expected90 * customer.orderValue : null,
      predictedOrders: predictedOrders.slice(0, 3),
    };
  });

  // Expected orders and revenue per product group and product in the next 30 days.
  const categories = new Map<string, { orders: number; revenue: number }>();
  const productTotals = new Map<string, { name: string; category: string | null; orders: number }>();
  for (const prediction of predictions) {
    if (!prediction.orderChance) continue;
    const first = prediction.predictedOrders[0];
    const category = first?.category ?? prediction.nextCategory ?? prediction.favoriteCategory;
    const value = prediction.isBuyer ? forecast?.perProfile.get(prediction.profileId)?.orderValue ?? forecast?.orderValue ?? 0 : newCustomerValue;
    if (category) {
      const entry = categories.get(category) ?? { orders: 0, revenue: 0 };
      categories.set(category, { orders: entry.orders + prediction.orderChance, revenue: entry.revenue + prediction.orderChance * value });
    }
    if (first?.productId) {
      const entry = productTotals.get(first.productId) ?? { name: first.productName ?? first.productId, category: first.category, orders: 0 };
      productTotals.set(first.productId, { ...entry, orders: entry.orders + prediction.orderChance });
    }
  }
  const prospectsUsable = prospects.report.status === "ok" && prospects.report.usable;
  const newCustomers = prospectsUsable ? predictions.filter((prediction) => !prediction.isBuyer && prediction.probability !== null).reduce((total, prediction) => ({ orders30: total.orders30 + prediction.probability!, revenue30: total.revenue30 + prediction.probability! * newCustomerValue }), { orders30: 0, revenue30: 0 }) : null;
  // The purchase chances decide how orders spread over product groups and products; the totals come from
  // the revenue forecast, so the groups always add up to the headline figures.
  const totalOrders = (forecast?.totals.orders30 ?? 0) + (newCustomers?.orders30 ?? 0);
  const totalRevenue = (forecast?.totals.revenue30 ?? 0) + (newCustomers?.revenue30 ?? 0);
  const rawOrders = [...categories.values()].reduce((sum, entry) => sum + entry.orders, 0);
  const rawRevenue = [...categories.values()].reduce((sum, entry) => sum + entry.revenue, 0);
  const orderScale = rawOrders ? totalOrders / rawOrders : 0;
  const revenueScale = rawRevenue ? totalRevenue / rawRevenue : 0;
  const forecastReport: ForecastReport = {
    available: forecast !== null,
    existing: forecast ? forecast.totals : null,
    newCustomers,
    backtest,
    categories: [...categories].map(([category, entry]) => ({ category, orders: entry.orders * orderScale, revenue: entry.revenue * revenueScale })).sort((left, right) => right.revenue - left.revenue).slice(0, 10),
    products: [...productTotals].map(([productId, entry]) => ({ productId, ...entry, orders: entry.orders * orderScale })).sort((left, right) => right.orders - left.orders).slice(0, 10),
    profilesWithOrder30: predictions.filter((prediction) => prediction.predictedOrders.some((order) => new Date(order.date).getTime() <= now.getTime() + 30 * dayMs)).length,
    profilesWithOrder90: predictions.filter((prediction) => prediction.predictedOrders.length > 0).length,
    repeatProducts: repurchaseIntervals(data.lines, now).size,
  };

  const count = <T,>(items: T[], key: (item: T) => string | null) => {
    const map = new Map<string, number>();
    for (const item of items) { const value = key(item); if (value) map.set(value, (map.get(value) ?? 0) + 1); }
    return map;
  };
  const bandCounts = (group: "buyers" | "prospects") => {
    const counts = count(predictions.filter((prediction) => prediction.isBuyer === (group === "buyers")), (prediction) => prediction.band);
    return (["Hoog", "Midden", "Laag"] as const).map((band) => ({ group, band, profiles: counts.get(band) ?? 0 }));
  };
  const firstEvent = data.events.reduce<number | null>((first, event) => (first === null || event.date.getTime() < first ? event.date.getTime() : first), null);

  return {
    predictions,
    report: {
      ranAt: now.toISOString(),
      data: {
        orders: data.orders.length,
        lines: data.lines.length,
        events: data.events.length,
        products: new Set(data.lines.map((line) => line.productId)).size,
        linesWithCategory: data.lines.filter((line) => line.category).length,
        eventsWithProduct: data.events.filter((event) => event.productId).length,
        firstEvent: firstEvent === null ? null : new Date(firstEvent).toISOString(),
        truncated: [],
      },
      buyers: buyers.report,
      prospects: prospects.report,
      recommendations: { ...recommendationTest, verdict: recommendationVerdict, usable: recommendationUsable },
      scored: {
        buyers: buyerRows.length,
        prospects: prospectRows.length,
        bands: [...bandCounts("buyers"), ...bandCounts("prospects")],
        nextCategories: [...count(predictions, (prediction) => prediction.nextCategory)].sort((left, right) => right[1] - left[1]).slice(0, 8).map(([category, profiles]) => ({ category, profiles })),
      },
      forecast: forecastReport,
    },
  };
}

/** Write back only when at least one model passed its backtest; otherwise there is nothing reliable to send. */
export function isWriteBackAllowed(report: Pick<PredictionReport, "buyers" | "prospects" | "recommendations">) {
  const passed = (part: PropensityReport) => part.status === "ok" && part.usable;
  return passed(report.buyers) || passed(report.prospects) || report.recommendations.usable;
}

/** What the first order of recently converted customers is worth (median), to value expected new customers. */
function firstOrderValue(data: PredictData, now: Date) {
  const first = new Map<string, { time: number; amount: number }>();
  for (const order of data.orders) {
    const current = first.get(order.profileId);
    if (!current || order.date.getTime() < current.time) first.set(order.profileId, { time: order.date.getTime(), amount: Math.max(0, order.amount) });
  }
  const values = [...first.values()].filter((order) => order.time >= now.getTime() - 120 * dayMs).map((order) => order.amount).sort((left, right) => left - right);
  return values.length ? values[Math.floor(values.length / 2)] : 0;
}
