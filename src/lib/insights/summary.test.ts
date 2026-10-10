import { describe, expect, it } from "vitest";
import { buildAudiences, summarizeInsights, type InsightGroup } from "./summary";

const group = (segment: string | null, isBuyer: boolean | null, intentBand: string | null, profiles: number, clv = 0, expected = 0): InsightGroup => ({ segment, isBuyer, intentBand, profiles, clv, expectedPurchases: expected });
const groups = [
  group("champions", true, "Hoog", 10, 5000, 6),
  group("champions", true, "Laag", 30, 9000, 1.5),
  group("at_risk", true, "Midden", 20, 2000, 2),
  group("cant_lose", true, "Laag", 5, 1500, 0.1),
  group("hibernating", true, "Hoog", 4, 100, 2),
  group("lost", null, null, 50, 0, 0),
  group(null, false, "Hoog", 8, 0, 3),
  group(null, false, "Laag", 100, 0, 2),
];

describe("Klantinzichten summary", () => {
  it("adds up totals, intent per type and segments", () => {
    const summary = summarizeInsights(groups, { rfm: true, ai: true, buyers: true, prospects: true });
    expect(summary.totals).toMatchObject({ profiles: 227, buyers: 119, prospects: 108, highIntent: 22, expectedRevenue: 17600 });
    expect(summary.intent[0].bands[0]).toEqual({ band: "Hoog", profiles: 14, averageChance: 8 / 14 });
    expect(summary.intent[1].bands[0]).toEqual({ band: "Hoog", profiles: 8, averageChance: 3 / 8 });
    const champions = summary.segments.find((segment) => segment.key === "champions")!;
    expect(champions).toMatchObject({ profiles: 40, averageClv: 350, highIntentShare: 0.25 });
    // Segments without predictions show no share instead of 0%.
    expect(summary.segments.find((segment) => segment.key === "lost")!.highIntentShare).toBeNull();
  });

  it("builds the target groups with their Copernica rule", () => {
    const audiences = Object.fromEntries(buildAudiences(groups, { rfm: true, ai: true, buyers: true, prospects: true }).map((audience) => [audience.key, audience]));
    expect(audiences.prospects_high.profiles).toBe(8);
    expect(audiences.buyers_high.profiles).toBe(14);
    expect(audiences.at_risk.profiles).toBe(25);
    expect(audiences.at_risk.detail).toBe("waarvan 20 nog koopintentie tonen");
    expect(audiences.champions.profiles).toBe(40);
    expect(audiences.sleeping_interest.profiles).toBe(4);
    expect(audiences.prospects_high.condition).toContain("Klantinzichten");
  });

  it("only offers target groups whose data is available", () => {
    expect(buildAudiences(groups, { rfm: true, ai: false, buyers: false, prospects: false }).map((audience) => audience.key)).toEqual(["at_risk", "champions"]);
    expect(buildAudiences(groups, { rfm: false, ai: true, buyers: true, prospects: true }).map((audience) => audience.key)).toEqual(["prospects_high", "buyers_high"]);
    expect(summarizeInsights(groups, { rfm: false, ai: true, buyers: true, prospects: true }).segments).toEqual([]);
  });

  it("hides what a failed model would show as zero", () => {
    // Prospect model failed its backtest: no prospect target group and no prospect row, instead of misleading zeros.
    const available = { rfm: true, ai: true, buyers: true, prospects: false };
    expect(buildAudiences(groups, available).map((audience) => audience.key)).not.toContain("prospects_high");
    expect(summarizeInsights(groups, available).intent.map((row) => row.type)).toEqual(["Kopers"]);
  });
});
