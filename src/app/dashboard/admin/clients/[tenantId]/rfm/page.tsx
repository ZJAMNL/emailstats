import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { RfmControls } from "@/components/rfm-controls";
import { RfmCohorts, RfmHeatmap, RfmKpis, RfmPrediction, RfmQuality, RfmSegmentTable, RfmShifts } from "@/components/rfm-overview";
import { RfmSetup } from "@/components/rfm-setup";
import { RfmWriteBack } from "@/components/rfm-writeback";
import { listMissingRfmFields, type WriteBackSummary } from "@/lib/rfm/writeback";
import { SelectionTrendChart } from "@/components/selection-trend-chart";
import { getPrismaClient } from "@/lib/prisma";
import { buildRfmMonthlyChange, buildRfmTrend, loadRfmSnapshots } from "@/lib/rfm/history";
import { loadMigrationMatrix, settingsFromConfig, type RfmRunSummary } from "@/lib/rfm/run";
import { rfmSegments } from "@/lib/rfm/segments";
import { requireTenantAdmin } from "@/lib/admin-access";

export const dynamic = "force-dynamic";
// Calculations fetch every order from Copernica and can take a while for large databases.
export const maxDuration = 300;

export default async function AdminClientRfm({ params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  if (!process.env.DATABASE_URL) notFound();
  await requireTenantAdmin(tenantId);

  const prisma = getPrismaClient();
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true, name: true, copernica: { select: { databaseId: true } }, rfmConfig: true } });
  if (!tenant) notFound();

  const config = tenant.rfmConfig;
  const summary = config?.enabled && config.lastRunSummary ? config.lastRunSummary as unknown as RfmRunSummary : null;
  const [snapshots, shifts, missingFields] = summary ? await Promise.all([
    loadRfmSnapshots(tenantId),
    loadMigrationMatrix(tenantId),
    listMissingRfmFields(tenantId).catch(() => null),
  ]) : [[], [], null];

  const trendData = buildRfmTrend(snapshots);
  const trends = buildRfmMonthlyChange(snapshots);
  const back = <Link className="button button-secondary" href={`/dashboard/admin/clients/${tenant.id}`}><ArrowLeft size={16} /> Terug naar {tenant.name}</Link>;

  return (
    <DashboardShell role="admin" title={`Klantwaarde · ${tenant.name}`} subtitle="RFM-model op basis van orderdata uit Copernica: wie zijn je beste klanten, wie dreig je te verliezen en wat is je database waard?">
      <div className="detail-toolbar">{back}{config?.enabled ? <RfmControls customerVisible={config.customerVisible} tenantId={tenant.id} /> : null}</div>

      {!tenant.copernica ? <section className="panel table-panel"><p className="empty-state">Koppel eerst Copernica voor deze klant. Daarna kun je het RFM-model instellen.</p></section> : null}

      {config?.enabled && config.lastRunStatus && config.lastRunStatus !== "ok" ? <p className="form-error" role="alert">De laatste berekening ({config.lastRunAt?.toLocaleString("nl-NL")}) is mislukt: {config.lastRunStatus}</p> : null}

      {summary ? <>
        <p className="rfm-meta">Laatst berekend op {new Date(summary.ranAt).toLocaleString("nl-NL")} · collectie {config?.collectionName} · venster {summary.settings.windowMonths} maanden{config?.customerVisible ? " · zichtbaar voor de klant" : ""}</p>
        <RfmKpis summary={summary} />
        <section className="panel-grid two-columns">
          <article className="panel"><div className="panel-heading"><div><p className="eyebrow">Verdeling</p><h2>Recency × frequentie en besteding</h2></div></div><RfmHeatmap grid={summary.grid} /></article>
          <article className="panel"><div className="panel-heading"><div><p className="eyebrow">Deze maand</p><h2>Grootste verschuivingen</h2></div></div><RfmShifts shifts={shifts} /></article>
        </section>
        <section className="panel table-panel"><div className="panel-heading"><div><p className="eyebrow">Segmenten</p><h2>Waarde en aanpak per segment</h2></div></div><RfmSegmentTable summary={summary} trends={trends} /></section>
        <section className="panel table-panel"><div className="panel-heading"><div><p className="eyebrow">Vooruitkijken</p><h2>Voorspelde klantwaarde</h2></div></div><RfmPrediction summary={summary} /></section>
        <section className="panel table-panel"><div className="panel-heading"><div><p className="eyebrow">Cohortanalyse</p><h2>Hoe houden we nieuwe klanten vast?</h2></div></div><RfmCohorts summary={summary} /></section>
        <section className="panel table-panel"><div className="panel-heading"><div><p className="eyebrow">Ontwikkeling</p><h2>Klanten per segment</h2></div></div><SelectionTrendChart data={trendData} selections={rfmSegments.map((segment) => ({ id: segment.key, name: segment.label, color: segment.color }))} storageKey={`rfm-chart-hidden:${tenant.id}`} /></section>
        <section className="panel table-panel" id="copernica"><div className="panel-heading"><div><p className="eyebrow">Copernica</p><h2>Terugschrijven als kenmerk</h2></div></div><RfmWriteBack enabled={config!.writeBackEnabled} lastWrite={config!.lastWriteSummary as unknown as WriteBackSummary | null} missingFields={missingFields} tenantId={tenant.id} /></section>
        <section className="panel table-panel"><div className="panel-heading"><div><p className="eyebrow">Datakwaliteit</p><h2>Gebruikte gegevens en aannames</h2></div></div><RfmQuality summary={summary} /></section>
      </> : null}

      {tenant.copernica ? <section className="panel table-panel">
        {summary ? <details className="rfm-settings"><summary>Model aanpassen</summary><RfmSetup initial={{ ...settingsFromConfig(config!), collectionName: config!.collectionName, customerVisible: config!.customerVisible }} tenantId={tenant.id} /></details> : <>
          <div className="panel-heading"><div><p className="eyebrow">Instellen</p><h2>RFM-model instellen</h2></div></div>
          <p className="rfm-intro">RFM verdeelt klanten in segmenten op basis van hoe <strong>recent</strong> (R), hoe <strong>vaak</strong> (F) en voor <strong>hoeveel</strong> (M) ze kochten. Zo zie je wie je kampioenen zijn, wie je dreigt te verliezen en wat je database waard is.</p>
          <RfmSetup initial={config ? { ...settingsFromConfig(config), collectionName: config.collectionName, customerVisible: config.customerVisible } : null} tenantId={tenant.id} />
        </>}
      </section> : null}
    </DashboardShell>
  );
}
