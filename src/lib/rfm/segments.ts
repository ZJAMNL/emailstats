export type RfmSegmentKey =
  | "champions"
  | "loyal"
  | "potential_loyalist"
  | "new_customers"
  | "promising"
  | "need_attention"
  | "about_to_sleep"
  | "at_risk"
  | "cant_lose"
  | "hibernating"
  | "lost";

export type RfmSegment = {
  key: RfmSegmentKey;
  label: string;
  description: string;
  action: string;
  color: string;
  /** Segments that hold or grow value; used for "active" customer value. */
  active: boolean;
};

// Ordered from most to least valuable; the order is used in tables and charts.
export const rfmSegments: RfmSegment[] = [
  { key: "champions", label: "Kampioenen", description: "Kochten recent, vaak en voor veel geld.", action: "Beloon met VIP-behandeling, vroege toegang en vraag om reviews en referrals. Geen korting nodig.", color: "#237a63", active: true },
  { key: "loyal", label: "Loyale klanten", description: "Kopen regelmatig en besteden goed.", action: "Loyaliteitsprogramma, upsell naar duurdere producten.", color: "#3f9c7f", active: true },
  { key: "potential_loyalist", label: "Potentieel loyaal", description: "Recente kopers met een gemiddelde frequentie.", action: "Stimuleer de volgende aankoop met cross-sell en persoonlijke aanbevelingen.", color: "#356ba5", active: true },
  { key: "new_customers", label: "Nieuwe klanten", description: "Kochten onlangs voor het eerst.", action: "Onboardingflow: merkverhaal, gebruikstips en een reden om terug te komen.", color: "#5b8fd1", active: true },
  { key: "promising", label: "Veelbelovend", description: "Vrij recente kopers met nog weinig aankopen.", action: "Productadvies en een eerste herhaalaankoop uitlokken.", color: "#7c6df2", active: true },
  { key: "need_attention", label: "Aandacht nodig", description: "Gemiddeld op alle drie de dimensies.", action: "Gepersonaliseerde aanbevelingen en een tijdelijk aanbod.", color: "#94702c", active: true },
  { key: "about_to_sleep", label: "Bijna slapend", description: "Kochten een tijd geleden en weinig.", action: "Reactiveren met relevante content en populaire producten.", color: "#c08a3e", active: false },
  { key: "at_risk", label: "Risico", description: "Waren goede klanten, maar kopen al een tijd niet meer.", action: "Winback met hoogste prioriteit: persoonlijke boodschap en sterk aanbod.", color: "#b05b3b", active: false },
  { key: "cant_lose", label: "Niet verliezen", description: "Beste klanten van vroeger die al lang niet meer kochten.", action: "Persoonlijke winback, eventueel telefonisch, met een aanbod dat past bij hun historie.", color: "#a8456b", active: false },
  { key: "hibernating", label: "Slapend", description: "Lang geleden, weinig en voor weinig gekocht.", action: "Goedkope reactivatie; reageert niemand, verlaag dan de mailfrequentie.", color: "#875891", active: false },
  { key: "lost", label: "Verloren", description: "Laagste score op recency en weinig waarde.", action: "Laatste winbackpoging, daarna uitsluiten van dure acties.", color: "#6b7a8c", active: false },
];

export const rfmSegmentByKey = new Map(rfmSegments.map((segment) => [segment.key, segment]));

/** Maps an R score and a combined FM score (both 1–5) onto a segment on the R × FM grid. */
export function segmentFor(r: number, fm: number): RfmSegmentKey {
  if (r === 5) {
    if (fm >= 4) return "champions";
    if (fm >= 2) return "potential_loyalist";
    return "new_customers";
  }
  if (r === 4) {
    if (fm === 5) return "champions";
    if (fm === 4) return "loyal";
    if (fm >= 2) return "potential_loyalist";
    return "promising";
  }
  if (r === 3) {
    if (fm >= 4) return "loyal";
    if (fm === 3) return "need_attention";
    return "about_to_sleep";
  }
  if (r === 2) {
    if (fm >= 3) return "at_risk";
    return "hibernating";
  }
  if (fm >= 4) return "cant_lose";
  return "lost";
}

export function fmScore(f: number, m: number) {
  return Math.round((f + m) / 2);
}
