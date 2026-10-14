/** Cost price, advised price and signals per customer environment: pure, so the numbers are testable. */

export type CostPackage = "basis" | "inzicht" | "voorspellen";
export const packageLabel: Record<CostPackage, string> = { basis: "Basis", inzicht: "Inzicht", voorspellen: "Voorspellen" };

export type CostSettings = {
  /** Platform costs per month that do not depend on one customer, shared equally by the active customers. */
  fixedCosts: { label: string; amount: number }[];
  /** Function time plus the database compute running alongside it, per hour of job time. */
  computePerHour: number;
  storagePerGbMonth: number;
  emailPerThousand: number;
  supportRate: number;
  supportHours: Record<CostPackage, number>;
  prices: Record<CostPackage, number>;
  includedProfiles: number;
  extraPer100k: { inzicht: number; voorspellen: number };
  partnerDiscount: number;
};

export const defaultCostSettings: CostSettings = {
  fixedCosts: [
    { label: "Vercel Pro (1 ontwikkelaar)", amount: 19 },
    { label: "Vercel verbruik boven tegoed", amount: 10 },
    { label: "Neon Postgres (betaald plan)", amount: 20 },
    { label: "Resend Pro (e-mail)", amount: 19 },
    { label: "Domein en overig", amount: 5 },
  ],
  computePerHour: 0.25,
  storagePerGbMonth: 0.33,
  emailPerThousand: 0.85,
  supportRate: 75,
  supportHours: { basis: 0.25, inzicht: 0.5, voorspellen: 1 },
  prices: { basis: 49, inzicht: 149, voorspellen: 349 },
  includedProfiles: 100_000,
  extraPer100k: { inzicht: 50, voorspellen: 100 },
  partnerDiscount: 0.4,
};

export type TenantUsage = {
  id: string;
  name: string;
  active: boolean;
  owner: string | null;
  modules: { databaseStats: boolean; campaignStats: boolean; insight: boolean; forecast: boolean };
  /** Profiles the models work with (RFM customers or predicted profiles, whichever is larger). */
  profiles: number;
  storageBytes: number;
  /** Job time per month, extrapolated when there are fewer than 30 days of measurements. */
  jobHoursPerMonth: number;
  measuredDays: number;
  jobFailures: number;
  emailsPerMonth: number;
  lastSyncAt: Date | null;
  lastLoginAt: Date | null;
  rfmReady: boolean;
  predictionsReady: boolean;
  /** Whether a prediction model passed its backtest (null: never calculated). */
  modelPassed: boolean | null;
  hasOrderData: boolean;
};

export function packageFor(modules: TenantUsage["modules"]): CostPackage {
  return modules.forecast ? "voorspellen" : modules.insight ? "inzicht" : "basis";
}

export type CostBreakdown = { storage: number; compute: number; email: number; usage: number; fixed: number; support: number; total: number };

export function costBreakdown(usage: TenantUsage, settings: CostSettings, fixedShare: number): CostBreakdown {
  const storage = (usage.storageBytes / 1e9) * settings.storagePerGbMonth;
  const compute = usage.jobHoursPerMonth * settings.computePerHour;
  const email = (usage.emailsPerMonth / 1000) * settings.emailPerThousand;
  // An inactive customer gets no support; it only keeps its stored data.
  const support = usage.active ? settings.supportHours[packageFor(usage.modules)] * settings.supportRate : 0;
  const fixed = usage.active ? fixedShare : 0;
  const usageCost = storage + compute + email;
  return { storage, compute, email, usage: usageCost, fixed, support, total: usageCost + fixed + support };
}

export type PriceAdvice = { package: CostPackage; base: number; volume: number; total: number; partner: number; note: string | null };

/**
 * The advised monthly price: the package the customer actually gets value from, plus a surcharge per
 * 100,000 profiles above what is included. A module that is switched on but has no results yet (unfinished
 * onboarding), or a prediction model that did not pass its backtest, is not billed ("only pay when it works").
 */
