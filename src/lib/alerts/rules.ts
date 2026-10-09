import { compareSnapshot, selectionRatio, type Snapshot } from "../snapshots";

export type AlertSeverity = "critical" | "warning";
export type AlertGroup = "database" | "campaigns" | "deliverability" | "rfm" | "technical";

export type AlertCampaign = {
  id: string;
  name: string;
  sentAt: Date | null;
  sentCount: number;
  openCount: number;
  clickCount: number;
  bounceCount: number;
  unsubscribeCount: number;
  complaintCount: number;
};

/** Everything the rules look at for one customer. Snapshots are newest first. */
export type AlertContext = {
  now: Date;
  modules: { databaseStats: boolean; campaignStats: boolean };
  selections: { id: string; name: string; snapshots: Snapshot[] }[];
  /** The primary total, or the sum of the selections that count towards the total. */
  total: { name: string; snapshots: Snapshot[] } | null;
  ratios: { id: string; name: string; baseName: string; part: Snapshot[]; base: Snapshot[] }[];
  /** Campaigns of the last 90 days. */
  campaigns: AlertCampaign[];
  /** Most recent send of any campaign, also when it is older than 90 days. */
  lastCampaignAt: Date | null;
  rfm: { enabled: boolean; lastRunAt: Date | null; lastRunStatus: string | null; snapshots: { measuredAt: Date; segment: string; customers: number }[] };
  copernica: { connected: boolean; lastSyncedAt: Date | null };
};

export type AlertFinding = { subjectKey: string; title: string; detail: string; value: number | null };

export type ThresholdField = { key: string; label: string; unit: "%" | "pt" | "dagen" | "uur"; defaultValue: number; min: number; max: number; step: number };

export type AlertRule = {
  key: string;
  group: AlertGroup;
  label: string;
  /** When it fires, in words, for the settings screen. */
  description: string;
  severity: AlertSeverity;
  /** What to do about it, for the e-mail. */
  advice: string;
  defaultEnabled: boolean;
  /** Days before the same subject may alert again; null = once per subject (one campaign). */
  cooldownDays: number | null;
  thresholds: ThresholdField[];
  evaluate: (context: AlertContext, params: Record<string, number>) => AlertFinding[];
};

const hourMs = 60 * 60 * 1000;
const dayMs = 24 * hourMs;
/** Below this, percentages swing on a handful of profiles or recipients. */
export const MIN_PROFILES = 50;
export const MIN_RECIPIENTS = 100;

export const alertGroups: { key: AlertGroup; label: string }[] = [
  { key: "database", label: "Database en selecties" },
  { key: "campaigns", label: "Campagneprestaties" },
  { key: "deliverability", label: "Deliverability" },
  { key: "rfm", label: "Klantwaarde (RFM)" },
  { key: "technical", label: "Techniek" },
];

const number = new Intl.NumberFormat("nl-NL");
const percent = (value: number) => `${value.toLocaleString("nl-NL", { maximumFractionDigits: 2 })}%`;
const date = (value: Date) => value.toLocaleDateString("nl-NL", { timeZone: "Europe/Amsterdam" });

/** The change since the previous measurement, when that measurement is recent enough to compare. */
function lastChange(snapshots: Snapshot[], now: Date) {
  const [latest] = snapshots;
  // An old latest measurement means the sync stopped; sync_stale reports that, not every selection.
  if (!latest || now.getTime() - latest.measuredAt.getTime() > 2 * dayMs) return null;
  const previous = compareSnapshot(snapshots, 1);
  if (!previous || latest.measuredAt.getTime() - previous.measuredAt.getTime() > 7 * dayMs || previous.profileCount < MIN_PROFILES) return null;
  return { latest, previous, percent: ((latest.profileCount - previous.profileCount) / previous.profileCount) * 100 };
}

/** Rate in percent of what was sent, or null when the mailing is too small to judge. */
function rate(campaign: AlertCampaign, count: number) {
  return campaign.sentCount >= MIN_RECIPIENTS ? (count / campaign.sentCount) * 100 : null;
}

