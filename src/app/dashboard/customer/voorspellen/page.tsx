import { notFound } from "next/navigation";
import { DashboardShell } from "@/components/dashboard-shell";
import { ForecastView } from "@/components/forecast-view";
import { PredictionOutcomes } from "@/components/prediction-outcomes";
import { loadOutcomeReport } from "@/lib/predict/outcomes";
import { loadForecastOverview } from "@/lib/predict/advice-data";
import { requireRole } from "@/lib/session";
import { getTenantDashboardModules } from "@/lib/tenant-settings";
import { requireTenantManager } from "@/lib/webshops";

export const dynamic = "force-dynamic";
export const metadata = { title: "Voorspellen en advies" };

export default async function CustomerForecast({ searchParams }: { searchParams: Promise<{ alleen?: string }> }) {
  const session = await requireRole("customer");
  const sentOnly = (await searchParams).alleen === "copernica";
  if (!process.env.DATABASE_URL) notFound();
  if (!(await requireTenantManager(session))) notFound();
  if (!(await getTenantDashboardModules(session.tenantId)).forecast) notFound();
  const [overview, outcomes] = await Promise.all([loadForecastOverview(session.tenantId), loadOutcomeReport(session.tenantId, { sentOnly })]);

  return (
    <DashboardShell role="customer" title="Voorspellen en advies" subtitle="Verwachte omzet en productgroepen, wie wanneer gaat bestellen en wat je ermee kunt.">
      {overview ? <>
        <p className="rfm-meta">Laatst bijgewerkt op {new Date(overview.report.ranAt).toLocaleString("nl-NL")}</p>
        <ForecastView overview={overview} />
        <PredictionOutcomes hrefs={{ all: "/dashboard/customer/voorspellen", sent: "/dashboard/customer/voorspellen?alleen=copernica" }} report={outcomes} sentOnly={sentOnly} />
      </> : <section className="panel table-panel"><p className="empty-state">De voorspellingen worden nog voorbereid. Zodra de eerste berekening klaar is, verschijnen ze hier.</p></section>}
    </DashboardShell>
  );
}
