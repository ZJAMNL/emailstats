import { rfmSegmentByKey, rfmSegments, segmentFor, type RfmSegmentKey } from "@/lib/rfm/segments";
import { cohortRevenueMonths } from "@/lib/rfm/cohort";
import type { RfmRunSummary } from "@/lib/rfm/run";

const euro = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const number = new Intl.NumberFormat("nl-NL");
const percent = (value: number) => `${(value * 100).toLocaleString("nl-NL", { maximumFractionDigits: 1 })}%`;

export type RfmTrend = { key: RfmSegmentKey; current: number; previous: number | null };
export type RfmShift = { from: RfmSegmentKey; to: RfmSegmentKey; count: number };

export function RfmKpis({ summary }: { summary: RfmRunSummary }) {
  const { value } = summary;
  const segment = (key: RfmSegmentKey) => value.segments.find((item) => item.key === key)!;
  const topRevenue = segment("champions").revenue + segment("loyal").revenue;
  const atRisk = [segment("at_risk"), segment("cant_lose")];
  const windowYears = summary.settings.windowMonths / 12;
  const clv = summary.clv?.status === "ok" ? summary.clv : null;
  return (
    <section className="rfm-kpis">
      {clv
        ? <article className="panel rfm-kpi rfm-kpi-accent"><span>Databasewaarde (komende 12 maanden)</span><strong>{euro.format(clv.customerEquity)}</strong><small>{euro.format(clv.totalClv)} voorspeld van {number.format(clv.customers)} kopers + {euro.format(clv.prospectValue)} van profielen zonder aankoop</small></article>
        : <article className="panel rfm-kpi"><span>Geschatte databasewaarde</span><strong>{euro.format(value.databaseValue)}</strong><small>{euro.format(value.activeValue)} actieve klanten + {euro.format(value.prospectValue)} prospects</small></article>}
      <article className="panel rfm-kpi"><span>Klanten in {summary.settings.windowMonths} maanden</span><strong>{number.format(value.customers)}</strong><small>{number.format(value.activeCustomers)} actief · {number.format(value.prospects)} profielen zonder recente order</small></article>
      <article className="panel rfm-kpi"><span>Omzet in het venster</span><strong>{euro.format(value.revenue)}</strong><small>±{euro.format(value.revenue / windowYears)} per jaar · top 20% klanten = {percent(value.topCustomerRevenueShare)} van de omzet</small></article>
      <article className="panel rfm-kpi"><span>Kampioenen + loyale klanten</span><strong>{value.revenue ? percent(topRevenue / value.revenue) : "—"}</strong><small>van de omzet, door {number.format(segment("champions").customers + segment("loyal").customers)} klanten</small></article>
      <article className="panel rfm-kpi rfm-kpi-warning"><span>Risico + niet verliezen</span><strong>{number.format(atRisk[0].customers + atRisk[1].customers)}</strong><small>klanten met samen {euro.format(atRisk[0].revenue + atRisk[1].revenue)} omzet: terugwinnen loont</small></article>
    </section>
  );
}

export function RfmHeatmap({ grid }: { grid: number[][] }) {
  const max = Math.max(1, ...grid.flat());
  return (
    <div className="rfm-heatmap" role="table" aria-label="Klanten per recency- en frequentie/monetaire score">
      <div className="rfm-heatmap-ylabel" aria-hidden="true">Recency →</div>
      <div className="rfm-heatmap-grid">
        {[5, 4, 3, 2, 1].map((r) => (
          <div className="rfm-heatmap-row" key={r} role="row">
            <span className="rfm-heatmap-axis" role="rowheader">R{r}</span>
            {[1, 2, 3, 4, 5].map((fm) => {
              const count = grid[r - 1]?.[fm - 1] ?? 0;
              const segment = rfmSegmentByKey.get(segmentFor(r, fm))!;
              return (
                <div className="rfm-heatmap-cell" key={fm} role="cell" title={`${segment.label}: ${number.format(count)} klanten (R${r}, FM${fm})`} style={{ background: `color-mix(in srgb, ${segment.color} ${Math.round(18 + (count / max) * 72)}%, transparent)` }}>
                  <strong>{number.format(count)}</strong>
                  <small>{segment.label}</small>
                </div>
              );
            })}
          </div>
        ))}
        <div className="rfm-heatmap-row" aria-hidden="true">
          <span className="rfm-heatmap-axis" />
          {[1, 2, 3, 4, 5].map((fm) => <span className="rfm-heatmap-axis" key={fm}>FM{fm}</span>)}
        </div>
        <p className="rfm-heatmap-xlabel" aria-hidden="true">Frequentie en besteding →</p>
      </div>
    </div>
  );
}

