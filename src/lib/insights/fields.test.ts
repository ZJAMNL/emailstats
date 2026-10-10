import { describe, expect, it } from "vitest";
import { desiredInsightRecords, insightFields, planInsightWrites, recordKey, type AiInsight, type RfmInsight } from "./fields";

const rfm: RfmInsight = { segment: "champions", previousSegment: "loyal", r: 5, f: 4, m: 5, predictedClv: 812.4, probabilityAlive: 0.93 };
const ai: AiInsight = { isBuyer: true, purchaseProbability: 0.42, intentBand: "Hoog", favoriteCategory: "Kamperen", nextCategory: "Koken", recommendations: ["sku1", "sku2"], recommendationNames: ["Brander", "Pannenset"], recommendationCategories: ["Koken", null], lastVisitAt: new Date("2026-10-08T14:00:00Z") };
const byKey = (records: ReturnType<typeof desiredInsightRecords>) => Object.fromEntries(records.map((record) => [record.key, record.fields]));

describe("Klantinzichten records", () => {
  it("makes one record per insight, each with every collection field", () => {
    const records = desiredInsightRecords(rfm, ai, "2026-10-10");
    expect(records.map((record) => record.key)).toEqual(["segment", "klantwaarde", "klanttype", "koopintentie", "favoriete_categorie", "volgende_categorie", "aanbeveling_1", "aanbeveling_2", "websitebezoek"]);
    for (const record of records) expect(Object.keys(record.fields).sort()).toEqual(insightFields.map((field) => field.name).sort());
    const fields = byKey(records);
    expect(fields.segment).toMatchObject({ Type: "Segment", Waarde: "Kampioenen", Toelichting: "RFM-score 545 · vorig segment Loyale klanten", Bron: "RFM" });
    expect(fields.klantwaarde).toMatchObject({ Type: "Klantwaarde", Score: 812, Toelichting: "Kans actief 93%" });
    expect(fields.koopintentie).toMatchObject({ Type: "Koopintentie", Waarde: "Hoog", Score: 42, Bron: "Voorspelling" });
    expect(fields.aanbeveling_1).toMatchObject({ Type: "Productaanbeveling", Waarde: "Brander", Rang: 1, Product_ID: "sku1", Categorie: "Koken" });
    expect(fields.aanbeveling_2).toMatchObject({ Rang: 2, Product_ID: "sku2", Categorie: "" });
    expect(fields.websitebezoek).toMatchObject({ Type: "Websitebezoek", Datum: "2026-10-08" });
  });

  it("only makes records for parts that are switched on and known", () => {
    expect(desiredInsightRecords(rfm, null, "2026-10-10").map((record) => record.key)).toEqual(["segment", "klantwaarde"]);
    const prospect = desiredInsightRecords(null, { ...ai, isBuyer: false, purchaseProbability: null, intentBand: null, favoriteCategory: null, recommendations: [], recommendationNames: [] }, "2026-10-10");
    expect(prospect.map((record) => record.key)).toEqual(["klanttype", "volgende_categorie", "websitebezoek"]);
  });

  it("changes a record only when that insight really changes", () => {
    const hashes = (records: ReturnType<typeof desiredInsightRecords>) => Object.fromEntries(records.map((record) => [record.key, record.hash]));
    const base = hashes(desiredInsightRecords(rfm, ai, "2026-10-10"));
    // Probabilities in 5-point steps and values in tens of euros, so daily noise causes no writes.
    expect(hashes(desiredInsightRecords({ ...rfm, predictedClv: 813.9, probabilityAlive: 0.94 }, { ...ai, purchaseProbability: 0.41 }, "2026-10-11"))).toEqual(base);
    const changed = hashes(desiredInsightRecords(rfm, { ...ai, recommendations: ["sku9", "sku2"], recommendationNames: ["Mok", "Pannenset"] }, "2026-10-10"));
    expect(Object.keys(base).filter((key) => base[key] !== changed[key])).toEqual(["aanbeveling_1"]);
  });

  it("plans new, changed and dropped records per insight", () => {
    const desired = new Map([[recordKey("p1", "segment"), "a"], [recordKey("p1", "aanbeveling_1"), "b2"], [recordKey("p2", "klanttype"), "c"]]);
    const written = new Map([[recordKey("p1", "segment"), "a"], [recordKey("p1", "aanbeveling_1"), "b1"], [recordKey("p1", "aanbeveling_3"), "d"], [recordKey("p9", "profiel"), "old"]]);
    expect(planInsightWrites(desired, written)).toEqual([
      { profileId: "p2", insightKey: "klanttype", action: "create" },
      { profileId: "p1", insightKey: "aanbeveling_1", action: "update" },
      { profileId: "p1", insightKey: "aanbeveling_3", action: "delete" },
      // A row in the old one-row-per-profile format is cleaned up.
      { profileId: "p9", insightKey: "profiel", action: "delete" },
    ]);
  });

  it("only uses names Copernica accepts for fields", () => {
    for (const field of insightFields) expect(field.name).toMatch(/^[A-Za-z][A-Za-z0-9_]*$/);
  });
});
