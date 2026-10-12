import { ShowMore, SummarySection } from "@/components/show-more";
import type { ForecastOverview } from "@/lib/predict/advice-data";

const euro = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const number = new Intl.NumberFormat("nl-NL");
const percent = (value: number) => `${(value * 100).toLocaleString("nl-NL", { maximumFractionDigits: 1 })}%`;

function Bars({ items }: { items: { label: string; value: number; display: string }[] }) {
  const max = Math.max(1, ...items.map((item) => item.value));
  return (
    <ul className="insights-bars">
      {items.map((item) => (
        <li key={item.label}>
          <span className="insights-bar-label">{item.label}</span>
          <span className="insights-bar-track"><span style={{ width: `${(item.value / max) * 100}%` }} /></span>
          <span className="insights-bar-value">{item.display}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * "Voorspellen en advies": expected revenue and product groups, who will order what and when, and
 * what to do with it. Shared by the customer environment and the admin page.
 */
export function ForecastView({ overview }: { overview: ForecastOverview }) {
  const forecast = overview.report.forecast;
  if (!forecast) return <section className="panel table-panel"><p className="empty-state">De voorspellingen worden vannacht opnieuw berekend; daarna verschijnen de omzet- en productverwachting hier.</p></section>;
  const existing = forecast.existing;
  const fresh = forecast.newCustomers;
  const deviation = forecast.backtest && forecast.backtest.actual > 0 ? (forecast.backtest.predicted - forecast.backtest.actual) / forecast.backtest.actual : null;

  return (
    <div className="forecast-view">
      {existing ? (
        <section className="rfm-kpis">
          <article className="panel rfm-kpi rfm-kpi-accent"><span>Verwachte omzet komende 30 dagen</span><strong>{euro.format(existing.revenue30 + (fresh?.revenue30 ?? 0))}</strong><small>{euro.format(existing.revenue30)} van bestaande klanten{fresh ? ` + ${euro.format(fresh.revenue30)} van nieuwe klanten` : ""}</small></article>
          <article className="panel rfm-kpi"><span>Verwachte omzet komende 90 dagen</span><strong>{euro.format(existing.revenue90)}</strong><small>van bestaande klanten</small></article>
          <article className="panel rfm-kpi"><span>Verwachte bestellingen (30 dagen)</span><strong>{number.format(Math.round(existing.orders30 + (fresh?.orders30 ?? 0)))}</strong><small>{number.format(Math.round(existing.orders90))} in 90 dagen</small></article>
          {forecast.backtest ? <article className="panel rfm-kpi"><span>Hoe goed klopte het?</span><strong>{deviation === null ? "—" : `${deviation > 0 ? "+" : ""}${percent(deviation)}`}</strong><small>Vorige maand voorspeld {euro.format(forecast.backtest.predicted)}, werkelijk {euro.format(forecast.backtest.actual)}</small></article> : null}
        </section>
      ) : <section className="panel table-panel"><p className="empty-state">Te weinig kopers voor een omzetverwachting (minimaal 50).</p></section>}

      <SummarySection eyebrow="Productgroepen" title="Wat wordt er besteld?" summary={
        forecast.categories.length
          ? <p>Verwacht in de komende 30 dagen: {forecast.categories.slice(0, 3).map((category, index) => <span key={category.category}>{index ? ", " : ""}<strong>{category.category}</strong> ({euro.format(category.revenue)})</span>)}.</p>
          : <p>Nog geen productgroepen: koppel orderregels met een categorie.</p>
      }>
        {forecast.categories.length ? <><h3>Verwachte omzet per productgroep (30 dagen)</h3><Bars items={forecast.categories.map((category) => ({ label: category.category, value: category.revenue, display: `${euro.format(category.revenue)} · ${number.format(Math.round(category.orders))} best.` }))} /></> : null}
        {forecast.products.length ? (
          <>
            <h3>Meest verwachte producten</h3>
            <div className="table-wrap"><table className="rfm-table">
              <thead><tr><th>Product</th><th>SKU</th><th>Categorie</th><th>Verwachte bestellingen</th></tr></thead>
              <tbody>{forecast.products.map((product) => <tr key={product.productId}><td>{product.name !== product.productId ? product.name : "—"}</td><td><code>{product.productId}</code></td><td>{product.category ?? "—"}</td><td>{number.format(Math.round(product.orders * 10) / 10)}</td></tr>)}</tbody>
            </table></div>
          </>
        ) : null}
      </SummarySection>

      <SummarySection eyebrow="Verwachte bestellingen" title="Wie bestelt er wanneer?" summary={
        <p><strong>{number.format(forecast.profilesWithOrder30)}</strong> klanten hebben een verwachte besteldatum in de komende 30 dagen, {number.format(forecast.profilesWithOrder90)} in de komende 90 dagen.{forecast.repeatProducts ? ` ${number.format(forecast.repeatProducts)} producten hebben een vast koopritme.` : ""}</p>
      }>
        <p className="rfm-hint">De verwachte besteldatum is het moment waarop een klant met de berekende kans waarschijnlijk bestelt: bij een grote kans binnen enkele weken, bij een kleine kans later. Dat zijn dus meer klanten dan het verwachte aantal bestellingen hierboven, want niet iedereen met een datum bestelt ook echt. Is een product dat iemand vaker koopt weer aan de beurt, dan is dat de verwachte bestelling (herhaalaankoop); anders het product met de meeste kans (aanbeveling), of alleen de productgroep als er geen betrouwbaar product is.</p>
        {overview.intent.length ? (
          <div className="table-wrap"><table className="rfm-table">
            <thead><tr><th>Koopintentie</th><th>Hoog</th><th>Midden</th><th>Laag</th></tr></thead>
            <tbody>{overview.intent.map((row) => <tr key={row.type}><td>{row.type}</td>{row.bands.map((cell) => <td key={cell.band}>{number.format(cell.profiles)}{cell.averageChance !== null ? <small className="insights-cell-note">gem. {percent(cell.averageChance)} kans</small> : null}</td>)}</tr>)}</tbody>
          </table></div>
        ) : null}
      </SummarySection>

      {overview.audiences.length ? (
        <section className="panel table-panel">
          <div className="panel-heading"><div><p className="eyebrow">Advies</p><h2>Wat kun je ermee?</h2></div></div>
          <div className="insights-audiences">
            {overview.audiences.map((audience) => (
              <article className="insights-audience" key={audience.key}>
                <span>{audience.title}</span>
                <strong>{number.format(audience.profiles)}</strong>
                {audience.detail ? <small>{audience.detail}</small> : null}
                <p>{audience.action}</p>
                <ShowMore label="Selectie in Copernica"><code>{audience.condition}</code></ShowMore>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
