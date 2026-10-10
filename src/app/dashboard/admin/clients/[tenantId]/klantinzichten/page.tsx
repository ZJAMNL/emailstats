import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { InsightsOverviewView } from "@/components/insights-overview";
import { requireTenantAdmin } from "@/lib/admin-access";
import { loadInsightsOverview } from "@/lib/insights/overview";
import { getPrismaClient } from "@/lib/prisma";
import { readTenantDashboardModules } from "@/lib/tenant-settings";

export const dynamic = "force-dynamic";

export default async function AdminClientInsights({ params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  if (!process.env.DATABASE_URL) notFound();
  await requireTenantAdmin(tenantId);
  const tenant = await getPrismaClient().tenant.findUnique({ where: { id: tenantId }, select: { id: true, name: true, settings: true } });
  if (!tenant) notFound();

  const visible = readTenantDashboardModules(tenant.settings).insights;
  const overview = await loadInsightsOverview(tenantId);
  return (
    <DashboardShell role="admin" title={`Klantinzichten · ${tenant.name}`} subtitle="Zo ziet de klant deze pagina. De cijfers zijn dezelfde als in de Copernica-collectie Klantinzichten.">
      <div className="detail-toolbar"><Link className="button button-secondary" href={`/dashboard/admin/clients/${tenant.id}`}><ArrowLeft size={16} /> Terug naar {tenant.name}</Link></div>
      <p className={visible ? "form-success" : "rfm-hint"} role="status">{visible ? "Deze pagina is zichtbaar in de klantomgeving." : "Deze pagina is nog niet zichtbaar voor de klant. Zet ‘Klantinzichten’ aan bij Statistieken voor deze klant."}</p>
      {overview ? <InsightsOverviewView overview={overview} /> : <section className="panel table-panel"><p className="empty-state">Nog geen klantinzichten: stel het <Link href={`/dashboard/admin/clients/${tenant.id}/rfm`}>RFM-model</Link> of de <Link href={`/dashboard/admin/clients/${tenant.id}/voorspellingen`}>voorspellingen</Link> in.</p></section>}
    </DashboardShell>
  );
}
