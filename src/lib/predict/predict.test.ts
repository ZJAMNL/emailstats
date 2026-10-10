import { describe, expect, it } from "vitest";
import { buyerFeatureRows, prospectFeatureRows, purchasedAfter, webStats, type PredictData, type PredictLine, type PredictOrder, type PredictWebEvent } from "./features";
import { auc, liftAt, predictLogistic, trainLogistic } from "./logistic";
import { bandFor, bandThresholds, buildPredictions, verdictFor } from "./model";
import { buildRecommender, recommend } from "./recommend";
import { assemblePredictData } from "./data";

const day = 86_400_000;
const now = new Date("2026-10-10T03:00:00Z");
const ago = (days: number) => new Date(now.getTime() - days * day);

/** Deterministic random numbers, so the tests do not flake. */
function random(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("logistic regression and metrics", () => {
  it("computes AUC and lift like by hand", () => {
    // Pairs (positive, negative): 0.35>0.1, 0.35<0.4, 0.8>0.1, 0.8>0.4 → 3 of 4.
    expect(auc([0.1, 0.4, 0.35, 0.8], [0, 0, 1, 1])).toBe(0.75);
    expect(auc([0.5, 0.5], [0, 1])).toBe(0.5);
    expect(auc([0.1, 0.2], [1, 1])).toBeNull();
    // Top 10% of 10 = 1 item, a positive; base rate 2/10 → lift 5.
    expect(liftAt([0.9, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.05, 0.8], [1, 0, 0, 0, 0, 0, 0, 0, 1, 0])).toBe(5);
  });

  it("finds a real signal and does not invent one", () => {
    const rand = random(1);
    const rows = Array.from({ length: 2000 }, () => [rand() * 4, rand()]);
    const withSignal = rows.map(([signal]) => (rand() < 1 / (1 + Math.exp(-(signal * 2 - 4))) ? 1 : 0));
    const noise = rows.map(() => (rand() < 0.2 ? 1 : 0));
    const model = trainLogistic(rows.slice(0, 1000), withSignal.slice(0, 1000), ["signal", "noise"]);
    expect(auc(rows.slice(1000).map((row) => predictLogistic(model, row)), withSignal.slice(1000))!).toBeGreaterThan(0.8);
    const blind = trainLogistic(rows.slice(0, 1000), noise.slice(0, 1000), ["signal", "noise"]);
    expect(Math.abs(auc(rows.slice(1000).map((row) => predictLogistic(blind, row)), noise.slice(1000))! - 0.5)).toBeLessThan(0.07);
  });

  it("grades models and bands scores", () => {
    expect(verdictFor(0.8, 3.5)).toBe("sterk");
    expect(verdictFor(0.7, 2.2)).toBe("matig");
    expect(verdictFor(0.7, 1.5)).toBe("onvoldoende");
    const scores = Array.from({ length: 100 }, (_, index) => index / 100);
    const thresholds = bandThresholds(scores);
    expect(scores.filter((score) => bandFor(score, thresholds) === "Hoog")).toHaveLength(10);
    expect(scores.filter((score) => bandFor(score, thresholds) === "Midden")).toHaveLength(30);
  });
});

describe("features", () => {
  it("never uses data from after the cutoff", () => {
    const events: PredictWebEvent[] = [
      { profileId: "p", date: ago(40), productId: "a", category: "x", kind: "view" },
      { profileId: "p", date: ago(20), productId: "b", category: "x", kind: "cart" },
    ];
    const stats = webStats(events, ago(35)).get("p")!;
    expect(stats.views30).toBe(1);
    expect(stats.carts30).toBe(0);
    const orders: PredictOrder[] = [{ profileId: "p", date: ago(10), amount: 50 }];
    expect(prospectFeatureRows({ orders, lines: [], events }, ago(35)).map((row) => row.profileId)).toEqual(["p"]);
    expect(prospectFeatureRows({ orders, lines: [], events }, ago(5))).toHaveLength(0);
    expect(buyerFeatureRows({ orders, lines: [], events }, ago(35)).rows).toHaveLength(0);
    // The label window is the 30 days after the cutoff: day -10 falls in [-35, -5) but not in [-45, -15).
    expect(purchasedAfter(orders, ago(45)).has("p")).toBe(false);
    expect(purchasedAfter(orders, ago(35)).has("p")).toBe(true);
  });
});

describe("recommendations", () => {
  it("recommends what others bought together, skipping what is owned", () => {
    const lines: PredictLine[] = [];
    for (let index = 0; index < 5; index++) {
      for (const productId of ["tent", "slaapzak"]) lines.push({ profileId: `c${index}`, date: ago(50), productId, productName: productId, category: "kamperen" });
    }
    for (let index = 0; index < 3; index++) lines.push({ profileId: `d${index}`, date: ago(50), productId: "hark", productName: "hark", category: "tuin" });
    const model = buildRecommender(lines, now);
    expect(recommend(model, new Set(["tent"]), new Map(), 1)).toEqual(["slaapzak"]);
    expect(recommend(model, new Set(["tent"]), new Map(), 3)).not.toContain("tent");
    // A product someone keeps looking at comes first.
    expect(recommend(model, new Set(["tent"]), new Map([["hark", 5]]), 1)).toEqual(["hark"]);
  });
});

/**
 * A synthetic webshop with known structure: people who visit more often buy more, and products come
 * in pairs that are bought together. The pipeline should find both and judge itself usable.
 */
function syntheticShop(seed: number, withSignal: boolean): PredictData {
  const rand = random(seed);
  const orders: PredictOrder[] = [];
  const lines: PredictLine[] = [];
  const events: PredictWebEvent[] = [];
  const pairs = Array.from({ length: 15 }, (_, index) => [`p${index}a`, `p${index}b`, `cat${index % 5}`]);
  for (let profile = 0; profile < 1500; profile++) {
    const id = `u${profile}`;
    const engagement = rand();
    const isBuyer = profile < 900;
    const pair = pairs[Math.floor(rand() * pairs.length)];
    // Earlier purchases establish buyers and co-purchase patterns.
    if (isBuyer) {
      const date = ago(100 + rand() * 300);
      orders.push({ profileId: id, date, amount: 40 + rand() * 60 });
      lines.push({ profileId: id, date, productId: pair[0], productName: pair[0], category: pair[2] });
      if (rand() < 0.7) lines.push({ profileId: id, date, productId: pair[1], productName: pair[1], category: pair[2] });
    }
    for (let d = 1; d <= 110; d++) {
      if (rand() < engagement * 0.12) events.push({ profileId: id, date: ago(d), productId: rand() < 0.5 ? pair[1] : null, category: pair[2], kind: rand() < 0.1 ? "cart" : "view" });
      // Daily purchase chance depends on recent engagement only when the world has a signal.
      const chance = withSignal ? engagement ** 3 * 0.02 : 0.004;
      if (d <= 90 && (isBuyer || rand() < 0.5) && rand() < chance) {
        const date = ago(d - 0.5);
        orders.push({ profileId: id, date, amount: 40 + rand() * 60 });
        const owned = lines.some((line) => line.profileId === id && line.productId === pair[0]);
        lines.push({ profileId: id, date, productId: owned ? pair[1] : pair[0], productName: pair[0], category: pair[2] });
      }
    }
  }
  return { orders, lines, events };
}

describe("buildPredictions", () => {
  it("finds predictive value where there is some, and scores every profile", () => {
    const { report, predictions } = buildPredictions(syntheticShop(7, true), now);
    expect(report.buyers.status).toBe("ok");
    expect(report.prospects.status).toBe("ok");
    if (report.buyers.status === "ok") {
      expect(report.buyers.auc).toBeGreaterThan(0.7);
      expect(report.buyers.usable).toBe(true);
      // The Hoog band really bought more than the Laag band in the test period.
      expect(report.buyers.bands[0].purchaseRate).toBeGreaterThan(report.buyers.bands[2].purchaseRate);
    }
    expect(report.recommendations.usable).toBe(true);
    expect(report.recommendations.hitRate!).toBeGreaterThan(report.recommendations.baselineHitRate!);
    expect(predictions.filter((prediction) => prediction.isBuyer && prediction.band === "Hoog").length).toBeGreaterThan(0);
    expect(predictions.every((prediction) => prediction.recommendations.length <= 3)).toBe(true);
  });

  it("rejects a world without signal instead of writing noise", () => {
    const { report, predictions } = buildPredictions(syntheticShop(11, false), now);
    const usable = (part: typeof report.buyers) => part.status === "ok" && part.usable;
    expect(usable(report.prospects)).toBe(false);
    expect(predictions.filter((prediction) => !prediction.isBuyer).every((prediction) => prediction.probability === null)).toBe(true);
  });

  it("reports too little data instead of training on it", () => {
    const { report } = buildPredictions({ orders: [{ profileId: "a", date: ago(10), amount: 10 }], lines: [], events: [] }, now);
    expect(report.buyers.status).toBe("insufficient");
    expect(report.prospects.status).toBe("insufficient");
    expect(report.recommendations.usable).toBe(false);
  });
});

describe("assemblePredictData", () => {
  const mapping = { lineOrderField: "order", lineProductField: "sku", lineNameField: "naam", lineCategoryField: "cat", webDateField: "tijd", webProductField: "sku", webCategoryField: null, webEventField: "event" };

  it("links lines to their order and skips cancelled orders and unknown lines", () => {
    const orders = [
      { key: "o1", profileId: "p1", date: ago(20), amount: 50, status: "betaald" },
      { key: "o2", profileId: "p1", date: ago(10), amount: 20, status: "geannuleerd" },
    ];
    const lines = [
      { id: "l1", profile: "", fields: { order: "o1", sku: "A", naam: "Tent", cat: "Kamperen" } },
      { id: "l2", profile: "p1", fields: { order: "o2", sku: "B" } },
      { id: "l3", profile: "p1", fields: { order: "onbekend", sku: "C" } },
      { id: "l4", profile: "p1", fields: { order: "o1", sku: "" } },
    ];
    const { data, quality } = assemblePredictData(orders, lines, [], mapping, { now, excludedStatuses: ["Geannuleerd"] });
    expect(data.orders).toHaveLength(1);
    expect(data.lines).toEqual([{ profileId: "p1", date: ago(20), productId: "A", productName: "Tent", category: "Kamperen" }]);
    expect(quality).toMatchObject({ linesWithoutOrder: 2, linesWithoutProduct: 1 });
  });

  it("recognises cart events and drops events outside the window", () => {
    const events = [
      { id: "e1", profile: "p1", fields: { tijd: "2026-10-01 12:00:00", sku: "A", event: "add_to_cart" } },
      { id: "e2", profile: "p1", fields: { tijd: "2026-10-02", sku: "A", event: "pageview" } },
      { id: "e3", profile: "p1", fields: { tijd: "2025-01-01", sku: "A", event: "pageview" } },
      { id: "e4", profile: "p1", fields: { tijd: "", sku: "A" } },
    ];
    const { data, quality } = assemblePredictData([], [], events, mapping, { now, excludedStatuses: [] });
    expect(data.events.map((event) => event.kind)).toEqual(["cart", "view"]);
    expect(quality.eventsWithoutDate).toBe(1);
  });
});