export function RfmSegmentTable({ summary, trends }: { summary: RfmRunSummary; trends?: RfmTrend[] }) {
  const { value } = summary;
  const trendByKey = new Map(trends?.map((trend) => [trend.key, trend]));
  const clv = summary.clv?.status === "ok" ? summary.clv : null;
  const predictionByKey = new Map(clv?.segments.map((segment) => [segment.key, segment]));
  return (
    <div className="table-wrap">
      <table className="rfm-table">
        <thead><tr><th>Segment</th><th>Klanten</th><th>Omzet</th><th>Gem. order</th><th>Orders/jaar</th><th>Laatste order</th>{clv ? <><th>Voorspelde waarde/klant</th><th>Kans actief</th></> : <th>Klantwaarde</th>}<th>Aanpak</th></tr></thead>
        <tbody>
          {value.segments.map((segment) => {
            const definition = rfmSegmentByKey.get(segment.key)!;
            const trend = trendByKey.get(segment.key);
            const change = trend && trend.previous ? (trend.current - trend.previous) / trend.previous : null;
            return (
              <tr key={segment.key}>
                <td><span className="rfm-swatch" style={{ background: definition.color }} /><strong>{definition.label}</strong><small>{definition.description}</small></td>
                <td>{number.format(segment.customers)}<small>{value.customers ? percent(segment.customers / value.customers) : "—"}{change !== null ? <em className={change > 0 ? "trend-up" : change < 0 ? "trend-down" : ""}> · {change > 0 ? "+" : ""}{percent(change)}</em> : null}</small></td>
                <td>{euro.format(segment.revenue)}<small>{value.revenue ? percent(segment.revenue / value.revenue) : "—"}</small></td>
                <td>{segment.orders ? euro.format(segment.avgOrderValue) : "—"}</td>
                <td>{segment.customers ? segment.ordersPerYear.toLocaleString("nl-NL", { maximumFractionDigits: 1 }) : "—"}</td>
                <td>{segment.customers ? `${number.format(segment.avgRecencyDays)} dagen` : "—"}</td>
                {clv ? <><td>{predictionByKey.get(segment.key)?.customers ? euro.format(predictionByKey.get(segment.key)!.avgClv) : "—"}</td><td>{predictionByKey.get(segment.key)?.customers ? percent(predictionByKey.get(segment.key)!.avgProbabilityAlive) : "—"}</td></> : <td>{definition.active && segment.customers ? euro.format(segment.clv) : "—"}</td>}
                <td className="rfm-action">{definition.action}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function RfmShifts({ shifts }: { shifts: RfmShift[] }) {
  const moves = shifts.filter((shift) => shift.from !== shift.to).sort((a, b) => b.count - a.count).slice(0, 8);
  if (!moves.length) return <p className="empty-state">Nog geen verschuivingen: die verschijnen vanaf de tweede maand dat het model draait.</p>;
  const order = new Map(rfmSegments.map((segment, index) => [segment.key, index]));
  return (
    <ul className="rfm-shifts">
      {moves.map((shift) => {
        const improved = order.get(shift.to)! < order.get(shift.from)!;
        return <li key={`${shift.from}-${shift.to}`}><span>{rfmSegmentByKey.get(shift.from)!.label}</span><b className={improved ? "trend-up" : "trend-down"}>{improved ? "↑" : "↓"}</b><span>{rfmSegmentByKey.get(shift.to)!.label}</span><strong>{number.format(shift.count)}</strong></li>;
      })}
    </ul>
  );
}

export function RfmQuality({ summary }: { summary: RfmRunSummary }) {
  const { quality } = summary;
  const issues = [
    [quality.excludedStatus, "orders uitgesloten op status"],
    [quality.outsideWindow, `orders ouder dan ${summary.settings.windowMonths} maanden`],
    [quality.futureDate, "orders met een datum in de toekomst"],
    [quality.missingDate, "orders zonder (geldige) datum"],
    [quality.missingAmount, "orders zonder bedrag (geteld als order van € 0)"],
    [quality.negativeAmount, "negatieve bedragen (verrekend met de omzet)"],
    [quality.missingProfile, "orders zonder profiel"],
  ].filter(([count]) => Number(count) > 0) as [number, string][];
  return (
    <div className="rfm-quality">
      <p><strong>{number.format(quality.usedOrders)}</strong> van {number.format(quality.totalOrders)} orders gebruikt · {number.format(summary.totalProfiles)} profielen in de database · berekend in {(summary.durationMs / 1000).toLocaleString("nl-NL", { maximumFractionDigits: 1 })} s</p>
      {issues.length ? <ul>{issues.map(([count, label]) => <li key={label}>{number.format(count)} {label}</li>)}</ul> : <p>Geen datakwaliteitsproblemen gevonden.</p>}
      <p className="rfm-assumptions">Aannames voor de klantwaarde: verwachte levensduur {summary.value.lifespanYears.toLocaleString("nl-NL")} jaar (op basis van {percent(summary.value.churnRate)} klanten zonder order in het laatste jaar), marge {summary.settings.marginPercent}%, conversie van prospects {percent(summary.value.conversionRate)} per jaar. Dit is een indicatie, geen voorspelling.</p>
    </div>
  );
}

export function RfmPrediction({ summary }: { summary: RfmRunSummary }) {
  const clv = summary.clv;
  if (!clv) return <p className="empty-state">Bereken het model opnieuw om de voorspelde klantwaarde te zien.</p>;
  if (clv.status !== "ok") return <p className="empty-state">{clv.message}</p>;
  const maxBand = Math.max(1, ...clv.aliveBands.map((band) => band.customers));
  return (
    <div className="rfm-prediction">
      <div className="rfm-prediction-figures">
        <div><span>Voorspelde omzet van bestaande kopers</span><strong>{euro.format(clv.totalClv)}</strong><small>in de komende 12 maanden{summary.settings.marginPercent < 100 ? `, na ${summary.settings.marginPercent}% marge` : ""}</small></div>
        <div><span>Verwachte orders</span><strong>{number.format(Math.round(clv.expectedOrders))}</strong><small>gemiddelde orderwaarde ±{euro.format(clv.populationOrderValue)}</small></div>
        <div><span>Top 10% van de kopers</span><strong>{percent(clv.top10Share)}</strong><small>van de voorspelde waarde</small></div>
      </div>
      <div className="rfm-alive">
        <p>Kans dat een koper nog actief is</p>
        {clv.aliveBands.map((band) => <div className="rfm-alive-row" key={band.label}><span>{band.label}</span><i style={{ width: `${(band.customers / maxBand) * 100}%` }} /><strong>{number.format(band.customers)}</strong></div>)}
      </div>
      <p className="rfm-assumptions">Voorspeld met het BG/NBD-model (aantal aankopen) en het Gamma-Gamma-model (besteding per order) op {number.format(clv.customers)} kopers, waarvan {number.format(clv.repeatCustomers)} met een herhaalaankoop. Het model rekent met het eigen koopritme van elke klant: wie normaal eens per jaar koopt, telt na een paar stille maanden nog niet als afhaker. {clv.outsideWindow.customers ? `${number.format(clv.outsideWindow.customers)} kopers van vóór het analysevenster samen nog ${euro.format(clv.outsideWindow.totalClv)}.` : ""}</p>
    </div>
  );
}

const monthName = (value: string) => new Date(`${value}-15T12:00:00Z`).toLocaleDateString("nl-NL", { month: "short", year: "numeric" });

export function RfmCohorts({ summary }: { summary: RfmRunSummary }) {
  const cohorts = summary.cohorts;
  if (!cohorts?.length) return <p className="empty-state">Nog geen cohorten: bereken het model opnieuw.</p>;
  const offsets = cohorts[0].retention.length;
  return (
    <div className="rfm-cohorts">
      <h3>Herhaalaankopen per maand na de eerste aankoop</h3>
      <div className="table-wrap">
        <table className="rfm-cohort-table">
          <thead><tr><th>Eerste aankoop</th><th>Klanten</th>{Array.from({ length: offsets }, (_, index) => <th key={index}>M{index + 1}</th>)}</tr></thead>
          <tbody>{cohorts.map((cohort) => <tr key={cohort.month}><th scope="row">{monthName(cohort.month)}</th><td>{number.format(cohort.customers)}</td>{cohort.retention.map((share, index) => <td className="rfm-cohort-cell" key={index} style={share === null ? undefined : { background: `color-mix(in srgb, var(--accent) ${Math.round(Math.min(1, share / 0.3) * 70)}%, transparent)` }}>{share === null ? "" : percent(share)}</td>)}</tr>)}</tbody>
        </table>
      </div>
      <h3>Omzet per klant sinds de eerste aankoop</h3>
      <div className="table-wrap">
        <table className="rfm-cohort-table">
          <thead><tr><th>Eerste aankoop</th>{cohortRevenueMonths.map((months) => <th key={months}>{months === 1 ? "1e maand" : `${months} mnd`}</th>)}</tr></thead>
          <tbody>{cohorts.map((cohort) => <tr key={cohort.month}><th scope="row">{monthName(cohort.month)}</th>{cohort.revenuePerCustomer.map((revenue, index) => <td key={index}>{revenue === null ? "" : euro.format(revenue)}</td>)}</tr>)}</tbody>
        </table>
      </div>
      <p className="rfm-assumptions">Lees een rij van links naar rechts: zo ontwikkelt een groep klanten zich na hun eerste aankoop. Vergelijk een maand met dezelfde maand een jaar eerder om te zien of nieuwe klanten beter of slechter worden. Lege vakken zijn nog niet volledig verstreken.</p>
    </div>
  );
}
