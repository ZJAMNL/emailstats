import { DashboardShell } from "@/components/dashboard-shell";
import { MetricsGrid } from "@/components/metrics-grid";
import { PerformanceChart } from "@/components/performance-chart";
import { campaigns, overviewMetrics } from "@/lib/dashboard-data";
import { requireRole } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function CustomerDashboard() {
  const session = await requireRole("customer");

  return (
    <DashboardShell role="customer" title="Northwind B.V." subtitle="Persoonlijk overzicht van je e-mailmarketingprestaties.">
      <MetricsGrid metrics={overviewMetrics.northwind} />
      <section className="panel-grid two-columns"><PerformanceChart /><article className="panel"><div className="panel-heading"><div><p className="eyebrow">Topsegment</p><h2>Beste performende campagne</h2></div></div><div className="campaign-highlight"><strong>Nieuwe collectie</strong><p>7.9% CTR met een economische bijdrage van €5.1K.</p><div className="mini-metrics"><span><b>28.8K</b><small>Openingen</small></span><span><b>4.9K</b><small>Clicks</small></span></div></div></article></section>
      <section className="panel table-panel"><div className="panel-heading"><div><p className="eyebrow">Campagnes</p><h2>Je campagneportfolio</h2></div><span className="tab">{campaigns.northwind.length} actief</span></div><div className="table-wrap"><table><thead><tr><th>Campagne</th><th>Verzonden</th><th>Openingen</th><th>CTR</th><th>Bijdrage</th><th>Status</th></tr></thead><tbody>{campaigns.northwind.map((campaign) => <tr key={campaign.name}><td>{campaign.name}</td><td>{campaign.delivered.toLocaleString("nl-NL")}</td><td>{campaign.opens.toLocaleString("nl-NL")}</td><td>{Math.round((campaign.clicks / campaign.delivered) * 1000) / 10}%</td><td>{campaign.revenue}</td><td><span className={`status-badge status-${campaign.status}`}>{campaign.status}</span></td></tr>)}</tbody></table></div></section>
      <p className="tenant-boundary">Je ziet alleen data voor {session.tenantId}. Deze tenantbinding geldt voor alle dashboardroutes.</p>
    </DashboardShell>
  );
}
