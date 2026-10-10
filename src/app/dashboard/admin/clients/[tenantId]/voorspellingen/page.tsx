import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { PredictReport } from "@/components/predict-report";
import { PredictRunControls, PredictWriteBack } from "@/components/predict-controls";
import { PredictSetup } from "@/components/predict-setup";
import { requireTenantAdmin } from "@/lib/admin-access";
import { isWriteBackAllowed } from "@/lib/predict/model";
import type { PredictionRunSummary } from "@/lib/predict/run";
import { listMissingPredictionFields } from "@/lib/predict/writeback";
import { getPrismaClient } from "@/lib/prisma";
import type { WriteBackSummary } from "@/lib/rfm/writeback";

export const dynamic = "force-dynamic";
// Calculations fetch every order line and web event from Copernica and can take a while.
export const maxDuration = 300;

export default async function AdminClientPredictions({ params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  if (!process.env.DATABASE_URL) notFound();
  await requireTenantAdmin(tenantId);

  const tenant = await getPrismaClient().tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, name: true, copernica: { select: { databaseId: true } }, rfmConfig: { select: { collectionId: true, collectionName: true } }, predictionConfig: true },
  });
  if (!tenant) notFound();

  const config = tenant.predictionConfig;
  const summary = config?.enabled && config.lastRunSummary ? config.lastRunSummary as unknown as PredictionRunSummary : null;
  const missingFields = summary ? await listMissingPredictionFields(tenantId).catch(() => null) : null;
  const back = <Link className="button button-secondary" href={`/dashboard/admin/clients/${tenant.id}`}><ArrowLeft size={16} /> Terug naar {tenant.name}</Link>;
  const initial = config ? {
    lineCollectionId: config.lineCollectionId, lineCollectionName: config.lineCollectionName, lineOrderField: config.lineOrderField, orderKeyField: config.orderKeyField,
    lineProductField: config.lineProductField, lineNameField: config.lineNameField ?? "", lineCategoryField: config.lineCategoryField ?? "",
    webCollectionId: config.webCollectionId ?? "", webCollectionName: config.webCollectionName ?? "", webDateField: config.webDateField ?? "",
    webProductField: config.webProductField ?? "", webCategoryField: config.webCategoryField ?? "", webEventField: config.webEventField ?? "",
  } : null;
  const setup = tenant.rfmConfig ? <PredictSetup initial={initial} orderCollection={{ id: tenant.rfmConfig.collectionId, name: tenant.rfmConfig.collectionName }} tenantId={tenant.id} /> : null;

  return (
    <DashboardShell role="admin" title={`Voorspellingen · ${tenant.name}`} subtitle="Koopkans, volgende categorie en productaanbevelingen op basis van bestelde producten en websitegedrag, per klant getoetst op echte uitkomsten.">
      <div className="detail-toolbar">{back}{config?.enabled ? <PredictRunControls tenantId={tenant.id} /> : null}</div>

      {!tenant.copernica ? <section className="panel table-panel"><p className="empty-state">Koppel eerst Copernica voor deze klant.</p></section>
        : !tenant.rfmConfig ? <section className="panel table-panel"><p className="empty-state">Stel eerst het <Link href={`/dashboard/admin/clients/${tenant.id}/rfm`}>RFM-model</Link> in: daar staat de koppeling met de orders, waar de voorspellingen op voortbouwen.</p></section> : null}

      {config?.enabled && config.lastRunStatus && config.lastRunStatus !== "ok" ? <p className="form-error" role="alert">De laatste berekening ({config.lastRunAt?.toLocaleString("nl-NL")}) is mislukt: {config.lastRunStatus}</p> : null}

      {summary ? <>
        <p className="rfm-meta">Laatst berekend op {new Date(summary.ranAt).toLocaleString("nl-NL")} · orderregels uit {config?.lineCollectionName}{config?.webCollectionName ? ` · webtracking uit ${config.webCollectionName}` : " · zonder webtracking"}</p>
        <PredictReport summary={summary} />
        <section className="panel table-panel" id="copernica"><div className="panel-heading"><div><p className="eyebrow">Copernica</p><h2>Terugschrijven als kenmerk</h2></div></div><PredictWriteBack allowed={isWriteBackAllowed(summary)} enabled={config!.writeBackEnabled} lastWrite={config!.lastWriteSummary as unknown as WriteBackSummary | null} missingFields={missingFields} tenantId={tenant.id} /></section>
      </> : null}

      {setup ? <section className="panel table-panel">
        {summary ? <details className="rfm-settings"><summary>Koppeling aanpassen</summary>{setup}</details> : <>
          <div className="panel-heading"><div><p className="eyebrow">Instellen</p><h2>Voorspellende modellen instellen</h2></div></div>
          <p className="rfm-intro">Koppel de collectie met bestelde producten en, als die er is, de webtracking. We toetsen eerst op de eigen gegevens van deze klant of de modellen echt voorspellen: alleen wat de toets haalt, kun je terugschrijven naar Copernica.</p>
          {setup}
        </>}
      </section> : null}
    </DashboardShell>
  );
}
