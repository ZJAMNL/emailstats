import { rfmSegmentByKey, type RfmSegmentKey } from "../rfm/segments";

/** The Copernica collection with one row per profile: RFM and predictions, kept out of the profile itself. */
export const INSIGHTS_COLLECTION = "Klantinzichten";
export const INSIGHTS_DESCRIPTION = "Klantwaarde (RFM) en voorspellingen per profiel, bijgewerkt door het E-mail Statistieken-dashboard.";

export type InsightField = { name: string; type: "text" | "integer" | "float" | "empty_date"; length?: number; index: boolean; group: "rfm" | "ai" | "meta"; description: string };

export const insightFields: InsightField[] = [
  { name: "Segment", type: "text", length: 50, index: true, group: "rfm", description: "Segment volgens het RFM-model, bijv. Kampioenen of Risico" },
  { name: "RFM_Score", type: "text", length: 3, index: false, group: "rfm", description: "Scores voor Recency, Frequency en Monetary (1–5), bijv. 545" },
  { name: "Vorig_Segment", type: "text", length: 50, index: false, group: "rfm", description: "Het vorige, andere segment van deze klant" },
  { name: "Klantwaarde", type: "float", index: false, group: "rfm", description: "Voorspelde omzet in de komende 12 maanden (euro)" },
  { name: "Kans_Actief", type: "integer", index: false, group: "rfm", description: "Kans dat de klant nog actief is (0–100)" },
  { name: "Klanttype", type: "text", length: 20, index: true, group: "ai", description: "Koper of Prospect (nog geen aankoop, wel websitebezoek)" },
  { name: "Koopkans", type: "integer", index: false, group: "ai", description: "Kans op een aankoop in de komende 30 dagen (0–100)" },
  { name: "Koopintentie", type: "text", length: 20, index: true, group: "ai", description: "Hoog, Midden of Laag ten opzichte van andere kopers of prospects" },
  { name: "Favoriete_Categorie", type: "text", length: 100, index: true, group: "ai", description: "Categorie die deze klant het vaakst kocht" },
  { name: "Volgende_Categorie", type: "text", length: 100, index: true, group: "ai", description: "Waarschijnlijk volgende categorie" },
  { name: "Aanbeveling_1_ID", type: "text", length: 100, index: false, group: "ai", description: "Aanbevolen product (product-ID/SKU)" },
  { name: "Aanbeveling_1_Naam", type: "text", length: 150, index: false, group: "ai", description: "Naam van het aanbevolen product" },
  { name: "Aanbeveling_2_ID", type: "text", length: 100, index: false, group: "ai", description: "Tweede aanbevolen product (product-ID/SKU)" },
  { name: "Aanbeveling_2_Naam", type: "text", length: 150, index: false, group: "ai", description: "Naam van het tweede aanbevolen product" },
  { name: "Aanbeveling_3_ID", type: "text", length: 100, index: false, group: "ai", description: "Derde aanbevolen product (product-ID/SKU)" },
  { name: "Aanbeveling_3_Naam", type: "text", length: 150, index: false, group: "ai", description: "Naam van het derde aanbevolen product" },
  { name: "Laatste_Websitebezoek", type: "empty_date", index: false, group: "ai", description: "Datum van het laatste websitebezoek" },
  { name: "Gewijzigd", type: "empty_date", index: false, group: "meta", description: "Datum waarop een waarde in deze rij voor het laatst veranderde" },
];

export type RfmInsight = { segment: string; previousSegment: string | null; r: number; f: number; m: number; predictedClv: unknown; probabilityAlive: number | null };
export type AiInsight = { isBuyer: boolean; purchaseProbability: number | null; intentBand: string | null; favoriteCategory: string | null; nextCategory: string | null; recommendations: string[]; recommendationNames: string[]; lastVisitAt: Date | null };