function sentWithin(campaign: AlertCampaign, now: Date, fromHoursAgo: number, toHoursAgo: number) {
  if (!campaign.sentAt) return false;
  const age = now.getTime() - campaign.sentAt.getTime();
  return age >= toHoursAgo * hourMs && age <= fromHoursAgo * hourMs;
}

/**
 * Engagement rules judge mailings sent 24–72 hours ago: opens and clicks need a day to come in,
 * and the alert should still be timely.
 */
function engagementRule(kind: "open" | "click"): AlertRule["evaluate"] {
  return (context, params) => {
    const value = (campaign: AlertCampaign) => rate(campaign, kind === "open" ? campaign.openCount : campaign.clickCount);
    const recent = context.campaigns.filter((campaign) => sentWithin(campaign, context.now, 72, 24));
    return recent.flatMap((campaign) => {
      const current = value(campaign);
      if (current === null) return [];
      const others = context.campaigns.filter((other) => other.id !== campaign.id && value(other) !== null);
      const sent = others.reduce((total, other) => total + other.sentCount, 0);
      const average = others.length >= 3 && sent ? (others.reduce((total, other) => total + (kind === "open" ? other.openCount : other.clickCount), 0) / sent) * 100 : null;
      const belowMinimum = current < params.minimum;
      const belowAverage = average !== null && current < average * (1 - params.belowAverage / 100);
      if (!belowMinimum && !belowAverage) return [];
      const label = kind === "open" ? "Open rate" : "CTR";
      return [{
        subjectKey: campaign.id,
        title: `${label} van ${percent(current)} voor “${campaign.name}”`,
        detail: `${label} ${percent(current)} bij ${number.format(campaign.sentCount)} ontvangers${average !== null ? `; het 90-dagengemiddelde is ${percent(average)}` : ""}. Verzonden ${date(campaign.sentAt!)}.`,
        value: current,
      }];
    });
  };
}

function deliverabilityRule(count: (campaign: AlertCampaign) => number, label: string): AlertRule["evaluate"] {
  return (context, params) => context.campaigns
    .filter((campaign) => sentWithin(campaign, context.now, 7 * 24, 0))
    .flatMap((campaign) => {
      const current = rate(campaign, count(campaign));
      if (current === null || current <= params.maximum) return [];
      return [{
        subjectKey: campaign.id,
        title: `${label} van ${percent(current)} bij “${campaign.name}”`,
        detail: `${number.format(count(campaign))} van ${number.format(campaign.sentCount)} ontvangers (drempel ${percent(params.maximum)}). Verzonden ${date(campaign.sentAt!)}.`,
        value: current,
      }];
    });
}

/** Customers in the given segments on the latest RFM measurement and on the one about 30 days earlier. */
function rfmChange(context: AlertContext, segments: string[]) {
  const dates = [...new Set(context.rfm.snapshots.map((snapshot) => snapshot.measuredAt.getTime()))].sort((left, right) => right - left);
  const [latest] = dates;
  const earlier = dates.find((time) => time <= latest - 30 * dayMs) ?? dates.at(-1);
  if (latest === undefined || earlier === undefined || latest - earlier < 21 * dayMs) return null;
  const count = (time: number) => context.rfm.snapshots.filter((snapshot) => snapshot.measuredAt.getTime() === time && segments.includes(snapshot.segment)).reduce((total, snapshot) => total + snapshot.customers, 0);
  const now = count(latest);
  const before = count(earlier);
  if (before < 20) return null;
  return { now, before, percent: ((now - before) / before) * 100, since: new Date(earlier) };
}

