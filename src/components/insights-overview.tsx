import { INSIGHTS_COLLECTION } from "@/lib/insights/fields";
import type { InsightsOverview } from "@/lib/insights/overview";

const number = new Intl.NumberFormat("nl-NL");
const euro = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const percent = (value: number) => `${(value * 100).toLocaleString("nl-NL", { maximumFractionDigits: 1 })}%`;
const date = (value: Date | null) => value ? value.toLocaleDateString("nl-NL", { day: "numeric", month: "long" }) : null;

function Bars({ items }: { items: { label: string; value: number }[] }) {
  const max = Math.max(1, ...items.map((item) => item.value));
  return (
    <ul className="insights-bars">
      {items.map((item) => (
        <li key={item.label}>
          <span className="insights-bar-label">{item.label}</span>
          <span className="insights-bar-track"><span style={{ width: `${(item.value / max) * 100}%` }} /></span>
          <span className="insights-bar-value">{number.format(item.value)}</span>
        </li>
      ))}
    </ul>
  );
}

/** The Klantinzichten page body, shared by the customer environment and the admin preview. */
export function InsightsOverviewView({ overview }: { overview: InsightsOverview }) {
  const { totals, available, models } = overview;
  const freshness = [models.rfmAt ? `klantwaarde berekend op ${date(models.rfmAt)}` : null, models.predictionsAt ? `voorspellingen berekend op ${date(models.predictionsAt)}` : null, overview.copernica.writtenAt ? `bijgewerkt in Copernica op ${date(overview.copernica.writtenAt)}` : null].filter(Boolean).join(" · ");

  return (
    <div className="insights-overview">
      {freshness ? <p className="rfm-meta">{freshness.charAt(0).toUpperCase() + freshness.slice(1)}</p> : null}

      <section className="rfm-kpis">
        <article className="panel rfm-kpi rfm-kpi-accent"><span>Profielen met inzichten</span><strong>{number.format(totals.profiles)}</strong><small>{number.format(totals.buyers)} kopers{available.ai ? ` · ${number.format(totals.prospects)} prospects` : ""}</small></article>
        {available.buyers || available.prospects ? <article className="panel rfm-kpi"><span>Hoge koopintentie</span><strong>{number.format(totals.highIntent)}</strong><small>samen naar verwachting {number.format(Math.round(totals.expectedPurchases))} aankopen in 30 dagen</small></article> : null}
        {available.rfm ? <article className="panel rfm-kpi"><span>Verwachte omzet (12 maanden)</span><strong>{euro.format(totals.expectedRevenue)}</strong><small>van alle kopers samen, volgens het klantwaardemodel</small></article> : null}
      </section>

      {overview.audiences.length ? (
        <section className="panel table-panel">
          <div className="panel-heading"><div><p className="eyebrow">Direct inzetbaar</p><h2>Doelgroepen</h2></div></div>
          <div className="insights-audiences">
            {overview.audiences.map((audience) => (
              <article className="insights-audience" key={audience.key}>
                <span>{audience.title}</span>
                <strong>{number.format(audience.profiles)}</strong>
                {audience.detail ? <small>{audience.detail}</small> : null}
                <p>{audience.action}</p>
                <code>{audience.condition}</code>
              </article>
            ))}
          </div>
          <p className="rfm-hint">Bouw deze doelgroepen in Copernica als selectie op de collectie {INSIGHTS_COLLECTION}. Ze werken zichzelf elke nacht bij.</p>
        </section>
      ) : null}

      <section className="panel-grid two-columns">
        {overview.intent.length ? (
          <article className="panel table-panel">
            <div className="panel-heading"><div><p className="eyebrow">Komende 30 dagen</p><h2>Koopintentie</h2></div></div>
            <div className="table-wrap"><table className="rfm-table">
              <thead><tr><th /><th>Hoog</th><th>Midden</th><th>Laag</th></tr></thead>
              <tbody>{overview.intent.map((row) => <tr key={row.type}><td>{row.type}</td>{row.bands.map((cell) => <td key={cell.band}>{number.format(cell.profiles)}{cell.averageChance !== null ? <small className="insights-cell-note">gem. {percent(cell.averageChance)} kans</small> : null}</td>)}</tr>)}</tbody>
            </table></div>
            <p className="rfm-hint">‘Hoog’ is de 10% met de hoogste koopkans, ‘Midden’ de 30% daarna. {models.prospectsVerdict === null ? "Voor prospects is (nog) geen betrouwbaar model, daarom staan zij hier niet in." : ""}</p>
          </article>
        ) : null}
        {available.rfm ? (
          <article className="panel table-panel">
            <div className="panel-heading"><div><p className="eyebrow">Klantwaarde</p><h2>Segmenten</h2></div></div>
            <div className="table-wrap"><table className="rfm-table">
              <thead><tr><th>Segment</th><th>Klanten</th><th>Gem. waarde</th>{available.buyers ? <th>Hoge koopintentie</th> : null}</tr></thead>
              <tbody>{overview.segments.map((segment) => <tr key={segment.key}><td><span className="rfm-swatch" style={{ backgroundColor: segment.color }} /> {segment.label}</td><td>{number.format(segment.profiles)}</td><td>{euro.format(segment.averageClv)}</td>{available.buyers ? <td>{segment.highIntentShare === null ? "—" : percent(segment.highIntentShare)}</td> : null}</tr>)}</tbody>
            </table></div>
          </article>
        ) : null}
      </section>

      {available.ai && (overview.favoriteCategories.length || overview.nextCategories.length) ? (
        <section className="panel-grid two-columns">
          <article className="panel table-panel">
            <div className="panel-heading"><div><p className="eyebrow">Wat ze kochten</p><h2>Favoriete categorieën</h2></div></div>
            {overview.favoriteCategories.length ? <Bars items={overview.favoriteCategories.map((item) => ({ label: item.category, value: item.profiles }))} /> : <p className="empty-state">Geen categorieën bekend.</p>}
          </article>
          <article className="panel table-panel">
            <div className="panel-heading"><div><p className="eyebrow">Wat ze waarschijnlijk zoeken</p><h2>Volgende categorie</h2></div></div>
            {overview.nextCategories.length ? <Bars items={overview.nextCategories.map((item) => ({ label: item.category, value: item.profiles }))} /> : <p className="empty-state">Nog geen betrouwbare aanbevelingen.</p>}
          </article>
        </section>
      ) : null}

      {overview.recommendedProducts.length ? (
        <section className="panel table-panel">
          <div className="panel-heading"><div><p className="eyebrow">Aanbevelingen</p><h2>Meest aanbevolen producten</h2></div></div>
          <div className="table-wrap"><table className="rfm-table">
            <thead><tr><th>Product</th><th>Product-ID</th><th>Aanbevolen aan</th><th>Als eerste aanbeveling</th></tr></thead>
            <tbody>{overview.recommendedProducts.map((product) => <tr key={product.id}><td>{product.name && product.name !== product.id ? product.name : "—"}</td><td><code>{product.id}</code></td><td>{number.format(product.profiles)}</td><td>{number.format(product.first)}</td></tr>)}</tbody>
          </table></div>
          <p className="rfm-hint">Handig voor voorraad en content: deze producten verschijnen het vaakst als productaanbeveling in {INSIGHTS_COLLECTION}.</p>
        </section>
      ) : null}
    </div>
  );
}
