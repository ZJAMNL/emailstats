import Link from "next/link";
import { DashboardShell } from "@/components/dashboard-shell";
import { MetricsGrid } from "@/components/metrics-grid";
import { PerformanceChart } from "@/components/performance-chart";
import { SelectionTrendChart } from "@/components/selection-trend-chart";
import { getPrismaClient } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { SelectionWidgetGrid, type SelectionWidgetData } from "@/components/selection-widget-grid";
import { readSelectionRatios, readSelectionWidgetSettings, readTenantDashboardModules } from "@/lib/tenant-settings";

export const dynamic = "force-dynamic";

const comparePeriods = {
  dag: { label: "Dag", days: 1, since: "gisteren" },
  week: { label: "Week", days: 7, since: "vorige week" },
  maand: { label: "Maand", days: 30, since: "vorige maand" },
  jaar: { label: "Jaar", days: 365, since: "vorig jaar" },
} as const;
type ComparePeriod = keyof typeof comparePeriods;
const chartRanges = {
  "3m": { label: "3 maanden", days: 91 },
  "1j": { label: "1 jaar", days: 366 },
  alles: { label: "Alles", days: null },
} as const;
type ChartRange = keyof typeof chartRanges;
const defaultChartRange: ChartRange = "1j";
const dayMs = 24 * 60 * 60 * 1000;
const chartColors = ["#237a63", "#b05b3b", "#356ba5", "#94702c", "#875891", "#4c7878", "#a8456b", "#5f7a2e"];

type CustomerDashboardProps = {
  searchParams: Promise<{ vergelijk?: string; bereik?: string }>;
};