export const alertRules: AlertRule[] = [
  {
    key: "selection_drop",
    group: "database",
    label: "Selectie daalt sterk",
    description: "Een gevolgde selectie is sinds de vorige meting meer dan het ingestelde percentage gekrompen.",
    severity: "critical",
    advice: "Controleer of er een import, opschoonactie of filterwijziging in Copernica is geweest. Een onverwachte daling wijst vaak op een kapotte selectieregel of een mislukte koppeling.",
    defaultEnabled: true,
    cooldownDays: 7,
    thresholds: [{ key: "percent", label: "Daling meer dan", unit: "%", defaultValue: 5, min: 1, max: 90, step: 1 }],
    evaluate: (context, params) => context.modules.databaseStats ? context.selections.flatMap((selection) => {
      const change = lastChange(selection.snapshots, context.now);
      if (!change || change.percent >= -params.percent) return [];
      return [{ subjectKey: selection.id, title: `“${selection.name}” daalde ${percent(-change.percent)}`, detail: `Van ${number.format(change.previous.profileCount)} naar ${number.format(change.latest.profileCount)} profielen sinds ${date(change.previous.measuredAt)}.`, value: change.percent }];
    }) : [],
  },
  {
    key: "selection_spike",
    group: "database",
    label: "Selectie stijgt verdacht snel",
    description: "Een gevolgde selectie is sinds de vorige meting meer dan het ingestelde percentage gegroeid.",
    severity: "warning",
    advice: "Een plotselinge sprong is zelden organische groei. Controleer of er een (dubbele) import is gedaan of dat een selectievoorwaarde te ruim is geworden, zodat je niet ongemerkt de verkeerde mensen mailt.",
    defaultEnabled: true,
    cooldownDays: 7,
    thresholds: [{ key: "percent", label: "Stijging meer dan", unit: "%", defaultValue: 20, min: 1, max: 500, step: 1 }],
    evaluate: (context, params) => context.modules.databaseStats ? context.selections.flatMap((selection) => {
      const change = lastChange(selection.snapshots, context.now);
      if (!change || change.percent <= params.percent) return [];
      return [{ subjectKey: selection.id, title: `“${selection.name}” steeg ${percent(change.percent)}`, detail: `Van ${number.format(change.previous.profileCount)} naar ${number.format(change.latest.profileCount)} profielen sinds ${date(change.previous.measuredAt)}.`, value: change.percent }];
    }) : [],
  },
  {
    key: "database_shrink_week",
    group: "database",
    label: "Database krimpt",
    description: "Het totaal (primair totaal, of de selecties die meetellen) is in 7 dagen meer dan het ingestelde percentage gekrompen.",
    severity: "warning",
    advice: "Kijk waar de uitstroom vandaan komt: afmeldingen, harde bounces of opschoning. Zet zo nodig acquisitie (pop-ups, acties, leadformulieren) aan om de database op peil te houden.",
    defaultEnabled: true,
    cooldownDays: 7,
    thresholds: [{ key: "percent", label: "Krimp in 7 dagen meer dan", unit: "%", defaultValue: 2, min: 0.5, max: 50, step: 0.5 }],
    evaluate: (context, params) => {
      const total = context.total;
      const [latest] = total?.snapshots ?? [];
      if (!context.modules.databaseStats || !total || !latest || context.now.getTime() - latest.measuredAt.getTime() > 2 * dayMs) return [];
      const week = compareSnapshot(total.snapshots, 7);
      if (!week || latest.measuredAt.getTime() - week.measuredAt.getTime() > 9 * dayMs || week.profileCount < MIN_PROFILES) return [];
      const change = ((latest.profileCount - week.profileCount) / week.profileCount) * 100;
      if (change >= -params.percent) return [];
      return [{ subjectKey: "total", title: `${total.name} kromp ${percent(-change)} in een week`, detail: `Van ${number.format(week.profileCount)} naar ${number.format(latest.profileCount)} profielen sinds ${date(week.measuredAt)}.`, value: change }];
    },
  },
  {
    key: "ratio_drop",
    group: "database",
    label: "Verhouding daalt",
    description: "Een ingestelde verhouding (bijv. opt-ins als deel van het totaal) is in 7 dagen meer dan het ingestelde aantal procentpunten gedaald.",
    severity: "warning",
    advice: "Een dalend aandeel (bijvoorbeeld opt-ins) betekent dat de database wel groeit, maar niet in het deel dat je kunt mailen. Controleer de opt-in-flow en of nieuwe aanmeldingen goed binnenkomen.",
    defaultEnabled: true,
    cooldownDays: 7,
    thresholds: [{ key: "points", label: "Daling meer dan", unit: "pt", defaultValue: 2, min: 0.5, max: 50, step: 0.5 }],
    evaluate: (context, params) => context.modules.databaseStats ? context.ratios.flatMap((ratio) => {
      const [latest] = ratio.part;
      if (!latest || context.now.getTime() - latest.measuredAt.getTime() > 2 * dayMs) return [];
      const current = selectionRatio(ratio.part, ratio.base, 0);
      const before = selectionRatio(ratio.part, ratio.base, 7);
      if (current === null || before === null || before - current <= params.points) return [];
      return [{ subjectKey: ratio.id, title: `Aandeel “${ratio.name}” in “${ratio.baseName}” daalde ${(before - current).toLocaleString("nl-NL", { maximumFractionDigits: 1 })} pt`, detail: `Van ${percent(before)} naar ${percent(current)} in 7 dagen.`, value: current - before }];
    }) : [],
  },
  {
    key: "low_open_rate",
    group: "campaigns",
    label: "Lage open rate",
    description: "Een mailing van 1 à 3 dagen geleden haalt de minimale open rate niet, of blijft ver onder het 90-dagengemiddelde.",
    severity: "warning",
    advice: "Kijk naar onderwerpregel, preheader, afzendernaam en verzendmoment. Is de open rate over de hele linie gedaald, controleer dan of mails in de spam of het tabblad Reclame belanden.",
    defaultEnabled: true,
    cooldownDays: null,
    thresholds: [
      { key: "minimum", label: "Open rate lager dan", unit: "%", defaultValue: 15, min: 0, max: 100, step: 1 },
      { key: "belowAverage", label: "Of meer dan … onder gemiddelde", unit: "%", defaultValue: 25, min: 5, max: 100, step: 5 },
    ],
    evaluate: (context, params) => context.modules.campaignStats ? engagementRule("open")(context, params) : [],
  },
  {
    key: "low_click_rate",
    group: "campaigns",
    label: "Lage CTR",
    description: "Een mailing van 1 à 3 dagen geleden haalt de minimale click-through rate niet, of blijft ver onder het 90-dagengemiddelde.",
    severity: "warning",
    advice: "Kijk naar de relevantie van het aanbod voor de selectie, de duidelijkheid en plaats van de call-to-action en of de links werken.",
    defaultEnabled: true,
    cooldownDays: null,
    thresholds: [
      { key: "minimum", label: "CTR lager dan", unit: "%", defaultValue: 1, min: 0, max: 100, step: 0.1 },
      { key: "belowAverage", label: "Of meer dan … onder gemiddelde", unit: "%", defaultValue: 30, min: 5, max: 100, step: 5 },
    ],
    evaluate: (context, params) => context.modules.campaignStats ? engagementRule("click")(context, params) : [],
  },
  {
    key: "no_recent_campaign",
    group: "campaigns",
    label: "Geen mailing verzonden",
    description: "Er is langer dan het ingestelde aantal dagen geen mailing verzonden.",
    severity: "warning",
    advice: "Een database die lang niet gemaild wordt, koelt af: engagement daalt en bounces nemen toe bij de volgende verzending. Plan een mailing of een opwarmreeks.",
    defaultEnabled: false,
    cooldownDays: 7,
    thresholds: [{ key: "days", label: "Langer dan", unit: "dagen", defaultValue: 14, min: 1, max: 180, step: 1 }],
    evaluate: (context, params) => {
      if (!context.modules.campaignStats || !context.copernica.connected || !context.lastCampaignAt) return [];
      const days = Math.floor((context.now.getTime() - context.lastCampaignAt.getTime()) / dayMs);
      if (days <= params.days) return [];
      return [{ subjectKey: "no_recent_campaign", title: `Al ${days} dagen geen mailing verzonden`, detail: `De laatste mailing ging uit op ${date(context.lastCampaignAt)}.`, value: days }];
    },
  },
  {
    key: "high_bounce",
    group: "deliverability",
    label: "Hoog bouncepercentage",
    description: "Een mailing van de afgelopen 7 dagen heeft meer bounces dan het ingestelde percentage.",
    severity: "critical",
    advice: "Hoge bounces schaden de afzenderreputatie. Schoon harde bounces direct op, controleer de herkomst van recent geïmporteerde adressen en mail niet naar lang inactieve adressen zonder opwarmen.",
    defaultEnabled: true,
    cooldownDays: null,
    thresholds: [{ key: "maximum", label: "Bounces meer dan", unit: "%", defaultValue: 2, min: 0.1, max: 50, step: 0.1 }],
    evaluate: (context, params) => context.modules.campaignStats ? deliverabilityRule((campaign) => campaign.bounceCount, "Bouncepercentage")(context, params) : [],
  },
  {
    key: "high_unsubscribe",
    group: "deliverability",
    label: "Veel afmeldingen",
    description: "Een mailing van de afgelopen 7 dagen heeft meer afmeldingen dan het ingestelde percentage.",
    severity: "warning",
    advice: "Veel afmeldingen wijzen op een mismatch tussen inhoud en verwachting, of op een te hoge mailfrequentie. Controleer de selectie en overweeg een voorkeurencentrum in plaats van alleen afmelden.",
    defaultEnabled: true,
    cooldownDays: null,
    thresholds: [{ key: "maximum", label: "Afmeldingen meer dan", unit: "%", defaultValue: 0.5, min: 0.05, max: 20, step: 0.05 }],
    evaluate: (context, params) => context.modules.campaignStats ? deliverabilityRule((campaign) => campaign.unsubscribeCount, "Afmeldpercentage")(context, params) : [],
  },
  {
    key: "spam_complaints",
    group: "deliverability",
    label: "Spamklachten",
    description: "Een mailing van de afgelopen 7 dagen heeft meer spamklachten dan het ingestelde percentage.",
    severity: "critical",
    advice: "Boven 0,1% gaan mailboxproviders als Gmail mail weigeren of als spam markeren. Controleer of de ontvangers echt toestemming gaven, maak afmelden makkelijk en verlaag de frequentie voor deze selectie.",
    defaultEnabled: true,
    cooldownDays: null,
    thresholds: [{ key: "maximum", label: "Klachten meer dan", unit: "%", defaultValue: 0.05, min: 0.01, max: 5, step: 0.01 }],
    evaluate: (context, params) => context.modules.campaignStats ? deliverabilityRule((campaign) => campaign.complaintCount, "Klachtpercentage")(context, params) : [],
  },
  {
    key: "rfm_at_risk_growth",
    group: "rfm",
    label: "Meer klanten in gevarenzone",
    description: "Het aantal klanten in de segmenten Risico en Niet verliezen is in 30 dagen meer dan het ingestelde percentage gegroeid.",
    severity: "warning",
    advice: "Goede klanten haken af. Zet (of verbeter) een winbackflow op voor Risico en Niet verliezen, met een persoonlijke boodschap en een aanbod dat past bij hun aankoophistorie.",
    defaultEnabled: true,
    cooldownDays: 7,
    thresholds: [{ key: "percent", label: "Groei in 30 dagen meer dan", unit: "%", defaultValue: 10, min: 1, max: 200, step: 1 }],
    evaluate: (context, params) => {
      if (!context.rfm.enabled) return [];
      const change = rfmChange(context, ["at_risk", "cant_lose"]);
      if (!change || change.percent <= params.percent) return [];
      return [{ subjectKey: "at_risk", title: `${percent(change.percent)} meer klanten in Risico en Niet verliezen`, detail: `Van ${number.format(change.before)} naar ${number.format(change.now)} klanten sinds ${date(change.since)}.`, value: change.percent }];
    },
  },
  {
    key: "rfm_champions_drop",
    group: "rfm",
    label: "Minder kampioenen",
    description: "Het aantal Kampioenen is in 30 dagen meer dan het ingestelde percentage gedaald.",
    severity: "warning",
    advice: "Je beste klanten kopen minder vaak of minder recent. Beloon ze met VIP-behandeling of vroege toegang en kijk of er iets veranderd is in assortiment, levering of service.",
    defaultEnabled: true,
    cooldownDays: 7,
    thresholds: [{ key: "percent", label: "Daling in 30 dagen meer dan", unit: "%", defaultValue: 10, min: 1, max: 100, step: 1 }],
    evaluate: (context, params) => {
      if (!context.rfm.enabled) return [];
      const change = rfmChange(context, ["champions"]);
      if (!change || change.percent >= -params.percent) return [];
      return [{ subjectKey: "champions", title: `${percent(-change.percent)} minder Kampioenen`, detail: `Van ${number.format(change.before)} naar ${number.format(change.now)} klanten sinds ${date(change.since)}.`, value: change.percent }];
    },
  },
  {
    key: "sync_stale",
    group: "technical",
    label: "Copernica-sync loopt achter",
    description: "De laatste geslaagde synchronisatie met Copernica is ouder dan het ingestelde aantal uur.",
    severity: "critical",
    advice: "Zolang de sync stilstaat, kloppen de cijfers in het dashboard niet en gaan andere alerts niet af. Controleer of het API-token van de klant nog geldig is en of de koppeling in Copernica actief is.",
    defaultEnabled: true,
    cooldownDays: 2,
    thresholds: [{ key: "hours", label: "Ouder dan", unit: "uur", defaultValue: 36, min: 6, max: 240, step: 1 }],
    evaluate: (context, params) => {
      // Without any statistics enabled the sync does nothing, so its age means nothing either.
      if (!context.copernica.connected || (!context.modules.databaseStats && !context.modules.campaignStats)) return [];
      const last = context.copernica.lastSyncedAt;
      const hours = last ? Math.floor((context.now.getTime() - last.getTime()) / hourMs) : null;
      if (hours !== null && hours <= params.hours) return [];
      return [{ subjectKey: "sync", title: hours === null ? "Copernica is nog nooit gesynchroniseerd" : `Laatste Copernica-sync is ${hours} uur oud`, detail: last ? `Laatste geslaagde sync: ${last.toLocaleString("nl-NL", { timeZone: "Europe/Amsterdam" })}.` : "Er is nog geen geslaagde synchronisatie geweest.", value: hours }];
    },
  },
  {
    key: "rfm_failed",
    group: "technical",
    label: "RFM-berekening mislukt",
    description: "De laatste nachtelijke RFM-berekening is mislukt.",
    severity: "critical",
    advice: "De RFM-cijfers en de teruggeschreven profielvelden zijn niet bijgewerkt. Controleer de Copernica-koppeling en de gekozen ordercollectie en -velden op de RFM-pagina van de klant.",
    defaultEnabled: true,
    cooldownDays: 7,
    thresholds: [],
    evaluate: (context) => {
      const status = context.rfm.lastRunStatus;
      if (!context.rfm.enabled || !status || status === "ok") return [];
      return [{ subjectKey: "rfm", title: "De RFM-berekening is mislukt", detail: `${context.rfm.lastRunAt ? `${context.rfm.lastRunAt.toLocaleString("nl-NL", { timeZone: "Europe/Amsterdam" })}: ` : ""}${status}`, value: null }];
    },
  },
];

export const alertRulesByKey = new Map(alertRules.map((rule) => [rule.key, rule]));

/** Whether an earlier alert for the same rule and subject still blocks a new one. */
export function isInCooldown(rule: Pick<AlertRule, "cooldownDays">, lastTriggeredAt: Date | null, now: Date) {
  if (!lastTriggeredAt) return false;
  if (rule.cooldownDays === null) return true;
  // An hour of slack: the daily cron does not start at exactly the same second every day.
  return now.getTime() - lastTriggeredAt.getTime() < rule.cooldownDays * dayMs - hourMs;
}