const label = (segment: string | null) => (segment ? rfmSegmentByKey.get(segment as RfmSegmentKey)?.label ?? segment : "");
const cut = (value: string | null | undefined, length: number) => (value ?? "").slice(0, length);

/**
 * The row for one profile. Parts that are switched off (or absent for this profile) stay empty.
 * The hash ignores small day-to-day drift in value and probabilities, so only real changes are written.
 */
export function desiredInsightFields(rfm: RfmInsight | null, ai: AiInsight | null, today: string) {
  const clv = rfm && rfm.predictedClv !== null && rfm.predictedClv !== undefined ? Number(rfm.predictedClv) : null;
  const alive = rfm?.probabilityAlive === null || rfm?.probabilityAlive === undefined ? null : Math.round(rfm.probabilityAlive * 100);
  const chance = ai?.purchaseProbability === null || ai?.purchaseProbability === undefined ? null : Math.round(ai.purchaseProbability * 100);
  const lastVisit = ai?.lastVisitAt ? ai.lastVisitAt.toISOString().slice(0, 10) : "";
  const fields = {
    Segment: rfm ? label(rfm.segment) : "",
    RFM_Score: rfm ? `${rfm.r}${rfm.f}${rfm.m}` : "",
    Vorig_Segment: rfm ? label(rfm.previousSegment) : "",
    Klantwaarde: clv === null ? 0 : Math.round(clv),
    Kans_Actief: alive ?? 0,
    Klanttype: ai ? (ai.isBuyer ? "Koper" : "Prospect") : "",
    Koopkans: chance ?? 0,
    Koopintentie: ai?.intentBand ?? "",
    Favoriete_Categorie: cut(ai?.favoriteCategory, 100),
    Volgende_Categorie: cut(ai?.nextCategory, 100),
    Aanbeveling_1_ID: cut(ai?.recommendations[0], 100),
    Aanbeveling_1_Naam: cut(ai?.recommendationNames[0], 150),
    Aanbeveling_2_ID: cut(ai?.recommendations[1], 100),
    Aanbeveling_2_Naam: cut(ai?.recommendationNames[1], 150),
    Aanbeveling_3_ID: cut(ai?.recommendations[2], 100),
    Aanbeveling_3_Naam: cut(ai?.recommendationNames[2], 150),
    Laatste_Websitebezoek: lastVisit,
    Gewijzigd: today,
  };
  const hash = [
    rfm ? [rfm.segment, fields.RFM_Score, rfm.previousSegment ?? "", clv === null ? "" : Math.round(clv / 10), alive === null ? "" : Math.round(alive / 10)].join("~") : "-",
    ai ? [fields.Klanttype, chance === null ? "" : Math.round(chance / 5), fields.Koopintentie, fields.Favoriete_Categorie, fields.Volgende_Categorie, ...ai.recommendations.slice(0, 3), lastVisit].join("~") : "-",
  ].join("|");
  return { fields, hash };
}

/** Empty values for the old RFM_ profile fields, used when the transition period ends. */
export const emptyLegacyRfmProfileFields = { RFM_Segment: "", RFM_Score: "", RFM_Vorig_Segment: "", RFM_Klantwaarde: 0, RFM_Kans_Actief: 0, RFM_Gewijzigd: "" };

export type InsightTask = { profileId: string; action: "create" | "update" | "delete" };

/** New rows, changed rows and rows of profiles that dropped out of both models. */
export function planInsightWrites(desired: Map<string, string>, written: Map<string, string>): InsightTask[] {
  return [
    ...[...desired].filter(([profileId]) => !written.has(profileId)).map(([profileId]) => ({ profileId, action: "create" as const })),
    ...[...desired].filter(([profileId, hash]) => written.has(profileId) && written.get(profileId) !== hash).map(([profileId]) => ({ profileId, action: "update" as const })),
    ...[...written.keys()].filter((profileId) => !desired.has(profileId)).map((profileId) => ({ profileId, action: "delete" as const })),
  ];
}