export default async function CustomerDashboard({ searchParams }: CustomerDashboardProps) {
  const session = await requireRole("customer");
  const { vergelijk, bereik } = await searchParams;
  const chartRange: ChartRange = bereik && bereik in chartRanges ? bereik as ChartRange : defaultChartRange;
  const period: ComparePeriod = vergelijk && vergelijk in comparePeriods ? vergelijk as ComparePeriod : "dag";
  let tenant: Awaited<ReturnType<typeof loadTenant>> = null;
  let databaseUnavailable = false;

  if (process.env.DATABASE_URL) {
    try {
      tenant = await loadTenant(session.tenantId);
    } catch {
      databaseUnavailable = true;
    }
  } else {
    databaseUnavailable = true;
  }

  const campaigns = tenant?.campaigns ?? [];
  const sent = campaigns.reduce((total, campaign) => total + campaign.sentCount, 0);
  const opens = campaigns.reduce((total, campaign) => total + campaign.openCount, 0);
  const clicks = campaigns.reduce((total, campaign) => total + campaign.clickCount, 0);
  const openRate = sent ? (opens / sent) * 100 : 0;
  const clickRate = sent ? (clicks / sent) * 100 : 0;
  const chartData = buildMonthlySeries(campaigns);
  const dashboardModules = readTenantDashboardModules(tenant?.settings);
  const visibleCampaigns = dashboardModules.campaignStats ? campaigns : [];
  const selections = dashboardModules.databaseStats ? tenant?.selections ?? [] : [];
  const selectionRatios = readSelectionRatios(tenant?.settings);
  const widgetSettings = readSelectionWidgetSettings(tenant?.settings);
  const excludedFromTotal = new Set(widgetSettings.excludedFromTotal);
  const selectionsById = new Map(selections.map((selection) => [selection.id, selection]));
  const displayName = (selection: (typeof selections)[number]) => widgetSettings.labels[selection.id] ?? selection.name;
  const orderedSelections = sortByOrder(selections, widgetSettings.order);
  const totalSelections = orderedSelections.filter((selection) => !excludedFromTotal.has(selection.id));
  const totalSeries = totalSelections.map((selection, index) => ({ id: selection.id, name: displayName(selection), color: chartColors[index % chartColors.length] }));
  const latestSelectionCount = (selection: (typeof selections)[number]) => selection.snapshots[0]?.profileCount ?? 0;
  const totalSelectedProfiles = totalSelections.reduce((total, selection) => total + latestSelectionCount(selection), 0);
  const profileTrend = buildSelectionSeries(totalSelections, chartRanges[chartRange].days);
  const dashboardHref = (next: { period?: ComparePeriod; range?: ChartRange }) => {
    const params = new URLSearchParams();
    const nextPeriod = next.period ?? period;
    const nextRange = next.range ?? chartRange;
    if (nextPeriod !== "dag") params.set("vergelijk", nextPeriod);
    if (nextRange !== defaultChartRange) params.set("bereik", nextRange);
    return params.size ? `/dashboard/customer?${params}` : "/dashboard/customer";
  };
  const selectionWidgets: SelectionWidgetData[] = orderedSelections.map((selection) => {
    const current = latestSelectionCount(selection);
    const comparison = compareSnapshot(selection.snapshots, comparePeriods[period].days);
    const delta = comparison ? current - comparison.profileCount : null;
    const percentage = comparison && delta !== null && comparison.profileCount ? (delta / comparison.profileCount) * 100 : null;
    const base = selectionsById.get(selectionRatios[selection.id] ?? "");
    const ratio = base ? selectionRatio(selection.snapshots, base.snapshots, 0) : null;
    return {
      id: selection.id,
      name: displayName(selection),
      copernicaName: selection.name,
      value: current.toLocaleString("nl-NL"),
      delta: delta === null || !comparison
        ? { text: `Nog geen meting van ${comparePeriods[period].since}`, tone: "empty" }
        : {
          text: `${delta > 0 ? "+" : ""}${delta.toLocaleString("nl-NL")}${percentage !== null ? ` (${delta > 0 ? "+" : ""}${percentage.toLocaleString("nl-NL", { maximumFractionDigits: 1 })}%)` : ""} sinds ${comparison.approximate ? comparison.measuredAt.toLocaleDateString("nl-NL") : comparePeriods[period].since}`,
          tone: delta > 0 ? "up" : delta < 0 ? "down" : "flat",
        },
      ratio: base ? {
        percent: ratio === null ? "—" : formatPercent(ratio),
        baseName: displayName(base),
        periods: (Object.keys(comparePeriods) as ComparePeriod[]).map((key) => {
          const past = ratio === null ? null : selectionRatio(selection.snapshots, base.snapshots, comparePeriods[key].days);
          const points = past === null || ratio === null ? null : ratio - past;
          return {
            key,
            label: comparePeriods[key].label,
            active: key === period,
            text: points === null ? "—" : `${points > 0 ? "+" : ""}${points.toLocaleString("nl-NL", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} pt`,
            tone: points === null ? "empty" : points > 0.05 ? "up" : points < -0.05 ? "down" : "flat",
          };
        }),
      } : null,
      lastMeasured: selection.snapshots[0] ? `Laatst gemeten ${selection.snapshots[0].measuredAt.toLocaleDateString("nl-NL")}` : "Nog geen meting",
      baseSelectionId: base?.id ?? null,
      includeInTotal: !excludedFromTotal.has(selection.id),
    };
  });
  const metrics = [
    { label: "Verzonden e-mails", value: sent.toLocaleString("nl-NL"), delta: "totaal", trend: "flat" as const },
    { label: "Open rate", value: `${openRate.toFixed(1)}%`, delta: "gemiddeld", trend: "flat" as const },
    { label: "Click-through rate", value: `${clickRate.toFixed(1)}%`, delta: "gemiddeld", trend: "flat" as const },
    { label: "Campagnes", value: campaigns.length.toLocaleString("nl-NL"), delta: "gesynchroniseerd", trend: "flat" as const },
  ];

  return (
    <DashboardShell role="customer" title={tenant?.name ?? session.name} subtitle="Je e-mailcampagnes en prestaties uit Copernica.">
      {databaseUnavailable ? <p className="form-error" role="status">De klantdatabase is nog niet geconfigureerd. Vraag de beheerder om PostgreSQL in te stellen en te migreren.</p> : null}
      {dashboardModules.campaignStats ? <>
        <MetricsGrid metrics={metrics} />
        <section className="panel-grid two-columns">
          <PerformanceChart data={chartData} />
          <article className="panel"><div className="panel-heading"><div><p className="eyebrow">Databron</p><h2>Copernica-koppeling</h2></div></div><p>{tenant?.copernica ? "Verbonden" : "Nog niet verbonden"}</p><p className="tenant-boundary">De gegevens op dit dashboard zijn alleen voor jouw klantaccount.</p></article>
        </section>
      </> : null}
      {!dashboardModules.campaignStats && !dashboardModules.databaseStats ? <p className="empty-state">De beheerder heeft de statistiekweergaven voor deze klant uitgeschakeld.</p> : null}
      {selections.length > 0 ? <>
        <section className="panel-grid two-columns selection-overview-grid">
          <article className="panel selection-total-panel">
            <div className="panel-heading"><div><p className="eyebrow">Profieldata</p><h2>Totaal van getoonde selecties</h2></div><span className="tab">{totalSelections.length} van {selections.length} selecties</span></div>
            <nav className="segmented-control selection-range-control" aria-label="Periode van de grafiek">
              {(Object.keys(chartRanges) as ChartRange[]).map((key) => <Link aria-current={key === chartRange ? "page" : undefined} href={dashboardHref({ range: key })} key={key} scroll={false}>{chartRanges[key].label}</Link>)}
            </nav>
            <strong className="selection-total-value">{totalSelectedProfiles.toLocaleString("nl-NL")}</strong>
            <SelectionTrendChart data={profileTrend} selections={totalSeries} />
          </article>
          <article className="panel selection-overview-note">
            <div className="panel-heading"><div><p className="eyebrow">Volgen</p><h2>Jouw selecties</h2></div></div>
            <p>{selections.length} Copernica-selecties zijn actief. De aantallen worden dagelijks bijgewerkt en staan hieronder per selectie uitgesplitst.</p>
            <a className="button button-secondary" href="/dashboard/customer/data">Selecties beheren</a>
          </article>
        </section>
        <div className="selection-compare-bar">
          <p>Verschil ten opzichte van</p>
          <nav className="segmented-control" aria-label="Vergelijkingsperiode">
            {(Object.keys(comparePeriods) as ComparePeriod[]).map((key) => <Link aria-current={key === period ? "page" : undefined} href={dashboardHref({ period: key })} key={key} scroll={false}>{comparePeriods[key].label}</Link>)}
          </nav>
        </div>
        <SelectionWidgetGrid widgets={selectionWidgets} />
      </> : tenant?.copernica ? <section className="panel table-panel selection-empty-panel"><p className="eyebrow">Profieldata</p><h2>Nog geen selecties gekozen</h2><p>Kies in Beheer welke Copernica-selecties je op dit dashboard wilt volgen.</p><a className="button button-secondary" href="/dashboard/customer/data">Selecties beheren</a></section> : null}
      {dashboardModules.campaignStats && campaigns.length === 0 && !databaseUnavailable ? <section className="panel table-panel"><p className="empty-state">Nog geen campagnes gesynchroniseerd. Koppel Copernica en synchroniseer een periode via Campagnes.</p></section> : null}
      {dashboardModules.campaignStats ? <section className="panel table-panel"><div className="panel-heading"><div><p className="eyebrow">Campagnes</p><h2>Recent gesynchroniseerd</h2></div><span className="tab">{visibleCampaigns.length} campagnes</span></div>{visibleCampaigns.length > 0 ? <div className="table-wrap"><table><thead><tr><th>Campagne</th><th>Verzonden</th><th>Ontvangers</th><th>Open rate</th><th>CTR</th></tr></thead><tbody>{visibleCampaigns.slice(0, 10).map((campaign) => <tr key={campaign.id}><td>{campaign.name}</td><td>{campaign.sentAt?.toLocaleDateString("nl-NL") ?? "-"}</td><td>{campaign.sentCount.toLocaleString("nl-NL")}</td><td>{campaign.sentCount ? `${((campaign.openCount / campaign.sentCount) * 100).toFixed(1)}%` : "-"}</td><td>{campaign.sentCount ? `${((campaign.clickCount / campaign.sentCount) * 100).toFixed(1)}%` : "-"}</td></tr>)}</tbody></table></div> : null}</section> : null}
      <p className="tenant-boundary">Tenant-id: {session.tenantId}</p>
    </DashboardShell>
  );
}

