import { RfmCohorts, RfmHeatmap, RfmKpis, RfmPrediction, RfmSegmentTable, RfmShifts, type RfmShift } from "@/components/rfm-overview";
import { SelectionTrendChart } from "@/components/selection-trend-chart";
import { SummarySection } from "@/components/show-more";
import { buildRfmMonthlyChange, buildRfmTrend, loadRfmSnapshots } from "@/lib/rfm/history";
import type { RfmRunSummary } from "@/lib/rfm/run";
import { rfmSegmentByKey, rfmSegments } from "@/lib/rfm/segments";

const euro = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const number = new Intl.NumberFormat("nl-NL");
const percent = (value: number) => `${(value * 100).toLocaleString("nl-NL", { maximumFractionDigits: 1 })}%`;
const average = (values: number[]) => (values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null);

/**
 * "Inzicht": what the customer base looks like now. Every part starts as a one-line summary; the full
 * tables and charts sit behind "Meer tonen". Shared by the customer environment and the admin page.
 */
export function InsightView({ summary, snapshots, shifts, chartKey }: { summary: RfmRunSummary; snapshots: Awaited<ReturnType<typeof loadRfmSnapshots>>; shifts: RfmShift[]; chartKey: string }) {
  const { value } = summary;
  const segments = [...value.segments].filter((segment) => segment.customers > 0).sort((left, right) => right.customers - left.customers);
  const clv = summary.clv?.status === "ok" ? summary.clv : null;
  const cohorts = summary.cohorts ?? [];
  const firstMonthReturn = average(cohorts.map((cohort) => cohort.retention[0]).filter((share): share is number => share !== null));
  const yearRevenue = average(cohorts.map((cohort) => cohort.revenuePerCustomer[3]).filter((amount): amount is number => amount !== null));
  const trends = buildRfmMonthlyChange(snapshots);
  const watched = (["champions", "loyal", "at_risk", "cant_lose"] as const).map((key) => ({ key, trend: trends.find((trend) => trend.key === key) })).filter((item) => item.trend && item.trend.previous !== null);

  return (
    <div className="insight-view">
      <RfmKpis summary={summary} />

      <SummarySection eyebrow="Segmenten" title="Wie zijn je klanten?" summary={
        <ul className="insight-chips">
          {segments.slice(0, 5).map((segment) => {
            const info = rfmSegmentByKey.get(segment.key);
            return <li key={segment.key}><span className="rfm-swatch" style={{ backgroundColor: info?.color }} /> {info?.label ?? segment.key} <strong>{number.format(segment.customers)}</strong> <small>{value.customers ? percent(segment.customers / value.customers) : ""}</small></li>;
          })}
        </ul>
      }>
        <RfmSegmentTable summary={summary} trends={trends} />
        <div className="panel-grid two-columns">
          <article><h3>Waar staan je klanten?</h3><RfmHeatmap grid={summary.grid} /><p className="rfm-caption">Rechtsboven staan je beste klanten, linksonder de klanten die je kwijt bent.</p></article>
          <article><h3>Grootste verschuivingen deze maand</h3><RfmShifts shifts={shifts} /></article>
        </div>
      </SummarySection>

      <SummarySection eyebrow="Klantwaarde" title="Wat zijn je klanten waard?" summary={
        clv
          ? <p><strong>{euro.format(clv.totalClv)}</strong> verwachte omzet van {number.format(clv.customers)} bestaande kopers in de komende 12 maanden. De top 10% is goed voor {percent(clv.top10Share)} daarvan.</p>
          : <p>Geschatte databasewaarde <strong>{euro.format(value.databaseValue)}</strong>, op basis van de orderhistorie.</p>
      }>
        <RfmPrediction summary={summary} />
      </SummarySection>

      <SummarySection eyebrow="Cohortanalyse" title="Houden we nieuwe klanten vast?" summary={
        firstMonthReturn !== null
          ? <p>Gemiddeld koopt <strong>{percent(firstMonthReturn)}</strong> van de nieuwe klanten in de maand na hun eerste aankoop opnieuw{yearRevenue !== null ? <>, en levert een nieuwe klant in het eerste jaar gemiddeld <strong>{euro.format(yearRevenue)}</strong> op</> : null}.</p>
          : <p>Nog niet genoeg historie voor een cohortanalyse.</p>
      }>
        <RfmCohorts summary={summary} />
      </SummarySection>

      <SummarySection eyebrow="Ontwikkeling" title="Hoe verandert je klantenbestand?" summary={
        watched.length
          ? <ul className="insight-chips">{watched.map(({ key, trend }) => {
            const delta = trend!.current - trend!.previous!;
            return <li key={key}>{rfmSegmentByKey.get(key)?.label} <strong className={delta > 0 ? (key === "at_risk" || key === "cant_lose" ? "trend-down" : "trend-up") : delta < 0 ? (key === "at_risk" || key === "cant_lose" ? "trend-up" : "trend-down") : undefined}>{delta > 0 ? "+" : ""}{number.format(delta)}</strong> <small>t.o.v. een maand geleden</small></li>;
          })}</ul>
          : <p>De ontwikkeling verschijnt na een maand meten.</p>
      }>
        <SelectionTrendChart data={buildRfmTrend(snapshots)} selections={rfmSegments.map((segment) => ({ id: segment.key, name: segment.label, color: segment.color }))} storageKey={chartKey} />
      </SummarySection>
    </div>
  );
}
