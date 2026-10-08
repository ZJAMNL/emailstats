import { describe, expect, it } from "vitest";
import { frequencyScore, quintileScores, scoreRfm, type RfmOrder } from "./score";
import { fmScore, rfmSegments, segmentFor } from "./segments";
import { summarizeRfm } from "./value";

const now = new Date("2026-10-08T00:00:00Z");
const daysAgo = (days: number) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
const options = { now, windowMonths: 24, frequencyThresholds: [1, 2, 3, 4, 5], excludedStatuses: ["geannuleerd"] };

describe("quintileScores", () => {
  it("spreads distinct values over scores 1–5", () => {
    expect(quintileScores([10, 20, 30, 40, 50, 60, 70, 80, 90, 100])).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 5, 5]);
  });

  it("gives equal values the same score", () => {
    const scores = quintileScores([5, 5, 5, 5, 5, 5, 5, 5, 100, 200]);
    expect(new Set(scores.slice(0, 8)).size).toBe(1);
    expect(scores[0]).toBe(1);
    expect(scores[9]).toBe(5);
  });
});

describe("frequencyScore", () => {
  it("uses fixed thresholds", () => {
    expect([1, 2, 3, 4, 5, 12].map((count) => frequencyScore(count, [1, 2, 3, 4, 5]))).toEqual([1, 2, 3, 4, 5, 5]);
    expect([1, 2, 3, 6, 10].map((count) => frequencyScore(count, [1, 2, 3, 6, 10]))).toEqual([1, 2, 3, 4, 5]);
  });
});

describe("segmentFor", () => {
  it("maps every cell of the R × FM grid to a known segment", () => {
    const keys = new Set(rfmSegments.map((segment) => segment.key));
    for (let r = 1; r <= 5; r++) for (let fm = 1; fm <= 5; fm++) expect(keys.has(segmentFor(r, fm))).toBe(true);
  });

  it("places typical customers in the expected segments", () => {
    expect(segmentFor(5, 5)).toBe("champions");
    expect(segmentFor(5, 1)).toBe("new_customers");
    expect(segmentFor(2, 4)).toBe("at_risk");
    expect(segmentFor(1, 5)).toBe("cant_lose");
    expect(segmentFor(1, 1)).toBe("lost");
    expect(fmScore(4, 5)).toBe(5);
  });
});

describe("scoreRfm", () => {
  it("aggregates orders per profile and skips unusable orders", () => {
    const orders: RfmOrder[] = [
      { profileId: "a", date: daysAgo(3), amount: 50 },
      { profileId: "a", date: daysAgo(40), amount: 30 },
      { profileId: "a", date: daysAgo(10), amount: 20, status: "Geannuleerd" },
      { profileId: "b", date: daysAgo(800), amount: 99 },
      { profileId: "c", date: daysAgo(-30), amount: 10 },
      { profileId: "d", date: null, amount: 10 },
      { profileId: "e", date: daysAgo(100), amount: null },
      { profileId: "a", date: daysAgo(5), amount: -15 },
    ];
    const { customers, quality } = scoreRfm(orders, options);
    const a = customers.find((customer) => customer.profileId === "a")!;

    expect(a.orderCount).toBe(2);
    expect(a.revenue).toBe(65);
    expect(a.recencyDays).toBe(3);
    expect(customers.map((customer) => customer.profileId).sort()).toEqual(["a", "e"]);
    expect(quality).toMatchObject({ totalOrders: 8, excludedStatus: 1, outsideWindow: 1, futureDate: 1, missingDate: 1, missingAmount: 1, negativeAmount: 1 });
  });
});

describe("summarizeRfm", () => {
  it("adds up segment totals and values the database", () => {
    const orders: RfmOrder[] = [];
    for (let index = 0; index < 50; index++) {
      const count = (index % 5) + 1;
      for (let order = 0; order < count; order++) orders.push({ profileId: `p${index}`, date: daysAgo(index * 12 + order), amount: 40 + index });
    }
    const { customers } = scoreRfm(orders, options);
    const summary = summarizeRfm(customers, { prospects: 200, windowMonths: 24, marginPercent: 40 });

    expect(summary.customers).toBe(50);
    expect(summary.segments.reduce((total, segment) => total + segment.customers, 0)).toBe(50);
    expect(summary.revenue).toBeCloseTo(customers.reduce((total, customer) => total + customer.revenue, 0), 2);
    expect(summary.lifespanYears).toBeGreaterThanOrEqual(1);
    expect(summary.lifespanYears).toBeLessThanOrEqual(5);
    expect(summary.databaseValue).toBeCloseTo(summary.activeValue + summary.prospectValue, 2);
    expect(summary.topCustomerRevenueShare).toBeGreaterThan(0.2);
  });
});

describe("Copernica value parsing", () => {
  it("parses dates and amounts in common formats", async () => {
    const { parseAmount, parseCopernicaDate } = await import("./parse");
    expect(parseCopernicaDate("2026-03-14 10:30:00")?.toISOString()).toBe("2026-03-14T10:30:00.000Z");
    expect(parseCopernicaDate("2026-03-14")?.toISOString()).toBe("2026-03-14T00:00:00.000Z");
    expect(parseCopernicaDate("0000-00-00 00:00:00")).toBeNull();
    expect(parseCopernicaDate("")).toBeNull();
    expect([parseAmount("12.50"), parseAmount("12,50"), parseAmount("1.234,56"), parseAmount("1,234.56"), parseAmount("€ 99"), parseAmount("-5,00"), parseAmount(""), parseAmount(7)]).toEqual([12.5, 12.5, 1234.56, 1234.56, 99, -5, null, 7]);
  });
});
