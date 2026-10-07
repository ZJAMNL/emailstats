import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import type { Metric } from "@/lib/dashboard-data";

export function MetricsGrid({ metrics }: { metrics: Metric[] }) {
  return (
    <section className="metric-grid" aria-label="Belangrijkste statistieken">
      {metrics.map((metric) => (
        <article key={metric.label} className="metric-card">
          <div className="metric-header">
            <span>{metric.label}</span>
            <span className={`trend ${metric.trend}`}>
              {metric.trend === "up" ? <ArrowUpRight size={14} /> : metric.trend === "down" ? <ArrowDownRight size={14} /> : <Minus size={14} />}
              {metric.delta}
            </span>
          </div>
          <strong>{metric.value}</strong>
        </article>
      ))}
    </section>
  );
}