function loadTenant(tenantId: string) {
  return getPrismaClient().tenant.findUnique({
    where: { id: tenantId },
    include: {
      copernica: true,
      campaigns: {
        orderBy: { sentAt: "desc" },
        take: 1000,
      },
      selections: {
        where: { enabled: true },
        include: { snapshots: { orderBy: { measuredAt: "desc" }, take: 400 } },
        orderBy: { name: "asc" },
      },
    },
  });
}

function buildMonthlySeries(campaigns: NonNullable<Awaited<ReturnType<typeof loadTenant>>>["campaigns"]) {
  const months = Array.from({ length: 6 }, (_, index) => {
    const date = new Date();
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() - (5 - index));
    return { key: `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`, name: new Intl.DateTimeFormat("nl-NL", { month: "short", timeZone: "UTC" }).format(date), delivered: 0, opens: 0 };
  });

  for (const campaign of campaigns) {
    if (!campaign.sentAt) continue;
    const key = campaign.sentAt.toISOString().slice(0, 7);
    const month = months.find((entry) => entry.key === key);
    if (!month) continue;
    month.delivered += campaign.sentCount;
    month.opens += campaign.openCount;
  }

  return months;
}

function compareSnapshot(snapshots: Array<{ measuredAt: Date; profileCount: number }>, days: number) {
  const latest = snapshots[0];
  if (!latest) return null;
  const target = latest.measuredAt.getTime() - days * dayMs;
  const match = snapshots.find((snapshot) => snapshot.measuredAt.getTime() <= target);
  if (!match) return null;
  // Snapshots can be missing on some days; flag comparisons that land more than a day before the target.
  return { ...match, approximate: target - match.measuredAt.getTime() > dayMs };
}

