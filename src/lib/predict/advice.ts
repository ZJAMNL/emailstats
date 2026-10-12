import type { RfmSegmentKey } from "../rfm/segments";

/** Profiles per combination of RFM segment and purchase intent. */
export type AdviceGroup = { segment: string | null; isBuyer: boolean | null; intentBand: string | null; profiles: number; chance: number };

/** RFM, and per propensity model whether it passed its backtest. */
export type AdviceAvailability = { rfm: boolean; buyers: boolean; prospects: boolean };

/** Where the target groups can be selected in Copernica, as far as write-back is switched on. */
export type AdviceTarget = { rfmProfileFields: boolean; collection: string | null; dateField: string | null };

export type Audience = { key: string; title: string; profiles: number; detail: string | null; condition: string; action: string };

const bands = ["Hoog", "Midden", "Laag"] as const;
const count = (groups: AdviceGroup[], filter: (group: AdviceGroup) => boolean) => groups.filter(filter).reduce((total, group) => total + group.profiles, 0);
const isSegment = (keys: RfmSegmentKey[]) => (group: AdviceGroup) => group.segment !== null && keys.includes(group.segment as RfmSegmentKey);
const hasIntent = (values: string[]) => (group: AdviceGroup) => group.intentBand !== null && values.includes(group.intentBand);

/** Purchase intent per customer type, only for models that passed their backtest. */
export function intentTable(groups: AdviceGroup[], available: AdviceAvailability) {
  return [true, false].filter((isBuyer) => (isBuyer ? available.buyers : available.prospects)).map((isBuyer) => ({
    type: isBuyer ? "Kopers" : "Prospects",
    bands: bands.map((band) => {
      const cell = groups.filter((group) => group.isBuyer === isBuyer && group.intentBand === band);
      const profiles = cell.reduce((total, group) => total + group.profiles, 0);
      return { band, profiles, averageChance: profiles ? cell.reduce((total, group) => total + group.chance, 0) / profiles : null };
    }),
  }));
}

/**
 * Ready-made target groups with what to send them and how to select them in Copernica. A group only
 * appears when the model behind it passed, so a failed model never shows up as a misleading zero.
 */
export function buildAudiences(groups: AdviceGroup[], available: AdviceAvailability, target: AdviceTarget, repeatDue: number | null): Audience[] {
  const orders = target.collection && target.dateField ? `Record in ${target.collection} met ${target.dateField} in de komende 30 dagen` : "Zet ‘verwachte bestellingen naar Copernica’ aan om deze groep als selectie te gebruiken";
  const segment = (names: string) => target.rfmProfileFields ? `Profielveld RFM_Segment = ${names}` : "Zet ‘RFM naar Copernica’ aan om deze groep als selectie te gebruiken";
  const audiences: (Audience & { needs: (keyof AdviceAvailability | "repeat")[] })[] = [
    {
      key: "repeat_due", needs: ["repeat"],
      title: "Herhaalaankoop verwacht",
      profiles: repeatDue ?? 0,
      detail: null,
      condition: orders,
      action: "Stuur een paar dagen vóór de verwachte datum een herinnering met precies het product dat ze altijd kopen. Meestal de best renderende mailing.",
    },
    {
      key: "buyers_high", needs: ["buyers"],
      title: "Kopers die klaar zijn voor de volgende aankoop",
      profiles: count(groups, (group) => group.isBuyer === true && group.intentBand === "Hoog"),
      detail: null,
      condition: orders,
      action: "Toon het verwachte product of de verwachte categorie; korting is meestal niet nodig.",
    },
    {
      key: "prospects_high", needs: ["prospects"],
      title: "Prospects die nu willen kopen",
      profiles: count(groups, (group) => group.isBuyer === false && group.intentBand === "Hoog"),
      detail: null,
      condition: orders,
      action: "Welkomst- of browse-abandonmentmail met het product dat ze bekeken, eventueel met een eerste-aankoopvoordeel.",
    },
    {
      key: "at_risk", needs: ["rfm"],
      title: "Waardevolle klanten die afhaken",
      profiles: count(groups, isSegment(["at_risk", "cant_lose"])),
      detail: available.buyers ? `waarvan ${count(groups, (group) => isSegment(["at_risk", "cant_lose"])(group) && hasIntent(["Hoog", "Midden"])(group)).toLocaleString("nl-NL")} nog koopintentie tonen` : null,
      condition: segment("Risico of Niet verliezen"),
      action: "Persoonlijke winback met een sterk aanbod dat past bij hun aankoophistorie. Begin bij wie nog koopintentie toont.",
    },
    {
      key: "champions", needs: ["rfm"],
      title: "Kampioenen",
      profiles: count(groups, isSegment(["champions"])),
      detail: null,
      condition: segment("Kampioenen"),
      action: "VIP-behandeling: vroege toegang tot nieuwe producten en vraag om reviews of referrals. Geen korting nodig.",
    },
    {
      key: "sleeping_interest", needs: ["rfm", "buyers"],
      title: "Slapende klanten die weer rondkijken",
      profiles: count(groups, (group) => isSegment(["about_to_sleep", "hibernating", "lost"])(group) && hasIntent(["Hoog", "Midden"])(group)),
      detail: null,
      condition: target.rfmProfileFields ? "Profielveld RFM_Segment = Bijna slapend, Slapend of Verloren, én een verwachte bestelling" : segment(""),
      action: "Reactiveren nu de interesse terug is: laat zien wat er nieuw is in hun favoriete categorie.",
    },
  ];
  return audiences
    .filter((audience) => audience.needs.every((need) => (need === "repeat" ? repeatDue !== null && repeatDue > 0 : available[need])))
    .map((audience) => ({ key: audience.key, title: audience.title, profiles: audience.profiles, detail: audience.detail, condition: audience.condition, action: audience.action }));
}

/** Further predictions worth considering, with what they need. Shown to beheerders as a roadmap. */
export const furtherPredictions = [
  { title: "Beste verzendmoment per profiel", needs: "Open- en kliktijden per profiel uit Copernica", value: "Mailen op het uur dat iemand meestal opent, vaak 10–20% meer opens." },
  { title: "Afmeldrisico", needs: "Afmeldingen en mailfrequentie per profiel", value: "Wie dreigt af te haken krijgt minder of andere mail in plaats van een afmelding." },
  { title: "Kortingsgevoeligheid", needs: "Orders met en zonder kortingscode", value: "Korting alleen geven aan wie zonder korting niet koopt; dat spaart marge." },
  { title: "Verwachte orderwaarde en prijsklasse", needs: "Orderregels met prijs", value: "Producten aanbevelen in de prijsklasse die bij de klant past." },
  { title: "Kans op retour", needs: "Retouren per orderregel", value: "Producten met hoge retourkans niet pushen bij klanten die vaak retourneren." },
  { title: "Seizoen en voorraad", needs: "Productvoorraad of seizoensindeling", value: "Alleen voorspellen en aanbevelen wat leverbaar is en in het seizoen past." },
];
