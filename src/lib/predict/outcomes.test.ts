import { describe, expect, it, vi } from "vitest";

vi.mock("../prisma", () => ({ getPrismaClient: vi.fn() }));
const { evaluateOutcome, summarizeOutcomes } = await import("./outcomes");
type OutcomeRow = import("./outcomes").OutcomeRow;

const day = 86_400_000;
const predictedAt = new Date("2026-09-01T03:00:00Z");
const at = (days: number) => new Date(predictedAt.getTime() + days * day);
const outcome = { predictedAt, expectedAt: at(20), productId: "koffie", category: "Drinken", baselineProductId: "thee" };
const line = (days: number, productId: string, category = "Drinken") => ({ date: at(days), productId, category });

describe("judging a prediction", () => {
  it("counts an order around the expected date as on time, with the product bought", () => {
    const verdict = evaluateOutcome(outcome, [{ date: at(18) }], [line(18, "koffie")], at(19));
    expect(verdict).toEqual({ status: "op_tijd", orderedAt: at(18), productHit: true, categoryHit: true, baselineHit: false });
  });

  it("waits while the prediction can still come true, then calls other timing or no order", () => {
    // An order on day 5 is too early for "on time"; until both windows close, nothing is decided.
    expect(evaluateOutcome(outcome, [{ date: at(5) }], [line(5, "thee", "Thee")], at(30))).toBeNull();
    const later = evaluateOutcome(outcome, [{ date: at(5) }], [line(5, "thee", "Thee")], at(61));
    expect(later).toMatchObject({ status: "andere_timing", productHit: false, categoryHit: false, baselineHit: true });
    expect(evaluateOutcome(outcome, [], [], at(61))).toEqual({ status: "geen_bestelling", orderedAt: null, productHit: false, categoryHit: false, baselineHit: false });
    // Orders before the prediction never count.
    expect(evaluateOutcome(outcome, [{ date: at(-3) }], [line(-3, "koffie")], at(61))?.status).toBe("geen_bestelling");
  });

  it("leaves product scores empty when only a category was predicted", () => {
    const verdict = evaluateOutcome({ ...outcome, productId: null, baselineProductId: null }, [{ date: at(22) }], [line(22, "melk")], at(23));
    expect(verdict).toMatchObject({ status: "op_tijd", productHit: null, categoryHit: true, baselineHit: null });
  });
});

describe("outcome report", () => {
  const row = (overrides: Partial<OutcomeRow>): OutcomeRow => ({ predictedAt, expectedAt: at(20), productId: "koffie", source: "herhaalaankoop", orderChance: 0.7, status: "op_tijd", orderedAt: at(21), productHit: true, categoryHit: true, baselineHit: false, ...overrides });

  it("compares the prediction with the naive guess and checks the chances", () => {
    const report = summarizeOutcomes([
      row({}),
      row({ productHit: false, baselineHit: true }),
      row({ orderChance: 0.1, status: "geen_bestelling", orderedAt: null, productHit: false, categoryHit: false }),
      row({ orderChance: 0.15, status: "geen_bestelling", orderedAt: null, productHit: false, categoryHit: false, source: "aanbeveling" }),
      row({ status: "open", orderedAt: null, productHit: null, categoryHit: null, baselineHit: null }),
    ]);
    expect(report).toMatchObject({ open: 1, judged: 4, onTime: 2, otherTiming: 0, noOrder: 2, product: { n: 4, hits: 1, baselineHits: 1 }, medianDaysOff: 1 });
    expect(report.calibration).toEqual([{ label: "0–20%", n: 2, averageChance: 0.125, ordered: 0 }, { label: "60–80%", n: 2, averageChance: 0.7, ordered: 2 }]);
    expect(report.sources.map((source) => [source.source, source.n, source.ordered])).toEqual([["herhaalaankoop", 3, 2], ["aanbeveling", 1, 0]]);
  });
});
