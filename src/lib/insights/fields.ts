import { rfmSegmentByKey, type RfmSegmentKey } from "../rfm/segments";

/**
 * The Copernica collection with the customer insights: one record per insight per profile
 * (segment, purchase intent, each recommended product, ...), like orders or order lines.
 */
export const INSIGHTS_COLLECTION = "Klantinzichten";
export const INSIGHTS_DESCRIPTION = "Klantinzichten per profiel (één record per inzicht), bijgewerkt door het E-mail Statistieken-dashboard.";

export type InsightField = { name: string; type: "text" | "integer" | "float" | "empty_date"; length?: number; index: boolean; description: string };

export const insightFields: InsightField[] = [
  { name: "Type", type: "text", length: 50, index: true, description: "Soort inzicht, bijv. Segment, Koopintentie of Productaanbeveling" },
  { name: "Waarde", type: "text", length: 150, index: true, description: "De uitkomst, bijv. Kampioenen, Hoog, een categorie of een productnaam" },
  { name: "Score", type: "float", index: false, description: "Getal bij het inzicht: klantwaarde in euro of koopkans in procent" },
  { name: "Rang", type: "integer", index: false, description: "Volgorde binnen hetzelfde type, bijv. 1 t/m 3 bij aanbevelingen" },
  { name: "Product_ID", type: "text", length: 100, index: true, description: "Product-ID/SKU (alleen bij Productaanbeveling)" },
  { name: "Categorie", type: "text", length: 100, index: true, description: "Categorie van het aanbevolen product" },
  { name: "Toelichting", type: "text", length: 255, index: false, description: "Extra context, bijv. de RFM-score of de kans dat de klant actief is" },
  { name: "Datum", type: "empty_date", index: false, description: "Datum bij het inzicht, bijv. het laatste websitebezoek" },
  { name: "Bron", type: "text", length: 20, index: false, description: "RFM of Voorspelling" },
  { name: "Gewijzigd", type: "empty_date", index: false, description: "Datum waarop dit record voor het laatst veranderde" },
];

/** Fields of the first version (one wide row per profile); removed from the collection when found. */
export const obsoleteInsightFields = ["Segment", "RFM_Score", "Vorig_Segment", "Klantwaarde", "Kans_Actief", "Klanttype", "Koopkans", "Koopintentie", "Favoriete_Categorie", "Volgende_Categorie", "Aanbeveling_1_ID", "Aanbeveling_1_Naam", "Aanbeveling_2_ID", "Aanbeveling_2_Naam", "Aanbeveling_3_ID", "Aanbeveling_3_Naam", "Laatste_Websitebezoek"];

export type InsightTypeInfo = { type: string; source: "rfm" | "ai"; example: string; use: string };

/** The kinds of records, for the explanation on the settings pages. */
export const insightTypes: InsightTypeInfo[] = [
  { type: "Segment", source: "rfm", example: "Waarde = Kampioenen, Toelichting = RFM-score 545 · vorig segment Loyale klanten", use: "Selectie op segment, bijv. winback voor Risico" },
  { type: "Klantwaarde", source: "rfm", example: "Score = 812 (euro, komende 12 maanden), Toelichting = kans actief 93%", use: "Selectie op waarde, bijv. Score groter dan 500" },
  { type: "Klanttype", source: "ai", example: "Waarde = Koper of Prospect", use: "Kopers en prospects apart benaderen" },
  { type: "Koopintentie", source: "ai", example: "Waarde = Hoog, Score = 42 (kans in procent op aankoop in 30 dagen)", use: "Selectie op Hoog, of op Score" },
  { type: "Favoriete categorie", source: "ai", example: "Waarde = Kamperen", use: "Content afstemmen op wat iemand meestal koopt" },
  { type: "Volgende categorie", source: "ai", example: "Waarde = Koken", use: "Cross-sell naar de waarschijnlijk volgende categorie" },
  { type: "Productaanbeveling", source: "ai", example: "Rang = 1, Waarde = productnaam, Product_ID, Categorie (tot 3 records)", use: "In een mailing de records op Rang tonen" },
  { type: "Websitebezoek", source: "ai", example: "Datum = laatste bezoek", use: "Timing, bijv. bezocht in de afgelopen week" },
];

export type RfmInsight = { segment: string; previousSegment: string | null; r: number; f: number; m: number; predictedClv: unknown; probabilityAlive: number | null };
export type AiInsight = { isBuyer: boolean; purchaseProbability: number | null; intentBand: string | null; favoriteCategory: string | null; nextCategory: string | null; recommendations: string[]; recommendationNames: string[]; recommendationCategories?: (string | null)[]; lastVisitAt: Date | null };

export type InsightRecord = { key: string; fields: Record<string, string | number>; hash: string };

const label = (segment: string | null) => (segment ? rfmSegmentByKey.get(segment as RfmSegmentKey)?.label ?? segment : "");
const cut = (value: string | null | undefined, length: number) => (value ?? "").slice(0, length);
const day = (date: Date) => date.toISOString().slice(0, 10);

