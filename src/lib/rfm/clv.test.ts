import { describe, expect, it } from "vitest";
import { clvInputs, expectedOrderValue, expectedPurchases, fitBgNbd, fitGammaGamma, hypergeometric2F1, lnGamma, probabilityAlive, type ClvInput } from "./clv";

// Deterministic random numbers so the simulation is reproducible.
function random(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gamma(rand: () => number, shape: number, rate: number): number {
  if (shape < 1) return gamma(rand, shape + 1, rate) * Math.pow(rand(), 1 / shape);
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    const u1 = rand(), u2 = rand();
    const normal = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    const v = Math.pow(1 + c * normal, 3);
    if (v > 0 && Math.log(rand()) < 0.5 * normal * normal + d - d * v + d * Math.log(v)) return (d * v) / rate;
  }
}

/** Simulates the BG/NBD purchase process with the first purchase at week 0. */
function simulate(count: number, params: { r: number; alpha: number; a: number; b: number }, calibrationWeeks: number, holdoutWeeks: number) {
  const rand = random(42);
  return Array.from({ length: count }, (_, index) => {
    const lambda = gamma(rand, params.r, params.alpha);
    const p = (() => { const x = gamma(rand, params.a, 1); return x / (x + gamma(rand, params.b, 1)); })();
    const T = calibrationWeeks * (0.3 + 0.7 * rand());
    const purchases: number[] = [];
    let time = 0;
    for (;;) {
      if (rand() < p) break;
      time += -Math.log(rand()) / lambda;
      if (time > T + holdoutWeeks) break;
      purchases.push(time);
    }
    const calibration = purchases.filter((week) => week <= T);
    return {
      input: { profileId: `c${index}`, x: calibration.length, tx: calibration.at(-1) ?? 0, T, orders: calibration.length + 1, avgValue: 0 } satisfies ClvInput,
      holdout: purchases.filter((week) => week > T && week <= T + holdoutWeeks).length,
    };
  });
}

describe("math helpers", () => {
  it("computes ln Γ and 2F1 accurately", () => {
    expect(lnGamma(5)).toBeCloseTo(Math.log(24), 10);
    expect(lnGamma(0.5)).toBeCloseTo(Math.log(Math.sqrt(Math.PI)), 10);
    // 2F1(1, 1; 2; z) = -ln(1 - z) / z
    expect(hypergeometric2F1(1, 1, 2, 0.5)).toBeCloseTo(-Math.log(0.5) / 0.5, 10);
  });
});

describe("BG/NBD", () => {
  const truth = { r: 0.6, alpha: 8, a: 0.8, b: 3 };
  const customers = simulate(4000, truth, 78, 26);
  const params = fitBgNbd(customers.map((customer) => customer.input));

  it("recovers the parameters of a simulated population", () => {
    expect(params.r / params.alpha).toBeGreaterThan((truth.r / truth.alpha) * 0.75);
    expect(params.r / params.alpha).toBeLessThan((truth.r / truth.alpha) * 1.25);
    expect(params.a / (params.a + params.b)).toBeGreaterThan((truth.a / (truth.a + truth.b)) * 0.6);
    expect(params.a / (params.a + params.b)).toBeLessThan((truth.a / (truth.a + truth.b)) * 1.4);
  });

  it("predicts holdout purchases in aggregate", () => {
    const predicted = customers.reduce((sum, customer) => sum + expectedPurchases(params, customer.input, 26), 0);
    const actual = customers.reduce((sum, customer) => sum + customer.holdout, 0);
    expect(predicted / actual).toBeGreaterThan(0.85);
    expect(predicted / actual).toBeLessThan(1.15);
  });

  it("treats a long silence after frequent buying as a likely drop-out", () => {
    const loyalRecent = probabilityAlive(params, { x: 10, tx: 50, T: 52 });
    const loyalSilent = probabilityAlive(params, { x: 10, tx: 10, T: 52 });
    expect(loyalRecent).toBeGreaterThan(0.8);
    expect(loyalSilent).toBeLessThan(loyalRecent);
    expect(probabilityAlive(params, { x: 0, tx: 0, T: 52 })).toBe(1);
  });
});

describe("Gamma-Gamma", () => {
  it("shrinks a customer's average towards the population mean", () => {
    const rand = random(7);
    const customers: ClvInput[] = Array.from({ length: 3000 }, (_, index) => {
      const orders = 2 + Math.floor(rand() * 6);
      const nu = gamma(rand, 4, 100);
      const values = Array.from({ length: orders }, () => gamma(rand, 5, nu));
      return { profileId: `g${index}`, x: orders - 1, tx: 10, T: 20, orders, avgValue: values.reduce((sum, value) => sum + value, 0) / orders };
    });
    const params = fitGammaGamma(customers)!;
    expect(params).not.toBeNull();
    const populationMean = (params.p * params.v) / (params.q - 1);
    const observedMean = customers.reduce((sum, customer) => sum + customer.avgValue, 0) / customers.length;
    expect(populationMean / observedMean).toBeGreaterThan(0.85);
    expect(populationMean / observedMean).toBeLessThan(1.15);
    const high = expectedOrderValue(params, { orders: 2, avgValue: observedMean * 3 });
    expect(high).toBeLessThan(observedMean * 3);
    expect(high).toBeGreaterThan(observedMean);
  });
});

describe("clvInputs", () => {
  it("counts repeat purchase days and weeks", () => {
    const now = new Date("2026-10-08T00:00:00Z");
    const inputs = clvInputs([
      { profileId: "a", date: new Date("2026-01-01T10:00:00Z"), amount: 20 },
      { profileId: "a", date: new Date("2026-01-01T15:00:00Z"), amount: 30 },
      { profileId: "a", date: new Date("2026-03-01T10:00:00Z"), amount: 40 },
    ], now);
    expect(inputs[0].x).toBe(1);
    expect(inputs[0].orders).toBe(3);
    expect(inputs[0].avgValue).toBe(30);
    expect(inputs[0].tx).toBeCloseTo(59 / 7, 5);
  });
});

describe("buildCohorts", () => {
  it("follows customers from their first purchase month", async () => {
    const { buildCohorts } = await import("./cohort");
    const now = new Date("2026-10-08T00:00:00Z");
    const order = (profileId: string, date: string, amount: number) => ({ profileId, date: new Date(`${date}T12:00:00Z`), amount });
    const cohorts = buildCohorts([
      order("a", "2026-06-03", 50), order("a", "2026-07-10", 30), order("a", "2026-09-01", 20),
      order("b", "2026-06-20", 100),
      order("c", "2026-09-15", 40), order("c", "2026-10-02", 10),
      order("old", "2023-01-01", 10), order("old", "2026-06-05", 10),
    ], now);

    expect(cohorts.map((cohort) => cohort.month)).toEqual(["2026-09", "2026-06"]);
    const june = cohorts[1];
    expect(june.customers).toBe(2);
    expect(june.retention.slice(0, 5)).toEqual([0.5, 0, 0.5, null, null]);
    expect(june.revenuePerCustomer).toEqual([75, 90, null, null, null]);
    expect(cohorts[0].retention[0]).toBeNull();
  });
});
