import { notFound } from "next/navigation";
import { DashboardShell } from "@/components/dashboard-shell";
import { InsightsOverviewView } from "@/components/insights-overview";
import { loadInsightsOverview } from "@/lib/insights/overview";
import { requireRole } from "@/lib/session";
import { getTenantDashboardModules } from "@/lib/tenant-settings";
import { requireTenantManager } from "@/lib/webshops";

export const dynamic = "force-dynamic";
export const metadata = { title: "Klantinzichten" };

export default async function CustomerInsights() {
  const session = await requireRole("customer");
  if (!process.env.DATABASE_URL) notFound();
  // The insights cover the whole database, so they stay with users who may see every webshop.
  if (!(await requireTenantManager(session))) notFound();
  if (!(await getTenantDashboardModules(session.tenantId)).insights) notFound();

  const overview = await loadInsightsOverview(session.tenantId);
  return (
    <DashboardShell role="customer" title="Klantinzichten" subtitle="Wie je klanten zijn, wie nu wil kopen en waar ze in geïnteresseerd zijn: per profiel ook beschikbaar in Copernica.">
      {overview ? <InsightsOverviewView overview={overview} /> : <section className="panel table-panel"><p className="empty-state">De klantinzichten worden nog voorbereid. Zodra de eerste berekening klaar is, verschijnen ze hier.</p></section>}
    </DashboardShell>
  );
}
