/** The profile fields the predictive models write to Copernica. */
export const predictionCopernicaFields = [
  { name: "AI_Koopkans", type: "integer", index: false, description: "Voorspelde kans op een aankoop in de komende 30 dagen (0–100)" },
  { name: "AI_Koopintentie", type: "text", length: 20, index: true, description: "Hoog, Midden of Laag ten opzichte van andere kopers of prospects" },
  { name: "AI_Klanttype", type: "text", length: 20, index: true, description: "Koper of Prospect (nog geen aankoop, wel websitebezoek)" },
  { name: "AI_Favoriete_Categorie", type: "text", length: 100, index: false, description: "Categorie die deze klant het vaakst kocht" },
  { name: "AI_Volgende_Categorie", type: "text", length: 100, index: false, description: "Waarschijnlijk volgende categorie" },
  { name: "AI_Aanbeveling_1", type: "text", length: 100, index: false, description: "Aanbevolen product (product-ID)" },
  { name: "AI_Aanbeveling_2", type: "text", length: 100, index: false, description: "Tweede aanbevolen product (product-ID)" },
  { name: "AI_Aanbeveling_3", type: "text", length: 100, index: false, description: "Derde aanbevolen product (product-ID)" },
  { name: "AI_Gewijzigd", type: "empty_date", index: false, description: "Datum waarop een voorspelling voor het laatst veranderde" },
] as const;

type PredictionRow = { isBuyer: boolean; purchaseProbability: number | null; intentBand: string | null; favoriteCategory: string | null; nextCategory: string | null; recommendations: string[] };

const cut = (value: string | null, length = 100) => (value ?? "").slice(0, length);

/** Field values for one profile and a hash that ignores small day-to-day drift in the probability. */
export function desiredPredictionFields(row: PredictionRow, today: string) {
  const chance = row.purchaseProbability === null ? null : Math.round(row.purchaseProbability * 100);
  const fields = {
    AI_Koopkans: chance ?? 0,
    AI_Koopintentie: row.intentBand ?? "",
    AI_Klanttype: row.isBuyer ? "Koper" : "Prospect",
    AI_Favoriete_Categorie: cut(row.favoriteCategory),
    AI_Volgende_Categorie: cut(row.nextCategory),
    AI_Aanbeveling_1: cut(row.recommendations[0] ?? null),
    AI_Aanbeveling_2: cut(row.recommendations[1] ?? null),
    AI_Aanbeveling_3: cut(row.recommendations[2] ?? null),
    AI_Gewijzigd: today,
  };
  const hash = [chance === null ? "" : Math.round(chance / 5), fields.AI_Koopintentie, fields.AI_Klanttype, fields.AI_Favoriete_Categorie, fields.AI_Volgende_Categorie, ...row.recommendations.slice(0, 3)].join("|");
  return { fields, hash };
}

export function clearedPredictionFields(today: string) {
  return { AI_Koopkans: 0, AI_Koopintentie: "", AI_Klanttype: "", AI_Favoriete_Categorie: "", AI_Volgende_Categorie: "", AI_Aanbeveling_1: "", AI_Aanbeveling_2: "", AI_Aanbeveling_3: "", AI_Gewijzigd: today };
}
