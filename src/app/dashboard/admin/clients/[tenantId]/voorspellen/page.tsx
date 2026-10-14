import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { ForecastView } from "@/components/forecast-view";
import { ForecastWriteBack } from "@/components/forecast-writeback";
import { PredictRunControls } from "@/components/predict-controls";
import { PredictReport } from "@/components/predict-report";
import { PredictionOutcomes } from "@/components/prediction-outcomes";
import { PredictSetup } from "@/components/predict-setup";
import { ShowMore } from "@/components/show-more";
import { requireTenantAdmin } from "@/lib/admin-access";
import { furtherPredictions } from "@/lib/predict/advice";
import { loadForecastOverview } from "@/lib/predict/advice-data";
import type { ForecastWriteSummary } from "@/lib/predict/orders-writer";
import { loadOutcomeReport } from "@/lib/predict/outcomes";
import { getPrismaClient } from "@/lib/prisma";
import { readTenantDashboardModules } from "@/lib/tenant-settings";

export const dynamic = "force-dynamic";
// Calculations fetch every order line and web event from Copernica and can take a while.
export const maxDuration = 300;

export default async function AdminClientForecast({ params, searchParams }: { params: Promise<{ tenantId: string }>; searchParams: Promise<{ alleen?: string }> }) {
  const { tenantId } = await params;
  const sentOnly = (await searchParams).alleen === "copernica";
  if (!process.env.DATABASE_URL) notFound();
  await requireTenantAdmin(tenantId);

  const tenant = await getPrismaClient().tenant.findUnique({ where: { id: tenantId }, select: { id: true, name: true, settings: true, copernica: { select: { databaseId: true } }, rfmConfig: { select: { collectionId: true, collectionName: true } }, predictionConfig: true } });
  if (!tenant) notFound();
  const config = tenant.predictionConfig;
  const [overview, outcomes] = await Promise.all([loadForecastOverview(tenantId), loadOutcomeReport(tenantId, { sentOnly })]);
  const visible = readTenantDashboardModules(tenant.settings).forecast;
  const initial = config ? {
    lineCollectionId: config.lineCollectionId, lineCollectionName: config.lineCollectionName, lineOrderField: config.lineOrderField, orderKeyField: config.orderKeyField,
    lineProductField: config.lineProductField, lineNameField: config.lineNameField ?? "", lineCategoryField: config.lineCategoryField ?? "",
    webCollectionId: config.webCollectionId ?? "", webCollectionName: config.webCollectionName ?? "", webDateField: config.webDateField ?? "",
    webProductField: config.webProductField ?? "", webCategoryField: config.webCategoryField ?? "", webEventField: config.webEventField ?? "",
  } : null;
  const setup = tenant.rfmConfig ? <PredictSetup initial={initial} orderCollection={{ id: tenant.rfmConfig.collectionId, name: tenant.rfmConfig.collectionName }} tenantId={tenant.id} /> : null;
  const report = overview?.report;
  const verdicts = report ? [report.buyers, report.prospects].map((part, index) => `${index ? "prospects" : "kopers"} ${part.status === "ok" ? part.verdict : "niet te bepalen"}`).concat(`aanbevelingen ${report.recommendations.verdict}`).join(" · ") : "";

  return (
    <DashboardShell role="admin" title={`Voorspellen en advies · ${tenant.name}`} subtitle="Verwachte omzet en productgroepen, wie wanneer gaat bestellen en wat je ermee kunt.">
      <div className="detail-toolbar"><Link className="button button-secondary" href={`/dashboard/admin/clients/${tenant.id}`}><ArrowLeft size={16} /> Terug naar {tenant.name}</Link>{config?.enabled ? <PredictRunControls tenantId={tenant.id} /> : null}</div>
      {!tenant.copernica ? <section className="panel table-panel"><p className="empty-state">Koppel eerst Copernica voor deze klant.</p></section>
        : !tenant.rfmConfig ? <section className="panel table-panel"><p className="empty-state">Stel eerst het RFM-model in onder <Link href={`/dashboard/admin/clients/${tenant.id}/inzicht`}>Inzicht</Link>: daar staat de koppeling met de orders, waar de voorspellingen op voortbouwen.</p></section> : null}
      {config?.enabled && config.lastRunStatus && config.lastRunStatus !== "ok" ? <p className="form-error" role="alert">De laatste berekening ({config.lastRunAt?.toLocaleString("nl-NL")}) is mislukt: {config.lastRunStatus}</p> : null}

      {overview && report ? <>
        <p className="rfm-meta">Laatst berekend op {new Date(report.ranAt).toLocaleString("nl-NL")} · {visible ? "zichtbaar voor de klant" : "nog niet zichtbaar voor de klant (zet ‘Voorspellen en advies’ aan bij de klant)"}</p>
        <ForecastView overview={overview} />
        <PredictionOutcomes hrefs={{ all: `/dashboard/admin/clients/${tenant.id}/voorspellen`, sent: `/dashboard/admin/clients/${tenant.id}/voorspellen?alleen=copernica` }} report={outcomes} sentOnly={sentOnly} />

        <section className="panel table-panel" id="copernica">
          <div className="panel-heading"><div><p className="eyebrow">Copernica</p><h2>Verwachte bestellingen naar Copernica</h2></div></div>
          <ForecastWriteBack enabled={config!.writeBackEnabled} initial={{ collectionId: config!.forecastCollectionId ?? "", collectionName: config!.forecastCollectionName ?? "", dateField: config!.forecastDateField ?? "", skuField: config!.forecastSkuField ?? "", nameField: config!.forecastNameField ?? "", categoryField: config!.forecastCategoryField ?? "", chanceField: config!.forecastChanceField ?? "", records: config!.forecastRecords, scope: config!.forecastScope }} lastWrite={config!.forecastWriteSummary as unknown as ForecastWriteSummary | null} tenantId={tenant.id} />
        </section>

        <section className="panel table-panel">
          <div className="panel-heading"><div><p className="eyebrow">Betrouwbaarheid</p><h2>Hoe goed voorspellen de modellen?</h2></div></div>
          <p>Getoetst op de eigen gegevens van deze klant: {verdicts}.</p>
          <ShowMore><PredictReport summary={report} /></ShowMore>
        </section>

        <section className="panel table-panel">
          <div className="panel-heading"><div><p className="eyebrow">Volgende stap</p><h2>Wat kunnen we nog meer voorspellen?</h2></div></div>
          <div className="further-predictions">
            {furtherPredictions.map((idea) => <article key={idea.title}><strong>{idea.title}</strong><p>{idea.value}</p><small>Nodig: {idea.needs}</small></article>)}
          </div>
        </section>
      </> : null}

      {setup ? <section className="panel table-panel">
        {report ? <details className="rfm-settings"><summary>Koppeling met orderregels en webtracking aanpassen</summary>{setup}</details> : <>
          <div className="panel-heading"><div><p className="eyebrow">Instellen</p><h2>Voorspellingen instellen</h2></div></div>
          <p className="rfm-intro">Koppel de collectie met bestelde producten en, als die er is, de webtracking. We toetsen eerst op de eigen gegevens van deze klant of de modellen echt voorspellen.</p>
          {setup}
        </>}
      </section> : null}
    </DashboardShell>
  );
}
