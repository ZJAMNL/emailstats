import { describe, expect, it } from "vitest";
import { buildAudiences, intentTable, type AdviceGroup } from "./advice";
import { actualRevenue, dueProducts, forecastCustomers, repurchaseIntervals } from "./forecast";
import type { PredictLine, PredictOrder } from "./features";
import { forecastRecords, planRecordWrites, profilesInScope, recordKey, type ForecastMapping, type ForecastProfile } from "./orders-plan";

const day = 86_400_000;
const now = new Date("2026-10-12T03:00:00Z");
const ago = (days: number) => new Date(now.getTime() - days * day);

describe("revenue forecast", () => {
  // 120 customers: one third buys every 30 days, the rest twice in two years.
  const orders: PredictOrder[] = [];
  for (let customer = 0; customer < 120; customer++) {
    const frequent = customer % 3 === 0;
    const count = frequent ? 12 : 2;
    for (let order = 0; order < count; order++) orders.push({ profileId: `c${customer}`, date: ago(5 + order * (frequent ? 30 : 300) + (customer % 7)), amount: frequent ? 50 : 80 });
  }
  const forecast = forecastCustomers(orders, now)!;

  it("expects more orders from customers who buy often", () => {
    const frequent = forecast.perProfile.get("c0")!;
    const rare = forecast.perProfile.get("c1")!;
    expect(frequent.expected30).toBeGreaterThan(rare.expected30 * 3);
    expect(forecast.totals.revenue90).toBeGreaterThan(forecast.totals.revenue30);
    expect(forecast.totals.customers).toBe(120);
  });

  it("checks a forecast against what customers actually spent", () => {
    expect(actualRevenue(orders, new Set(["c0"]), ago(40))).toBe(50);
    expect(forecastCustomers(orders.slice(0, 10), now)).toBeNull();
  });
});

describe("repeat purchases", () => {
  const lines: PredictLine[] = [];
  for (let customer = 0; customer < 6; customer++) for (const daysAgo of [100, 70, 40]) lines.push({ profileId: `c${customer}`, date: ago(daysAgo), productId: "koffie", productName: "Koffie", category: "Koffie" });
  lines.push({ profileId: "c9", date: ago(200), productId: "machine", productName: "Machine", category: "Apparaten" });

  it("finds the rhythm of products bought again, and when they are due", () => {
    const intervals = repurchaseIntervals(lines, now);
    expect(intervals.get("koffie")).toBe(30);
    expect(intervals.has("machine")).toBe(false);
    const due = dueProducts(lines, intervals, now).get("c0")!;
    expect(due[0].productId).toBe("koffie");
    // Last bought 40 days ago, every 30 days: due 10 days ago, still within the two-week window.
    expect(Math.round((now.getTime() - due[0].due.getTime()) / day)).toBe(10);
  });
});

describe("expected orders to Copernica", () => {
  const mapping: ForecastMapping = { collectionId: "77", dateField: "Datum", skuField: "SKU", nameField: "Productnaam", categoryField: null, chanceField: "Kans" };
  const order = (productId: string | null, date = "2026-10-20T00:00:00.000Z") => ({ productId, productName: productId ? `Product ${productId}` : null, category: "Koken", date, source: "aanbeveling" as const });
  const profiles: ForecastProfile[] = Array.from({ length: 10 }, (_, index) => ({ profileId: `p${index}`, orderChance: (index + 1) / 10, predictedOrders: [order("a"), order("b"), order("c")] }));

  it("takes the most likely profiles and the chosen number of records each", () => {
    expect(profilesInScope(profiles, "top10").map((profile) => profile.profileId)).toEqual(["p9"]);
    expect(profilesInScope(profiles, "top40")).toHaveLength(4);
    expect(profilesInScope([...profiles, { profileId: "x", orderChance: 0.9, predictedOrders: [] }], "all")).toHaveLength(10);
    const records = forecastRecords(profilesInScope(profiles, "top10"), mapping, 2);
    expect(records.map((record) => record.key)).toEqual(["bestelling_1", "bestelling_2"]);
    expect(records[0].fields).toEqual({ Datum: "2026-10-20", SKU: "a", Productnaam: "Product a", Kans: 100 });
  });

  it("writes a category-only expectation with an empty SKU", () => {
    expect(forecastRecords([{ profileId: "p", orderChance: 0.5, predictedOrders: [order(null)] }], mapping, 1)[0].fields.SKU).toBe("");
  });

  it("updates, moves to another collection, and ignores small changes in chance", () => {
    const [record] = forecastRecords([profiles[9]], mapping, 1);
    const [nearly] = forecastRecords([{ ...profiles[9], orderChance: 0.99 }], mapping, 1);
    expect(nearly.hash).toBe(record.hash);
    const [moved] = forecastRecords([profiles[9]], { ...mapping, collectionId: "88" }, 1);
    const [changed] = forecastRecords([{ ...profiles[9], predictedOrders: [order("z")] }], mapping, 1);
    const key = recordKey("p9", "bestelling_1");
    expect(planRecordWrites(new Map([[key, moved.hash]]), new Map([[key, record.hash]]))[0].action).toBe("move");
    expect(planRecordWrites(new Map([[key, changed.hash]]), new Map([[key, record.hash]]))[0].action).toBe("update");
    expect(planRecordWrites(new Map(), new Map([[recordKey("p9", "segment"), "oud"]]))).toEqual([{ profileId: "p9", key: "segment", action: "delete" }]);
  });
});

describe("advice", () => {
  const groups: AdviceGroup[] = [
    { segment: "champions", isBuyer: true, intentBand: "Hoog", profiles: 10, chance: 5 },
    { segment: "at_risk", isBuyer: true, intentBand: "Midden", profiles: 20, chance: 4 },
    { segment: null, isBuyer: false, intentBand: "Hoog", profiles: 8, chance: 3 },
  ];
  const target = { rfmProfileFields: true, collection: "Verwachte_bestellingen", dateField: "Datum" };

  it("only offers target groups whose model passed, with the Copernica rule", () => {
    const all = buildAudiences(groups, { rfm: true, buyers: true, prospects: true }, target, 12);
    expect(all.map((audience) => audience.key)).toEqual(["repeat_due", "buyers_high", "prospects_high", "at_risk", "champions", "sleeping_interest"]);
    expect(all.find((audience) => audience.key === "at_risk")!.condition).toBe("Profielveld RFM_Segment = Risico of Niet verliezen");
    expect(all.find((audience) => audience.key === "buyers_high")!.condition).toContain("Verwachte_bestellingen met Datum");
    expect(buildAudiences(groups, { rfm: true, buyers: true, prospects: false }, target, 0).map((audience) => audience.key)).not.toContain("prospects_high");
    expect(buildAudiences(groups, { rfm: true, buyers: true, prospects: false }, target, 0).map((audience) => audience.key)).not.toContain("repeat_due");
    expect(intentTable(groups, { rfm: true, buyers: true, prospects: false }).map((row) => row.type)).toEqual(["Kopers"]);
  });
});
