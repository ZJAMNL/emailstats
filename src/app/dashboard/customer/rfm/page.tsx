import { notFound } from "next/navigation";
import { DashboardShell } from "@/components/dashboard-shell";
import { RfmHeatmap, RfmKpis, RfmSegmentTable, RfmShifts } from "@/components/rfm-overview";
import { SelectionTrendChart } from "@/components/selection-trend-chart";
import { buildRfmMonthlyChange, buildRfmTrend, loadRfmResult, loadRfmSnapshots } from "@/lib/rfm/history";
import { loadMigrationMatrix } from "@/lib/rfm/run";
import { rfmSegments } from "@/lib/rfm/segments";
import { requireRole } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "RFM-model" };

const percent = (value: number) => `${(value * 100).toLocaleString("nl-NL", { maximumFractionDigits: 1 })}%`;

export default async function CustomerRfm() {
  const session = await requireRole("customer");
  if (!process.env.DATABASE_URL) notFound();

  const { config, summary } = await loadRfmResult(session.tenantId);
  if (!config?.customerVisible || !summary) notFound();

  const [snapshots, shifts] = await Promise.all([loadRfmSnapshots(session.tenantId), loadMigrationMatrix(session.tenantId)]);
  const { settings, value } = summary;

  return (
    <DashboardShell role="customer" title="RFM-model" subtitle="De waarde van je klanten, ingedeeld op hoe recent, hoe vaak en voor hoeveel ze bij je kochten.">
      <section className="panel rfm-explainer">
        <div>
          <p className="eyebrow">Zo werkt het</p>
          <h2>Elke klant krijgt drie scores van 1 tot 5</h2>
          <p>Op basis van de orders van de afgelopen {settings.windowMonths} maanden. Hoe hoger de score, hoe beter. De combinatie bepaalt in welk segment een klant valt.</p>
        </div>
        <dl>
          <div><dt>R · Recency</dt><dd>Hoe kort geleden was de laatste aankoop?</dd></div>
          <div><dt>F · Frequency</dt><dd>Hoe vaak kocht de klant? Score {settings.frequencyThresholds.map((threshold, index) => `${index + 1} = ${threshold}${index === 4 ? "+" : ""}`).join(", ")} orders.</dd></div>
          <div><dt>M · Monetary</dt><dd>Hoeveel heeft de klant in totaal besteed?</dd></div>
        </dl>
      </section>

      <p className="rfm-meta">Laatst bijgewerkt op {new Date(summary.ranAt).toLocaleString("nl-NL")}</p>
      <RfmKpis summary={summary} />

      <section className="panel-grid two-columns">
        <article className="panel"><div className="panel-heading"><div><p className="eyebrow">Verdeling</p><h2>Waar staan je klanten?</h2></div></div><RfmHeatmap grid={summary.grid} /><p className="rfm-caption">Rechtsboven staan je beste klanten, linksonder de klanten die je kwijt bent. Hoe donkerder het vlak, hoe meer klanten.</p></article>
        <article className="panel"><div className="panel-heading"><div><p className="eyebrow">Deze maand</p><h2>Grootste verschuivingen</h2></div></div><RfmShifts shifts={shifts} /></article>
      </section>

      <section className="panel table-panel"><div className="panel-heading"><div><p className="eyebrow">Segmenten</p><h2>Waarde en aanpak per segment</h2></div></div><RfmSegmentTable summary={summary} trends={buildRfmMonthlyChange(snapshots)} /></section>

      <section className="panel table-panel"><div className="panel-heading"><div><p className="eyebrow">Ontwikkeling</p><h2>Klanten per segment</h2></div></div><SelectionTrendChart data={buildRfmTrend(snapshots)} selections={rfmSegments.map((segment) => ({ id: segment.key, name: segment.label, color: segment.color }))} storageKey={`customer-rfm-chart-hidden:${session.tenantId}`} /></section>

      <p className="rfm-assumptions rfm-customer-note">De klantwaarde en databasewaarde zijn een indicatie op basis van je eigen orderhistorie: gemiddelde orderwaarde × aantal orders per jaar × verwachte klantduur ({value.lifespanYears.toLocaleString("nl-NL")} jaar){settings.marginPercent < 100 ? ` × marge (${settings.marginPercent}%)` : ""}. Profielen zonder recente order tellen mee op basis van het percentage dat vorig jaar voor het eerst kocht ({percent(value.conversionRate)}).</p>
    </DashboardShell>
  );
}
