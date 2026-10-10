import { buyerFeatureRows, buyerFeatures, favoriteCategories, HORIZON_DAYS, prospectFeatureRows, prospectFeatures, purchasedAfter, type PredictData, type ProfileFeatures } from "./features";
import { auc, liftAt, predictLogistic, trainLogistic } from "./logistic";
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
};

export type ProfilePredictionResult = {
  profileId: string;
  isBuyer: boolean;
  probability: number | null;
  band: IntentBand | null;
  favoriteCategory: string | null;
  nextCategory: string | null;
  recommendations: string[];
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

  const predictions = [
    ...buyerRows.map((row) => ({ row, isBuyer: true, group: buyerScores })),
    ...prospectRows.map((row) => ({ row, isBuyer: false, group: prospectScores })),
  ].map(({ row, isBuyer, group }): ProfilePredictionResult => {
    const probability = group.scores.get(row.profileId) ?? null;
    const products = recommendationUsable ? recommend(recommender, owned.get(row.profileId) ?? new Set(), viewed.get(row.profileId) ?? new Map()) : [];
    return {
      profileId: row.profileId,
      isBuyer,
      probability,
      band: probability !== null && group.thresholds ? bandFor(probability, group.thresholds) : null,
      favoriteCategory: favorites.get(row.profileId) ?? null,
      nextCategory: recommendationUsable ? recommendedCategories(recommender, products)[0] ?? null : null,
      recommendations: products,
    };
  });

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
    },
  };
}

/** Write back only when at least one model passed its backtest; otherwise there is nothing reliable to send. */
export function isWriteBackAllowed(report: Pick<PredictionReport, "buyers" | "prospects" | "recommendations">) {
  const passed = (part: PropensityReport) => part.status === "ok" && part.usable;
  return passed(report.buyers) || passed(report.prospects) || report.recommendations.usable;
}
