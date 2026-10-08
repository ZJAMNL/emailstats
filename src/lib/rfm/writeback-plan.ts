import { rfmSegmentByKey, type RfmSegmentKey } from "./segments";

/** The profile fields the dashboard writes to Copernica. */
export const rfmCopernicaFields = [
  { name: "RFM_Segment", type: "text", length: 50, index: true, description: "Segment volgens het RFM-model, bijv. Kampioenen of Risico" },
  { name: "RFM_Score", type: "text", length: 3, index: false, description: "Scores voor Recency, Frequency en Monetary (1–5), bijv. 545" },
  { name: "RFM_Vorig_Segment", type: "text", length: 50, index: false, description: "Het vorige, andere segment van deze klant" },
  { name: "RFM_Klantwaarde", type: "float", index: false, description: "Voorspelde omzet in de komende 12 maanden (euro)" },
  { name: "RFM_Kans_Actief", type: "integer", index: false, description: "Kans dat de klant nog actief is (0–100)" },
  { name: "RFM_Gewijzigd", type: "empty_date", index: false, description: "Datum waarop segment of waarde voor het laatst veranderde" },
] as const;

export const noRecentPurchaseLabel = "Geen recente aankoop";
export const clearedHash = "cleared";

type ScoreRow = { segment: string; previousSegment: string | null; r: number; f: number; m: number; predictedClv: unknown; probabilityAlive: number | null };

const label = (segment: string | null) => (segment ? rfmSegmentByKey.get(segment as RfmSegmentKey)?.label ?? segment : "");

/** The field values for one profile, and a hash that ignores small day-to-day drift in value and probability. */
export function desiredProfileFields(row: ScoreRow, today: string) {
  const clv = row.predictedClv === null || row.predictedClv === undefined ? null : Number(row.predictedClv);
  const alive = row.probabilityAlive === null ? null : Math.round(row.probabilityAlive * 100);
  const fields = {
    RFM_Segment: label(row.segment),
    RFM_Score: `${row.r}${row.f}${row.m}`,
    RFM_Vorig_Segment: label(row.previousSegment),
    RFM_Klantwaarde: clv === null ? 0 : Math.round(clv),
    RFM_Kans_Actief: alive ?? 0,
    RFM_Gewijzigd: today,
  };
  const hash = [row.segment, fields.RFM_Score, row.previousSegment ?? "", clv === null ? "" : Math.round(clv / 10), alive === null ? "" : Math.round(alive / 10)].join("|");
  return { fields, hash };
}

export function clearedProfileFields(today: string) {
  return { RFM_Segment: noRecentPurchaseLabel, RFM_Score: "", RFM_Vorig_Segment: "", RFM_Klantwaarde: 0, RFM_Kans_Actief: 0, RFM_Gewijzigd: today };
}

/** Which profiles need a write: changed scores, and profiles written before that have dropped out of the model. */
export function planWriteBack(scores: Map<string, string>, written: Map<string, string>) {
  const update = [...scores.entries()].filter(([profileId, hash]) => written.get(profileId) !== hash).map(([profileId]) => profileId);
  const clear = [...written.entries()].filter(([profileId, hash]) => !scores.has(profileId) && hash !== clearedHash).map(([profileId]) => profileId);
  return { update, clear };
}