function sortByOrder<T extends { id: string }>(items: T[], order: string[]) {
  const position = new Map(order.map((id, index) => [id, index]));
  return [...items].sort((left, right) => (position.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (position.get(right.id) ?? Number.MAX_SAFE_INTEGER));
}

function snapshotOnOrBefore(snapshots: Array<{ measuredAt: Date; profileCount: number }>, time: number) {
  return snapshots.find((snapshot) => snapshot.measuredAt.getTime() <= time) ?? null;
}

// Share of `part` in `base` (as a percentage) measured `daysAgo` days before the latest measurement of `part`.
function selectionRatio(part: Array<{ measuredAt: Date; profileCount: number }>, base: Array<{ measuredAt: Date; profileCount: number }>, daysAgo: number) {
  const latest = part[0];
  if (!latest) return null;
  const target = latest.measuredAt.getTime() - daysAgo * dayMs;
  const partSnapshot = snapshotOnOrBefore(part, target);
  const baseSnapshot = snapshotOnOrBefore(base, target);
  if (!partSnapshot || !baseSnapshot || baseSnapshot.profileCount === 0) return null;
  // Both measurements must come from roughly the same day to be comparable.
  if (Math.abs(partSnapshot.measuredAt.getTime() - baseSnapshot.measuredAt.getTime()) > dayMs) return null;
  return (partSnapshot.profileCount / baseSnapshot.profileCount) * 100;
}

function formatPercent(value: number) {
  return `${value.toLocaleString("nl-NL", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

function buildSelectionSeries(selections: NonNullable<Awaited<ReturnType<typeof loadTenant>>>["selections"], rangeDays: number | null) {
  const points = new Map<string, { date: string; [selectionId: string]: number | string }>();
  const chartStart = rangeDays === null ? 0 : Date.now() - rangeDays * dayMs;
  for (const selection of selections) {
    for (const snapshot of selection.snapshots) {
      if (snapshot.measuredAt.getTime() < chartStart) continue;
      const date = snapshot.measuredAt.toISOString().slice(0, 10);
      const point = points.get(date) ?? { date };
      point[selection.id] = snapshot.profileCount;
      points.set(date, point);
    }
  }

  return [...points.values()].sort((left, right) => left.date.localeCompare(right.date));
}