export function advisedPrice(usage: TenantUsage, settings: CostSettings): PriceAdvice {
  let pkg = packageFor(usage.modules);
  let note: string | null = null;
  if (pkg === "voorspellen" && !usage.predictionsReady) {
    pkg = usage.rfmReady ? "inzicht" : "basis";
    note = `Nog geen voorspellingen: ${packageLabel[pkg]}-tarief tot de onboarding af is`;
  } else if (pkg === "voorspellen" && usage.modelPassed === false) {
    pkg = "inzicht";
    note = "Voorspelmodel haalt de toets niet: Inzicht-tarief";
  }
  if (pkg === "inzicht" && !usage.rfmReady) {
    pkg = "basis";
    note = "Nog geen RFM-model: Basis-tarief tot de onboarding af is";
  }
  const extraBlocks = pkg === "basis" ? 0 : Math.ceil(Math.max(0, usage.profiles - settings.includedProfiles) / 100_000);
  const volume = pkg === "basis" ? 0 : extraBlocks * settings.extraPer100k[pkg];
  const base = settings.prices[pkg];
  const total = usage.active ? base + volume : 0;
  return { package: pkg, base, volume, total, partner: Math.round(total * (1 - settings.partnerDiscount)), note };
}

export type Signal = { tone: "critical" | "warning" | "opportunity" | "info"; text: string };

const dayMs = 24 * 60 * 60 * 1000;

/** What a beheerder should act on for this customer, most urgent first. */
export function signalsFor(usage: TenantUsage, cost: CostBreakdown, price: PriceAdvice, settings: CostSettings, now = new Date()): Signal[] {
  const signals: Signal[] = [];
  if (!usage.active) return [{ tone: "info", text: "Inactief: geen factuur, alleen opslagkosten." }];
  const margin = price.total - cost.total;
  if (margin < 0) signals.push({ tone: "critical", text: `Verliesgevend: € ${Math.round(-margin)} per maand onder de kostprijs.` });
  else if (price.total && margin / price.total < 0.3) signals.push({ tone: "warning", text: `Lage marge (${Math.round((margin / price.total) * 100)}%).` });
  const billedAs = `gefactureerd als ${packageLabel[price.package]}`;
  if (usage.modules.insight && !usage.rfmReady) signals.push({ tone: "warning", text: `Inzicht staat aan, maar er is nog geen RFM-model: onboarding afronden (${billedAs}).` });
  if (usage.modules.forecast && !usage.predictionsReady) signals.push({ tone: "warning", text: `Voorspellen staat aan, maar er zijn nog geen voorspellingen: koppel orderregels en draai de eerste berekening (${billedAs}).` });
  // The onboarding warnings above already say what is billed; only the failed model needs its own note.
  if (price.note && usage.modelPassed === false && usage.predictionsReady) signals.push({ tone: "info", text: price.note });
  if (usage.lastSyncAt && now.getTime() - usage.lastSyncAt.getTime() > 2 * dayMs) signals.push({ tone: "warning", text: `Laatste synchronisatie ${Math.floor((now.getTime() - usage.lastSyncAt.getTime()) / dayMs)} dagen geleden.` });
  if (usage.jobFailures > 0) signals.push({ tone: "warning", text: `${usage.jobFailures} mislukte nachtelijke taken in 30 dagen.` });
  if (!usage.lastLoginAt || now.getTime() - usage.lastLoginAt.getTime() > 30 * dayMs) signals.push({ tone: "warning", text: usage.lastLoginAt ? "Al meer dan 30 dagen niet ingelogd: risico op opzegging." : "Nog nooit ingelogd: help de klant op weg." });
  if (usage.hasOrderData && !usage.modules.forecast) signals.push({ tone: "opportunity", text: `Orderdata aanwezig zonder Voorspellen: + € ${settings.prices.voorspellen - settings.prices[packageFor(usage.modules)]} per maand mogelijk.` });
  else if (!usage.modules.insight && !usage.modules.forecast) signals.push({ tone: "opportunity", text: `Alleen Basis: met orderdata kan Inzicht + € ${settings.prices.inzicht - settings.prices.basis} per maand opleveren.` });
  return signals;
}

export type CostRow = { usage: TenantUsage; cost: CostBreakdown; price: PriceAdvice; margin: number; signals: Signal[] };