/**
 * All insight records of one profile, keyed so each record can be updated in place.
 * The hash per record ignores small day-to-day drift (value in tens of euros, chance in 5-point steps).
 */
export function desiredInsightRecords(rfm: RfmInsight | null, ai: AiInsight | null, today: string): InsightRecord[] {
  const records: InsightRecord[] = [];
  const add = (key: string, source: "RFM" | "Voorspelling", values: { Type: string; Waarde?: string; Score?: number; Rang?: number; Product_ID?: string; Categorie?: string; Toelichting?: string; Datum?: string }, hash: (string | number)[]) => {
    records.push({
      key,
      fields: { Type: values.Type, Waarde: cut(values.Waarde, 150), Score: values.Score ?? 0, Rang: values.Rang ?? 1, Product_ID: cut(values.Product_ID, 100), Categorie: cut(values.Categorie, 100), Toelichting: cut(values.Toelichting, 255), Datum: values.Datum ?? "", Bron: source, Gewijzigd: today },
      hash: [values.Type, ...hash].join("~"),
    });
  };

  if (rfm) {
    const previous = label(rfm.previousSegment);
    const score = `${rfm.r}${rfm.f}${rfm.m}`;
    add("segment", "RFM", { Type: "Segment", Waarde: label(rfm.segment), Toelichting: `RFM-score ${score}${previous ? ` · vorig segment ${previous}` : ""}` }, [rfm.segment, score, rfm.previousSegment ?? ""]);
    const clv = rfm.predictedClv === null || rfm.predictedClv === undefined ? null : Number(rfm.predictedClv);
    const alive = rfm.probabilityAlive === null ? null : Math.round(rfm.probabilityAlive * 100);
    if (clv !== null) add("klantwaarde", "RFM", { Type: "Klantwaarde", Waarde: `€ ${Math.round(clv).toLocaleString("nl-NL")}`, Score: Math.round(clv), Toelichting: alive === null ? "" : `Kans actief ${alive}%` }, [Math.round(clv / 10), alive === null ? "" : Math.round(alive / 10)]);
  }

  if (ai) {
    add("klanttype", "Voorspelling", { Type: "Klanttype", Waarde: ai.isBuyer ? "Koper" : "Prospect" }, [ai.isBuyer ? "Koper" : "Prospect"]);
    const chance = ai.purchaseProbability === null ? null : Math.round(ai.purchaseProbability * 100);
    if (chance !== null && ai.intentBand) add("koopintentie", "Voorspelling", { Type: "Koopintentie", Waarde: ai.intentBand, Score: chance, Toelichting: `${chance}% kans op een aankoop in de komende 30 dagen` }, [ai.intentBand, Math.round(chance / 5)]);
    if (ai.favoriteCategory) add("favoriete_categorie", "Voorspelling", { Type: "Favoriete categorie", Waarde: ai.favoriteCategory }, [ai.favoriteCategory]);
    if (ai.nextCategory) add("volgende_categorie", "Voorspelling", { Type: "Volgende categorie", Waarde: ai.nextCategory }, [ai.nextCategory]);
    ai.recommendations.slice(0, 3).forEach((productId, index) => {
      const name = ai.recommendationNames[index] ?? productId;
      const category = ai.recommendationCategories?.[index] ?? "";
      add(`aanbeveling_${index + 1}`, "Voorspelling", { Type: "Productaanbeveling", Waarde: name, Rang: index + 1, Product_ID: productId, Categorie: category ?? "" }, [productId, name, category ?? ""]);
    });
    if (ai.lastVisitAt) add("websitebezoek", "Voorspelling", { Type: "Websitebezoek", Waarde: "Laatste bezoek", Datum: day(ai.lastVisitAt) }, [day(ai.lastVisitAt)]);
  }
  return records;
}

export type InsightTask = { profileId: string; insightKey: string; action: "create" | "update" | "delete" };

/** Map key for one record of one profile. */
export const recordKey = (profileId: string, insightKey: string) => `${profileId}\u0000${insightKey}`;

/** New records, changed records, and records that no longer apply (profile dropped out, or fewer recommendations). */
export function planInsightWrites(desired: Map<string, string>, written: Map<string, string>): InsightTask[] {
  const split = (key: string) => { const [profileId, insightKey] = key.split("\u0000"); return { profileId, insightKey }; };
  return [
    ...[...desired].filter(([key]) => !written.has(key)).map(([key]) => ({ ...split(key), action: "create" as const })),
    ...[...desired].filter(([key, hash]) => written.has(key) && written.get(key) !== hash).map(([key]) => ({ ...split(key), action: "update" as const })),
    ...[...written.keys()].filter((key) => !desired.has(key)).map((key) => ({ ...split(key), action: "delete" as const })),
  ];
}

/** Empty values for the old RFM_ profile fields, used when the transition period ends. */
export const emptyLegacyRfmProfileFields = { RFM_Segment: "", RFM_Score: "", RFM_Vorig_Segment: "", RFM_Klantwaarde: 0, RFM_Kans_Actief: 0, RFM_Gewijzigd: "" };
