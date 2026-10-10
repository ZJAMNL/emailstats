import { describe, expect, it } from "vitest";
import { desiredInsightFields, insightFields, planInsightWrites, type AiInsight, type RfmInsight } from "./fields";

const rfm: RfmInsight = { segment: "champions", previousSegment: "loyal", r: 5, f: 4, m: 5, predictedClv: 812.4, probabilityAlive: 0.93 };
const ai: AiInsight = { isBuyer: true, purchaseProbability: 0.42, intentBand: "Hoog", favoriteCategory: "Kamperen", nextCategory: "Koken", recommendations: ["sku1", "sku2"], recommendationNames: ["Brander", "Pannenset"], lastVisitAt: new Date("2026-10-08T14:00:00Z") };

describe("Klantinzichten row", () => {
  it("combines RFM and predictions in one row with every collection field", () => {
    const { fields } = desiredInsightFields(rfm, ai, "2026-10-10");
    expect(Object.keys(fields).sort()).toEqual(insightFields.map((field) => field.name).sort());
    expect(fields).toMatchObject({ Segment: "Kampioenen", RFM_Score: "545", Vorig_Segment: "Loyale klanten", Klantwaarde: 812, Kans_Actief: 93, Klanttype: "Koper", Koopkans: 42, Koopintentie: "Hoog", Aanbeveling_1_ID: "sku1", Aanbeveling_1_Naam: "Brander", Aanbeveling_3_ID: "", Laatste_Websitebezoek: "2026-10-08" });
  });

  it("leaves a switched-off part empty", () => {
    expect(desiredInsightFields(null, ai, "2026-10-10").fields).toMatchObject({ Segment: "", RFM_Score: "", Klantwaarde: 0, Koopintentie: "Hoog" });
    expect(desiredInsightFields(rfm, null, "2026-10-10").fields).toMatchObject({ Segment: "Kampioenen", Klanttype: "", Koopkans: 0, Aanbeveling_1_ID: "" });
  });

  // Probabilities are compared in 5-point steps and values in tens of euros, so day-to-day noise causes no writes.
  it("ignores small daily drift but notices real changes", () => {
    const base = desiredInsightFields(rfm, ai, "2026-10-10").hash;
    expect(desiredInsightFields({ ...rfm, predictedClv: 813.9, probabilityAlive: 0.94 }, { ...ai, purchaseProbability: 0.41 }, "2026-10-11").hash).toBe(base);
    expect(desiredInsightFields({ ...rfm, segment: "at_risk" }, ai, "2026-10-10").hash).not.toBe(base);
    expect(desiredInsightFields(rfm, { ...ai, intentBand: "Midden" }, "2026-10-10").hash).not.toBe(base);
    expect(desiredInsightFields(rfm, { ...ai, recommendations: ["sku9", "sku2"] }, "2026-10-10").hash).not.toBe(base);
    expect(desiredInsightFields(rfm, null, "2026-10-10").hash).not.toBe(base);
  });

  it("plans new, changed and dropped rows", () => {
    const tasks = planInsightWrites(new Map([["new", "a"], ["same", "b"], ["changed", "c2"]]), new Map([["same", "b"], ["changed", "c1"], ["gone", "d"]]));
    expect(tasks).toEqual([{ profileId: "new", action: "create" }, { profileId: "changed", action: "update" }, { profileId: "gone", action: "delete" }]);
  });

  it("only uses names Copernica accepts for fields", () => {
    for (const field of insightFields) expect(field.name).toMatch(/^[A-Za-z][A-Za-z0-9_]*$/);
  });
});