export function buildCostRows(usages: TenantUsage[], settings: CostSettings, activeCustomers: number, now = new Date()): CostRow[] {
  const fixedTotal = settings.fixedCosts.reduce((sum, item) => sum + item.amount, 0);
  const fixedShare = activeCustomers ? fixedTotal / activeCustomers : 0;
  return usages.map((usage) => {
    const cost = costBreakdown(usage, settings, fixedShare);
    const price = advisedPrice(usage, settings);
    return { usage, cost, price, margin: price.total - cost.total, signals: signalsFor(usage, cost, price, settings, now) };
  }).sort((left, right) => left.margin - right.margin);
}

export type Portfolio = {
  revenue: number;
  partnerRevenue: number;
  cost: number;
  usageCost: number;
  fixedCost: number;
  supportCost: number;
  margin: number;
  marginRate: number | null;
  perPackage: Record<CostPackage, number>;
  upsell: number;
  unrealized: number;
  lossMaking: number;
};

export function portfolio(rows: CostRow[], settings: CostSettings): Portfolio {
  const active = rows.filter((row) => row.usage.active);
  const sum = (pick: (row: CostRow) => number) => rows.reduce((total, row) => total + pick(row), 0);
  const revenue = sum((row) => row.price.total);
  const cost = sum((row) => row.cost.total);
  const perPackage = { basis: 0, inzicht: 0, voorspellen: 0 };
  for (const row of active) perPackage[row.price.package]++;
  return {
    revenue,
    partnerRevenue: sum((row) => row.price.partner),
    cost,
    usageCost: sum((row) => row.cost.usage),
    fixedCost: sum((row) => row.cost.fixed),
    supportCost: sum((row) => row.cost.support),
    margin: revenue - cost,
    marginRate: revenue ? (revenue - cost) / revenue : null,
    perPackage,
    upsell: active.filter((row) => row.usage.hasOrderData && !row.usage.modules.forecast).reduce((total, row) => total + settings.prices.voorspellen - settings.prices[row.price.package], 0),
    unrealized: active.filter((row) => (row.usage.modules.insight && !row.usage.rfmReady) || (row.usage.modules.forecast && !row.usage.predictionsReady)).length,
    lossMaking: active.filter((row) => row.margin < 0).length,
  };
}

/** Saved settings over the defaults, ignoring anything malformed. */
export function readCostSettings(value: unknown): CostSettings {
  const saved = value && typeof value === "object" ? value as Partial<CostSettings> : {};
  const num = (input: unknown, fallback: number) => (typeof input === "number" && Number.isFinite(input) && input >= 0 ? input : fallback);
  const perPackage = (input: unknown, fallback: Record<CostPackage, number>) => {
    const record = input && typeof input === "object" ? input as Record<string, unknown> : {};
    return { basis: num(record.basis, fallback.basis), inzicht: num(record.inzicht, fallback.inzicht), voorspellen: num(record.voorspellen, fallback.voorspellen) };
  };
  const fixed = Array.isArray(saved.fixedCosts)
    ? saved.fixedCosts.filter((item) => item && typeof item.label === "string" && typeof item.amount === "number").map((item) => ({ label: item.label.slice(0, 60), amount: num(item.amount, 0) }))
    : defaultCostSettings.fixedCosts;
  const extra = saved.extraPer100k && typeof saved.extraPer100k === "object" ? saved.extraPer100k : defaultCostSettings.extraPer100k;
  return {
    fixedCosts: fixed,
    computePerHour: num(saved.computePerHour, defaultCostSettings.computePerHour),
    storagePerGbMonth: num(saved.storagePerGbMonth, defaultCostSettings.storagePerGbMonth),
    emailPerThousand: num(saved.emailPerThousand, defaultCostSettings.emailPerThousand),
    supportRate: num(saved.supportRate, defaultCostSettings.supportRate),
    supportHours: perPackage(saved.supportHours, defaultCostSettings.supportHours),
    prices: perPackage(saved.prices, defaultCostSettings.prices),
    includedProfiles: num(saved.includedProfiles, defaultCostSettings.includedProfiles),
    extraPer100k: { inzicht: num(extra.inzicht, defaultCostSettings.extraPer100k.inzicht), voorspellen: num(extra.voorspellen, defaultCostSettings.extraPer100k.voorspellen) },
    partnerDiscount: Math.min(0.9, num(saved.partnerDiscount, defaultCostSettings.partnerDiscount)),
  };
}
