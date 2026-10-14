import type { CostRow } from "@/lib/costs/model";

const euro = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

const segments = [
  { key: "usage", label: "Verbruik", className: "is-usage" },
  { key: "fixed", label: "Vaste kosten", className: "is-fixed" },
  { key: "support", label: "Inzet", className: "is-support" },
] as const;

/**
 * Per customer a horizontal bar of what it costs (usage, share of fixed costs, support) with a tick for the
 * advised price: where the bar passes the tick, the customer costs more than it should pay. The table below
 * holds every number, so the chart itself only labels the totals.
 */
export function CostChart({ rows }: { rows: CostRow[] }) {
  const max = Math.max(1, ...rows.map((row) => Math.max(row.cost.total, row.price.total)));
  return (
    <div className="cost-chart">
      <div className="cost-legend" aria-hidden="true">
        {segments.map((segment) => <span key={segment.key}><i className={segment.className} /> {segment.label}</span>)}
        <span><i className="is-price" /> Advies</span>
      </div>
      <ul aria-label="Kostprijs en advies per klant">
        {rows.map((row) => (
          <li key={row.usage.id}>
            <span className="cost-chart-name">{row.usage.name}</span>
            <span className="cost-chart-track" title={`${row.usage.name}: verbruik ${euro.format(row.cost.usage)}, vast ${euro.format(row.cost.fixed)}, inzet ${euro.format(row.cost.support)} · kostprijs ${euro.format(row.cost.total)} · advies ${euro.format(row.price.total)}`}>
              {segments.map((segment) => {
                const value = row.cost[segment.key];
                return value > 0 ? <span className={`cost-chart-segment ${segment.className}`} key={segment.key} style={{ width: `${(value / max) * 100}%` }} /> : null;
              })}
              {row.price.total ? <span className="cost-chart-price" style={{ left: `${(row.price.total / max) * 100}%` }} /> : null}
            </span>
            <span className={`cost-chart-value ${row.margin < 0 ? "trend-down" : ""}`}>{euro.format(row.cost.total)} <small>/ {euro.format(row.price.total)}</small></span>
          </li>
        ))}
      </ul>
    </div>
  );
}
