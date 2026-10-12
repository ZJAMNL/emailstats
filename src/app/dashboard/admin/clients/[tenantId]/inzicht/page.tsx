import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { InsightView } from "@/components/insight-view";
import { RfmControls } from "@/components/rfm-controls";
import { RfmQuality } from "@/components/rfm-overview";
import { RfmSetup } from "@/components/rfm-setup";
import { RfmWriteBack } from "@/components/rfm-writeback";
import { ShowMore } from "@/components/show-more";
import { requireTenantAdmin } from "@/lib/admin-access";
import { getPrismaClient } from "@/lib/prisma";
import { loadRfmSnapshots } from "@/lib/rfm/history";
import { loadMigrationMatrix, settingsFromConfig, type RfmRunSummary } from "@/lib/rfm/run";
import { listMissingRfmFields, type WriteBackSummary } from "@/lib/rfm/writeback";
import { readTenantDashboardModules } from "@/lib/tenant-settings";

export const dynamic = "force-dynamic";
// Calculations fetch every order from Copernica and can take a while for large databases.
export const maxDuration = 300;

export default async function AdminClientInsight({ params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  if (!process.env.DATABASE_URL) notFound();
  await requireTenantAdmin(tenantId);

  const tenant = await getPrismaClient().tenant.findUnique({ where: { id: tenantId }, select: { id: true, name: true, settings: true, copernica: { select: { databaseId: true } }, rfmConfig: true } });
  if (!tenant) notFound();
  const config = tenant.rfmConfig;
  const summary = config?.enabled && config.lastRunSummary ? config.lastRunSummary as unknown as RfmRunSummary : null;
  const [snapshots, shifts, missingFields] = summary ? await Promise.all([loadRfmSnapshots(tenantId), loadMigrationMatrix(tenantId), listMissingRfmFields(tenantId).catch(() => null)]) : [[], [], null];
  const visible = readTenantDashboardModules(tenant.settings).insight;
  const setup = config ? { ...settingsFromConfig(config), collectionName: config.collectionName, customerVisible: config.customerVisible } : null;

  return (
    <DashboardShell role="admin" title={`Inzicht · ${tenant.name}`} subtitle="Wie zijn de klanten, wat zijn ze waard en hoe ontwikkelen ze zich? Op basis van de orders in Copernica.">
      <div className="detail-toolbar"><Link className="button button-secondary" href={`/dashboard/admin/clients/${tenant.id}`}><ArrowLeft size={16} /> Terug naar {tenant.name}</Link>{config?.enabled ? <RfmControls tenantId={tenant.id} /> : null}</div>
      {!tenant.copernica ? <section className="panel table-panel"><p className="empty-state">Koppel eerst Copernica voor deze klant. Daarna kun je het RFM-model instellen.</p></section> : null}
      {config?.enabled && config.lastRunStatus && config.lastRunStatus !== "ok" ? <p className="form-error" role="alert">De laatste berekening ({config.lastRunAt?.toLocaleString("nl-NL")}) is mislukt: {config.lastRunStatus}</p> : null}

      {summary ? <>
        <p className="rfm-meta">Laatst berekend op {new Date(summary.ranAt).toLocaleString("nl-NL")} · collectie {config?.collectionName} · venster {summary.settings.windowMonths} maanden · {visible ? "zichtbaar voor de klant" : "nog niet zichtbaar voor de klant (zet ‘Inzicht’ aan bij de klant)"}</p>
        <InsightView chartKey={`rfm-chart-hidden:${tenant.id}`} shifts={shifts} snapshots={snapshots} summary={summary} />
        <section className="panel table-panel" id="copernica"><div className="panel-heading"><div><p className="eyebrow">Copernica</p><h2>RFM naar profielvelden</h2></div></div><RfmWriteBack enabled={config!.writeBackEnabled} lastWrite={config!.lastWriteSummary as unknown as WriteBackSummary | null} missingFields={missingFields} tenantId={tenant.id} /></section>
        <section className="panel table-panel"><div className="panel-heading"><div><p className="eyebrow">Datakwaliteit</p><h2>Gebruikte gegevens en aannames</h2></div></div><ShowMore><RfmQuality summary={summary} /></ShowMore></section>
      </> : null}

      {tenant.copernica ? <section className="panel table-panel">
        {summary ? <details className="rfm-settings"><summary>Model aanpassen</summary><RfmSetup initial={setup} tenantId={tenant.id} /></details> : <>
          <div className="panel-heading"><div><p className="eyebrow">Instellen</p><h2>RFM-model instellen</h2></div></div>
          <p className="rfm-intro">RFM verdeelt klanten in segmenten op basis van hoe <strong>recent</strong> (R), hoe <strong>vaak</strong> (F) en voor <strong>hoeveel</strong> (M) ze kochten. Zo zie je wie je kampioenen zijn, wie je dreigt te verliezen en wat je database waard is.</p>
          <RfmSetup initial={setup} tenantId={tenant.id} />
        </>}
      </section> : null}
    </DashboardShell>
  );
}
