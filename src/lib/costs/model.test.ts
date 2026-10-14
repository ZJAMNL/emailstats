import { describe, expect, it } from "vitest";
import { advisedPrice, buildCostRows, costBreakdown, defaultCostSettings, portfolio, readCostSettings, type TenantUsage } from "./model";

const now = new Date("2026-10-14T12:00:00Z");
const usage = (overrides: Partial<TenantUsage> = {}): TenantUsage => ({
  id: "t", name: "Tuinwinkel", active: true, owner: null,
  modules: { databaseStats: true, campaignStats: true, insight: true, forecast: true },
  profiles: 26_000, storageBytes: 20e6, jobHoursPerMonth: 4, measuredDays: 30, jobFailures: 0, emailsPerMonth: 60,
  lastSyncAt: new Date("2026-10-14T03:00:00Z"), lastLoginAt: new Date("2026-10-10T09:00:00Z"),
  rfmReady: true, predictionsReady: true, modelPassed: true, hasOrderData: true,
  ...overrides,
});

describe("cost per customer", () => {
  it("splits usage, a share of the fixed costs and support time", () => {
    const cost = costBreakdown(usage(), defaultCostSettings, 14.6);
    expect(cost.storage).toBeCloseTo(0.0066, 4);
    expect(cost.compute).toBe(1);
    expect(cost.email).toBeCloseTo(0.051, 3);
    expect(cost.fixed).toBe(14.6);
    expect(cost.support).toBe(75);
    expect(cost.total).toBeCloseTo(cost.usage + 14.6 + 75, 6);
  });
});

describe("advised price", () => {
  it("follows the modules, adds a volume surcharge and keeps the 'pay when it works' promise", () => {
    expect(advisedPrice(usage(), defaultCostSettings)).toMatchObject({ package: "voorspellen", total: 349, partner: 209 });
    expect(advisedPrice(usage({ profiles: 250_000 }), defaultCostSettings)).toMatchObject({ volume: 200, total: 549 });
    expect(advisedPrice(usage({ modelPassed: false }), defaultCostSettings)).toMatchObject({ package: "inzicht", total: 149 });
    expect(advisedPrice(usage({ modules: { databaseStats: true, campaignStats: false, insight: false, forecast: false }, profiles: 900_000 }), defaultCostSettings)).toMatchObject({ package: "basis", total: 49 });
    expect(advisedPrice(usage({ active: false }), defaultCostSettings).total).toBe(0);
    // Switched on but no results yet: bill what the customer actually gets.
    expect(advisedPrice(usage({ predictionsReady: false }), defaultCostSettings)).toMatchObject({ package: "inzicht", total: 149 });
    expect(advisedPrice(usage({ predictionsReady: false, rfmReady: false }), defaultCostSettings)).toMatchObject({ package: "basis", total: 49 });
    expect(costBreakdown(usage({ active: false }), defaultCostSettings, 14.6)).toMatchObject({ fixed: 0, support: 0 });
  });
});

describe("signals and portfolio", () => {
  it("flags unfinished onboarding, loss and upsell, and sums the portfolio", () => {
    const rows = buildCostRows([
      usage({ id: "a", name: "Klaar" }),
      usage({ id: "b", name: "Half", rfmReady: false, predictionsReady: false, hasOrderData: false, lastLoginAt: null }),
      usage({ id: "c", name: "Basis met orders", modules: { databaseStats: true, campaignStats: false, insight: false, forecast: false } }),
    ], { ...defaultCostSettings, supportRate: 200 }, 3, now);
    const basis = rows.find((row) => row.usage.id === "c")!;
    expect(basis.signals.map((signal) => signal.tone)).toEqual(["critical", "opportunity"]);
    const half = rows.find((row) => row.usage.id === "b")!;
    expect(half.signals.some((signal) => signal.text.startsWith("Inzicht staat aan"))).toBe(true);
    expect(half.signals.some((signal) => signal.text.startsWith("Nog nooit ingelogd"))).toBe(true);
    const totals = portfolio(rows, defaultCostSettings);
    expect(totals.revenue).toBe(349 + 49 + 49);
    expect(totals.perPackage).toEqual({ basis: 2, inzicht: 0, voorspellen: 1 });
    expect(totals.upsell).toBe(300);
    expect(totals.unrealized).toBe(1);
    expect(totals.lossMaking).toBe(2);
  });

  it("reads saved assumptions over the defaults and ignores nonsense", () => {
    const settings = readCostSettings({ supportRate: 90, prices: { basis: 59 }, computePerHour: -3, partnerDiscount: 2 });
    expect(settings.supportRate).toBe(90);
    expect(settings.prices).toEqual({ basis: 59, inzicht: 149, voorspellen: 349 });
    expect(settings.computePerHour).toBe(defaultCostSettings.computePerHour);
    expect(settings.partnerDiscount).toBe(0.9);
  });
});
