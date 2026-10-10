import { rfmSegments, type RfmSegmentKey } from "../rfm/segments";
import { INSIGHTS_COLLECTION } from "./fields";

/** Profiles per combination of RFM segment and prediction, with summed value and purchase chance. */
export type InsightGroup = { segment: string | null; isBuyer: boolean | null; intentBand: string | null; profiles: number; clv: number; expectedPurchases: number };

/** Which data can be shown: RFM, any predictions, and per propensity model whether it passed its backtest. */
export type InsightsAvailability = { rfm: boolean; ai: boolean; buyers: boolean; prospects: boolean };

export type Audience = { key: string; title: string; profiles: number; detail: string | null; condition: string; action: string };

const bands = ["Hoog", "Midden", "Laag"] as const;
const sum = (groups: InsightGroup[], value: (group: InsightGroup) => number) => groups.reduce((total, group) => total + value(group), 0);
const count = (groups: InsightGroup[], filter: (group: InsightGroup) => boolean) => sum(groups.filter(filter), (group) => group.profiles);

/** Everything on the Klantinzichten page that comes from the grouped counts. */
export function summarizeInsights(groups: InsightGroup[], available: InsightsAvailability) {
  const predicted = groups.filter((group) => group.intentBand !== null);
  const intent = [true, false].filter((isBuyer) => (isBuyer ? available.buyers : available.prospects)).map((isBuyer) => ({
    type: isBuyer ? "Kopers" : "Prospects",
    bands: bands.map((band) => {
      const cell = predicted.filter((group) => group.isBuyer === isBuyer && group.intentBand === band);
      const profiles = sum(cell, (group) => group.profiles);
      return { band, profiles, averageChance: profiles ? sum(cell, (group) => group.expectedPurchases) / profiles : null };
    }),
  }));

  const segments = rfmSegments.map((segment) => {
    const inSegment = groups.filter((group) => group.segment === segment.key);
    const profiles = sum(inSegment, (group) => group.profiles);
    const withIntent = sum(inSegment.filter((group) => group.intentBand !== null), (group) => group.profiles);
    return {
      key: segment.key,
      label: segment.label,
      color: segment.color,
      profiles,
      averageClv: profiles ? sum(inSegment, (group) => group.clv) / profiles : 0,
      highIntentShare: withIntent ? count(inSegment, (group) => group.intentBand === "Hoog") / withIntent : null,
    };
  }).filter((segment) => segment.profiles > 0);

  return {
    totals: {
      profiles: sum(groups, (group) => group.profiles),
      buyers: count(groups, (group) => group.isBuyer === true || (group.isBuyer === null && group.segment !== null)),
      prospects: count(groups, (group) => group.isBuyer === false),
      highIntent: count(groups, (group) => group.intentBand === "Hoog"),
      expectedPurchases: sum(groups, (group) => group.expectedPurchases),
      expectedRevenue: sum(groups, (group) => group.clv),
    },
    intent,
    segments: available.rfm ? segments : [],
    audiences: buildAudiences(groups, available),
  };
}

const isSegment = (keys: RfmSegmentKey[]) => (group: InsightGroup) => group.segment !== null && keys.includes(group.segment as RfmSegmentKey);
const hasIntent = (values: string[]) => (group: InsightGroup) => group.intentBand !== null && values.includes(group.intentBand);

/** Ready-made target groups, with the selection rule to build them in Copernica and what to send them. */
export function buildAudiences(groups: InsightGroup[], available: InsightsAvailability): Audience[] {
  const audiences: (Audience & { needs: ("rfm" | "buyers" | "prospects")[] })[] = [
    {
      key: "prospects_high", needs: ["prospects"],
      title: "Prospects die nu willen kopen",
      profiles: count(groups, (group) => group.isBuyer === false && group.intentBand === "Hoog"),
      detail: null,
      condition: `${INSIGHTS_COLLECTION}: Klanttype = Prospect én Koopintentie = Hoog`,
      action: "Stuur een welkomst- of browse-abandonmentmail met Aanbeveling_1 en eventueel een eerste-aankoopvoordeel.",
    },
    {
      key: "buyers_high", needs: ["buyers"],
      title: "Kopers die klaar zijn voor de volgende aankoop",
      profiles: count(groups, (group) => group.isBuyer === true && group.intentBand === "Hoog"),
      detail: null,
      condition: `${INSIGHTS_COLLECTION}: Klanttype = Koper én Koopintentie = Hoog`,
      action: "Cross-sell op Volgende_Categorie met de drie aanbevolen producten; korting is meestal niet nodig.",
    },
    {
      key: "at_risk", needs: ["rfm"],
      title: "Waardevolle klanten die afhaken",
      profiles: count(groups, isSegment(["at_risk", "cant_lose"])),
      detail: available.buyers ? `waarvan ${count(groups, (group) => isSegment(["at_risk", "cant_lose"])(group) && hasIntent(["Hoog", "Midden"])(group)).toLocaleString("nl-NL")} nog koopintentie tonen` : null,
      condition: `${INSIGHTS_COLLECTION}: Segment = Risico of Niet verliezen`,
      action: "Persoonlijke winback met een sterk aanbod dat past bij hun aankoophistorie. Begin bij wie nog koopintentie toont.",
    },
    {
      key: "champions", needs: ["rfm"],
      title: "Kampioenen",
      profiles: count(groups, isSegment(["champions"])),
      detail: null,
      condition: `${INSIGHTS_COLLECTION}: Segment = Kampioenen`,
      action: "VIP-behandeling: vroege toegang tot nieuwe producten en vraag om reviews of referrals. Geen korting nodig.",
    },
    {
      key: "sleeping_interest", needs: ["rfm", "buyers"],
      title: "Slapende klanten die weer rondkijken",
      profiles: count(groups, (group) => isSegment(["about_to_sleep", "hibernating", "lost"])(group) && hasIntent(["Hoog", "Midden"])(group)),
      detail: null,
      condition: `${INSIGHTS_COLLECTION}: Segment = Bijna slapend, Slapend of Verloren én Koopintentie = Hoog of Midden`,
      action: "Reactiveren nu de interesse terug is: laat zien wat er nieuw is in hun favoriete categorie.",
    },
  ];
  return audiences.filter((audience) => audience.needs.every((need) => available[need])).map((audience) => ({ key: audience.key, title: audience.title, profiles: audience.profiles, detail: audience.detail, condition: audience.condition, action: audience.action }));
}
