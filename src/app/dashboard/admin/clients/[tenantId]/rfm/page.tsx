import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { RfmControls } from "@/components/rfm-controls";
import { RfmHeatmap, RfmKpis, RfmQuality, RfmSegmentTable, RfmShifts, type RfmTrend } from "@/components/rfm-overview";
import { RfmSetup } from "@/components/rfm-setup";
import { SelectionTrendChart } from "@/components/selection-trend-chart";
import { getPrismaClient } from "@/lib/prisma";
import { loadMigrationMatrix, settingsFromConfig, type RfmRunSummary } from "@/lib/rfm/run";
import { rfmSegments, type RfmSegmentKey } from "@/lib/rfm/segments";
import { requireRole } from "@/lib/session";

export const dynamic = "force-dynamic";
// Calculations fetch every order from Copernica and can take a while for large databases.
export const maxDuration = 300;

export default async function AdminClientRfm({ params }: { params: Promise<{ tenantId: string }> }) {
  await requireRole("admin");
  const { tenantId } = await params;
  if (!process.env.DATABASE_URL) notFound();

  const prisma = getPrismaClient();
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true, name: true, copernica: { select: { databaseId: true } }, rfmConfig: true } });
  if (!tenant) notFound();

  const config = tenant.rfmConfig;
  const summary = config?.enabled && config.lastRunSummary ? config.lastRunSummary as unknown as RfmRunSummary : null;
  const [snapshots, shifts] = summary ? await Promise.all([
    loadSnapshots(tenantId),
    loadMigrationMatrix(tenantId),
  ]) : [[], []];

  const trendData = buildTrend(snapshots);
  const trends = buildMonthlyChange(snapshots);
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
        <section className="panel table-panel"><div className="panel-heading"><div><p className="eyebrow">Ontwikkeling</p><h2>Klanten per segment</h2></div></div><SelectionTrendChart data={trendData} selections={rfmSegments.map((segment) => ({ id: segment.key, name: segment.label, color: segment.color }))} storageKey={`rfm-chart-hidden:${tenant.id}`} /></section>
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

function loadSnapshots(tenantId: string) {
  const since = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000);
  return getPrismaClient().rfmSegmentSnapshot.findMany({ where: { tenantId, measuredAt: { gte: since } }, orderBy: { measuredAt: "asc" } });
}

type Snapshot = { measuredAt: Date; segment: string; customers: number };

function buildTrend(snapshots: Snapshot[]) {
  const points = new Map<string, { date: string; [segment: string]: number | string }>();
  for (const snapshot of snapshots) {
    const date = snapshot.measuredAt.toISOString().slice(0, 10);
    const point = points.get(date) ?? { date };
    point[snapshot.segment] = snapshot.customers;
    points.set(date, point);
  }
  return [...points.values()];
}

function buildMonthlyChange(snapshots: Snapshot[]): RfmTrend[] {
  if (!snapshots.length) return [];
  const latest = snapshots[snapshots.length - 1].measuredAt.getTime();
  const target = latest - 30 * 24 * 60 * 60 * 1000;
  const previousDate = [...new Set(snapshots.map((snapshot) => snapshot.measuredAt.getTime()))].filter((time) => time <= target).pop();
  return rfmSegments.map((segment) => ({
    key: segment.key as RfmSegmentKey,
    current: snapshots.find((snapshot) => snapshot.measuredAt.getTime() === latest && snapshot.segment === segment.key)?.customers ?? 0,
    previous: previousDate === undefined ? null : snapshots.find((snapshot) => snapshot.measuredAt.getTime() === previousDate && snapshot.segment === segment.key)?.customers ?? null,
  }));
}
