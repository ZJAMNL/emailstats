import { DashboardShell } from "@/components/dashboard-shell";
import { MetricsGrid } from "@/components/metrics-grid";
import { PerformanceChart } from "@/components/performance-chart";
import { SelectionTrendChart } from "@/components/selection-trend-chart";
import { getPrismaClient } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { readTenantDashboardModules } from "@/lib/tenant-settings";

export const dynamic = "force-dynamic";

export default async function CustomerDashboard() {
  const session = await requireRole("customer");
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
  const latestSelectionCount = (selection: (typeof selections)[number]) => selection.snapshots[0]?.profileCount ?? 0;
  const previousSelectionCount = (selection: (typeof selections)[number]) => selection.snapshots[1]?.profileCount ?? latestSelectionCount(selection);
  const totalSelectedProfiles = selections.reduce((total, selection) => total + latestSelectionCount(selection), 0);
  const profileTrend = buildSelectionTotalSeries(selections);
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
            <div className="panel-heading"><div><p className="eyebrow">Profieldata</p><h2>Totaal van gevolgde selecties</h2></div><span className="tab">{selections.length} selecties</span></div>
            <strong className="selection-total-value">{totalSelectedProfiles.toLocaleString("nl-NL")}</strong>
            <p className="tenant-boundary">Som van de aantallen per selectie. Profielen die in meerdere selecties staan tellen meerdere keren mee.</p>
            <SelectionTrendChart data={profileTrend} selections={[{ id: "total", name: "Totaal", color: "#237a63" }]} />
          </article>
          <article className="panel selection-overview-note">
            <div className="panel-heading"><div><p className="eyebrow">Volgen</p><h2>Jouw selecties</h2></div></div>
            <p>{selections.length} Copernica-selecties zijn actief. De aantallen worden dagelijks bijgewerkt en staan hieronder per selectie uitgesplitst.</p>
            <a className="button button-secondary" href="/dashboard/customer/data">Selecties beheren</a>
          </article>
        </section>
        <section className="selection-widget-grid" aria-label="Profielaantallen per selectie">
          {selections.map((selection) => {
            const current = latestSelectionCount(selection);
            const previous = previousSelectionCount(selection);
            const delta = current - previous;
            return <article className="panel selection-widget" key={selection.id}>
              <div className="panel-heading"><div><p className="eyebrow">Copernica-selectie</p><h2>{selection.name}</h2></div><span className="selection-widget-dot" /></div>
              <strong className="selection-widget-value">{current.toLocaleString("nl-NL")}</strong>
              <p className={delta < 0 ? "trend-down selection-widget-delta" : "trend-up selection-widget-delta"}>{delta > 0 ? "+" : ""}{delta.toLocaleString("nl-NL")} sinds vorige meting</p>
              <small className="selection-widget-date">{selection.snapshots[0] ? `Laatst gemeten ${selection.snapshots[0].measuredAt.toLocaleDateString("nl-NL")}` : "Nog geen meting"}</small>
            </article>;
          })}
        </section>
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
        include: { snapshots: { orderBy: { measuredAt: "desc" }, take: 90 } },
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

function buildSelectionTotalSeries(selections: NonNullable<Awaited<ReturnType<typeof loadTenant>>>["selections"]) {
  const totals = new Map<string, number>();
  for (const selection of selections) {
    for (const snapshot of selection.snapshots) {
      const date = snapshot.measuredAt.toISOString().slice(0, 10);
      totals.set(date, (totals.get(date) ?? 0) + snapshot.profileCount);
    }
  }

  return [...totals.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, total]) => ({ date, total }));
}