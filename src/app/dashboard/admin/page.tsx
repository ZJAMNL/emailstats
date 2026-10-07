import { Activity, CreditCard, Sparkles, Users } from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { MetricsGrid } from "@/components/metrics-grid";
import { PerformanceChart } from "@/components/performance-chart";
import { overviewMetrics, tenantOverview } from "@/lib/dashboard-data";
import { requireRole } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
  await requireRole("admin");

  return (
    <DashboardShell role="admin" title="Platformoverzicht" subtitle="Alles wat je als beheerder moet weten over de emailomgeving.">
      <MetricsGrid metrics={overviewMetrics.platform} />
      <section className="panel-grid two-columns">
        <PerformanceChart />
        <article className="panel stats-panel">
          <div className="panel-heading"><div><p className="eyebrow">Prestaties</p><h2>Actieve prioriteiten</h2></div></div>
          <div className="priority-list"><div><Sparkles size={18} /><div><strong>Automatisering</strong><span>6 workflows klaar voor uitbreiding.</span></div></div><div><Activity size={18} /><div><strong>Deliverability</strong><span>94.8% en stijgende trend.</span></div></div><div><CreditCard size={18} /><div><strong>Revenue tracking</strong><span>€68.4K gecorreleerd met campagneacties.</span></div></div></div>
        </article>
      </section>
      <section className="panel table-panel">
        <div className="panel-heading"><div><p className="eyebrow">Klanten</p><h2>Tenant-overzicht</h2></div><span className="tab">3 actieve klanten</span></div>
        <div className="table-wrap"><table><thead><tr><th>Klant</th><th>Eigenaar</th><th>Verzonden</th><th>CTR</th><th>Health</th></tr></thead><tbody>{tenantOverview.map((tenant) => <tr key={tenant.id}><td><div className="tenant-name"><Users size={16} />{tenant.name}</div></td><td>{tenant.owner}</td><td>{tenant.delivered.toLocaleString("nl-NL")}</td><td>{tenant.ctr}%</td><td><span className="status-badge status-good">{tenant.health}</span></td></tr>)}</tbody></table></div>
      </section>
    </DashboardShell>
  );
}
