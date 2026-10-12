import { notFound } from "next/navigation";
import { DashboardShell } from "@/components/dashboard-shell";
import { InsightView } from "@/components/insight-view";
import { loadRfmResult, loadRfmSnapshots } from "@/lib/rfm/history";
import { loadMigrationMatrix } from "@/lib/rfm/run";
import { requireRole } from "@/lib/session";
import { getTenantDashboardModules } from "@/lib/tenant-settings";
import { requireTenantManager } from "@/lib/webshops";

export const dynamic = "force-dynamic";
export const metadata = { title: "Inzicht" };

export default async function CustomerInsight() {
  const session = await requireRole("customer");
  if (!process.env.DATABASE_URL) notFound();
  // Calculated over the whole database, so it stays with users who may see every webshop.
  if (!(await requireTenantManager(session))) notFound();
  if (!(await getTenantDashboardModules(session.tenantId)).insight) notFound();
  const { summary } = await loadRfmResult(session.tenantId);
  const [snapshots, shifts] = summary ? await Promise.all([loadRfmSnapshots(session.tenantId), loadMigrationMatrix(session.tenantId)]) : [[], []];

  return (
    <DashboardShell role="customer" title="Inzicht" subtitle="Wie je klanten zijn, wat ze waard zijn en hoe ze zich ontwikkelen.">
      {summary ? <>
        <p className="rfm-meta">Laatst bijgewerkt op {new Date(summary.ranAt).toLocaleString("nl-NL")}</p>
        <InsightView chartKey={`customer-rfm-chart-hidden:${session.tenantId}`} shifts={shifts} snapshots={snapshots} summary={summary} />
      </> : <section className="panel table-panel"><p className="empty-state">Het inzicht wordt nog voorbereid. Zodra de eerste berekening klaar is, verschijnt het hier.</p></section>}
    </DashboardShell>
  );
}
