import Link from "next/link";
import { SummarySection } from "@/components/show-more";
import { ANY_ORDER_DAYS, EARLY_DAYS, LATE_DAYS, MIN_JUDGED, type OutcomeReport } from "@/lib/predict/outcomes";

const number = new Intl.NumberFormat("nl-NL");
const percent = (part: number, whole: number) => (whole ? `${((part / whole) * 100).toLocaleString("nl-NL", { maximumFractionDigits: 0 })}%` : "—");
const sourceLabel: Record<string, string> = { herhaalaankoop: "Herhaalaankoop", aanbeveling: "Aanbeveling", categorie: "Alleen categorie" };

/**
 * "Komt het uit?": the predicted orders as they were made, checked against what customers really ordered.
 * `profiles` counts each customer's first expected order (did they order?), `predictions` every expected
 * order (was the product right?).
 */
export function PredictionOutcomes({ report, sentOnly, hrefs }: { report: { profiles: OutcomeReport; predictions: OutcomeReport }; sentOnly: boolean; hrefs: { all: string; sent: string } }) {
  const { profiles, predictions } = report;
  const product = predictions.product;
  const ratio = product.baselineHits ? product.hits / product.baselineHits : null;
  const filter = (
    <nav aria-label="Welke voorspellingen" className="segmented-control outcome-filter">
      <Link aria-current={sentOnly ? undefined : "page"} href={hrefs.all} scroll={false}>Alle voorspellingen</Link>
      <Link aria-current={sentOnly ? "page" : undefined} href={hrefs.sent} scroll={false}>Naar Copernica gestuurd</Link>
    </nav>
  );

  if (profiles.judged < MIN_JUDGED) {
    return (
      <section className="panel table-panel">
        <div className="panel-heading"><div><p className="eyebrow">Controle</p><h2>Komt het uit?</h2></div>{filter}</div>
        <p className="empty-state">{profiles.trackingSince
          ? `De voorspellingen worden gevolgd sinds ${profiles.trackingSince.toLocaleDateString("nl-NL")}: ${number.format(profiles.open)} lopen nog, ${number.format(profiles.judged)} zijn beoordeeld. Een voorspelling wordt beoordeeld zodra er rond de verwachte datum besteld is, of uiterlijk ${ANY_ORDER_DAYS} dagen later; vanaf ${MIN_JUDGED} beoordeelde voorspellingen verschijnen hier de uitkomsten.`
          : "Vanaf de volgende nachtelijke berekening wordt elke voorspelde bestelling vastgelegd en later vergeleken met wat er echt besteld is."}</p>
      </section>
    );
  }

  return (
    <SummarySection eyebrow="Controle" title="Komt het uit?" summary={<>
      {filter}
      <p>Van <strong>{number.format(profiles.judged)}</strong> klanten met een voorspelde bestelling bestelde <strong>{percent(profiles.onTime, profiles.judged)}</strong> rond de verwachte datum en {percent(profiles.otherTiming, profiles.judged)} op een ander moment. {product.n ? <>Het voorspelde product werd in <strong>{percent(product.hits, product.n)}</strong> van de gevallen gekocht, tegen {percent(product.baselineHits, product.n)} voor het populairste product{ratio && ratio > 0 ? ` (${ratio.toLocaleString("nl-NL", { maximumFractionDigits: 1 })}× zo vaak raak)` : ""}.</> : null}</p>
    </>}>
      <div className="rfm-kpis outcome-kpis">
        <article className="panel rfm-kpi rfm-kpi-accent"><span>Besteld rond de verwachte datum</span><strong>{percent(profiles.onTime, profiles.judged)}</strong><small>{EARLY_DAYS} dagen ervoor tot {LATE_DAYS} dagen erna</small></article>
        <article className="panel rfm-kpi"><span>Besteld, ander moment</span><strong>{percent(profiles.otherTiming, profiles.judged)}</strong><small>binnen {ANY_ORDER_DAYS} dagen na voorspellen</small></article>
        <article className="panel rfm-kpi"><span>Niet besteld</span><strong>{percent(profiles.noOrder, profiles.judged)}</strong><small>{number.format(profiles.open)} voorspellingen lopen nog</small></article>
        <article className="panel rfm-kpi"><span>Timing</span><strong>{profiles.medianDaysOff === null ? "—" : `${profiles.medianDaysOff > 0 ? "+" : ""}${profiles.medianDaysOff} d`}</strong><small>mediaan verschil met de verwachte datum</small></article>
      </div>

      <h3>Bestellen klanten met een hoge kans ook echt vaker?</h3>
      <p className="rfm-hint">Per groep de voorspelde kans tegenover het deel dat binnen {ANY_ORDER_DAYS} dagen echt bestelde. Ligt het werkelijke percentage dicht bij de voorspelling en loopt het op met de kans, dan onderscheidt het model goed.</p>
      <div className="table-wrap"><table className="rfm-table outcome-calibration">
        <thead><tr><th>Voorspelde kans</th><th>Klanten</th><th>Gem. voorspeld</th><th>Echt besteld</th><th aria-hidden="true" /></tr></thead>
        <tbody>{profiles.calibration.map((bucket) => (
          <tr key={bucket.label}>
            <td>{bucket.label}</td>
            <td>{number.format(bucket.n)}</td>
            <td>{percent(bucket.averageChance * bucket.n, bucket.n)}</td>
            <td><strong>{percent(bucket.ordered, bucket.n)}</strong></td>
            <td className="outcome-bars" aria-hidden="true"><span className="is-predicted" style={{ width: `${bucket.averageChance * 100}%` }} /><span className="is-actual" style={{ width: `${(bucket.ordered / bucket.n) * 100}%` }} /></td>
          </tr>
        ))}</tbody>
      </table></div>
      <p className="outcome-legend"><span className="is-predicted" /> voorspeld <span className="is-actual" /> werkelijk</p>

      <h3>Klopte het product?</h3>
      <div className="table-wrap"><table className="rfm-table">
        <thead><tr><th>Soort voorspelling</th><th>Voorspellingen</th><th>Besteld</th><th>Voorspeld product gekocht</th></tr></thead>
        <tbody>{predictions.sources.map((source) => (
          <tr key={source.source}><td>{sourceLabel[source.source] ?? source.source}</td><td>{number.format(source.n)}</td><td>{percent(source.ordered, source.n)}</td><td>{source.productN ? percent(source.productHits, source.productN) : "—"}</td></tr>
        ))}</tbody>
      </table></div>
      <p className="rfm-hint">Ter vergelijking: wie zonder model het populairste product (dat de klant nog niet had) zou voorspellen, zat in {percent(product.baselineHits, product.n)} van dezelfde gevallen goed. De juiste productgroep werd in {percent(predictions.category.hits, predictions.category.n)} van de voorspellingen gekocht.</p>
    </SummarySection>
  );
}
