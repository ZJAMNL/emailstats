import type { PropensityReport, Verdict } from "@/lib/predict/model";
import type { PredictionRunSummary } from "@/lib/predict/run";

const number = new Intl.NumberFormat("nl-NL");
const decimal = (value: number, digits = 2) => value.toLocaleString("nl-NL", { minimumFractionDigits: digits, maximumFractionDigits: digits });
const percent = (value: number) => `${(value * 100).toLocaleString("nl-NL", { maximumFractionDigits: 1 })}%`;

const featureLabels: Record<string, string> = {
  recency_log: "Dagen sinds laatste aankoop",
  frequency_log: "Aantal aankopen (12 maanden)",
  monetary_log: "Besteding (12 maanden)",
  bgnbd_expected_30: "Verwachte aankopen volgens klantwaardemodel",
  probability_alive: "Kans dat klant nog actief is",
  visits_7: "Bezoekdagen afgelopen week",
  visits_30: "Bezoekdagen afgelopen 30 dagen",
  views_30: "Productweergaven afgelopen 30 dagen",
  carts_30: "Winkelwagen-acties afgelopen 30 dagen",
  days_since_visit: "Dagen sinds laatste bezoek",
  views_favorite_category: "Bekeek eigen favoriete categorie",
  products_viewed_30: "Verschillende producten bekeken",
  categories_viewed_30: "Verschillende categorieën bekeken",
};

const verdictText: Record<Verdict, string> = {
  sterk: "Sterke voorspellende waarde",
  matig: "Bruikbare voorspellende waarde",
  onvoldoende: "Onvoldoende voorspellende waarde",
};

function VerdictBadge({ verdict }: { verdict: Verdict }) {
  return <span className={`predict-verdict is-${verdict}`}>{verdictText[verdict]}</span>;
}

function Propensity({ title, intro, report }: { title: string; intro: string; report: PropensityReport }) {
  if (report.status === "insufficient") {
    return (
      <article className="panel predict-card">
        <p className="eyebrow">{title}</p>
        <span className="predict-verdict is-onvoldoende">Nog niet te bepalen</span>
        <p className="rfm-hint">{report.reason}</p>
      </article>
    );
  }
  const high = report.bands.find((band) => band.band === "Hoog")!;
  const low = report.bands.find((band) => band.band === "Laag")!;
  return (
    <article className="panel predict-card">
      <p className="eyebrow">{title}</p>
      <VerdictBadge verdict={report.verdict} />
      <p className="rfm-hint">{intro}</p>
      <dl className="predict-figures">
        <div><dt>Onderscheidend vermogen (AUC)</dt><dd>{decimal(report.auc)}</dd><small>0,5 is gokken, 1 is perfect</small></div>
        <div><dt>Top 10% koopt</dt><dd>{decimal(report.lift, 1)}×</dd><small>zo vaak als gemiddeld</small></div>
        {report.baselineAuc !== null ? <div><dt>Alleen klantwaardemodel</dt><dd>{decimal(report.baselineAuc)}</dd><small>{report.auc > report.baselineAuc ? `+${decimal(report.auc - report.baselineAuc)} door product- en webdata` : "product- en webdata voegen niets toe"}</small></div> : null}
      </dl>
      <p className="predict-proof">In de test kocht <strong>{percent(high.purchaseRate)}</strong> van de groep ‘Hoog’ binnen 30 dagen, tegen <strong>{percent(low.purchaseRate)}</strong> van ‘Laag’ ({number.format(report.testProfiles)} profielen, {number.format(report.testPositives)} aankopen).</p>
      <details>
        <summary>Wat bepaalt de voorspelling?</summary>
        <ul className="predict-drivers">
          {report.drivers.slice(0, 6).map((driver) => <li key={driver.feature}><span>{featureLabels[driver.feature] ?? driver.feature}</span><span className={driver.weight >= 0 ? "trend-up" : "trend-down"}>{driver.weight >= 0 ? "verhoogt kans" : "verlaagt kans"}</span></li>)}
        </ul>
      </details>
      {!report.usable ? <p className="form-error">Dit model wordt niet gebruikt: {report.verdict === "onvoldoende" ? "het onderscheidt kopers te weinig." : "het voorspelt niet beter dan het bestaande klantwaardemodel."}</p> : null}
    </article>
  );
}

export function PredictReport({ summary }: { summary: PredictionRunSummary }) {
  const recommendations = summary.recommendations;
  const bands = (group: "buyers" | "prospects") => summary.scored.bands.filter((band) => band.group === group);
  const linked = summary.quality.lines + summary.quality.linesWithoutOrder + summary.quality.linesWithoutProduct;
  return (
    <>
      <section className="predict-cards">
        <Propensity intro="Wie van je bestaande kopers koopt de komende 30 dagen opnieuw?" report={summary.buyers} title="Koopkans kopers" />
        <Propensity intro="Welke websitebezoekers zonder aankoop gaan voor het eerst kopen?" report={summary.prospects} title="Koopkans prospects" />
        <article className="panel predict-card">
          <p className="eyebrow">Aanbevelingen</p>
          <VerdictBadge verdict={recommendations.verdict} />
          <p className="rfm-hint">Kochten klanten daarna een van de drie aanbevolen producten?</p>
          {recommendations.evaluated ? <dl className="predict-figures">
            <div><dt>Raak (product)</dt><dd>{recommendations.hitRate === null ? "—" : percent(recommendations.hitRate)}</dd><small>populairste producten: {recommendations.baselineHitRate === null ? "—" : percent(recommendations.baselineHitRate)}</small></div>
            <div><dt>Raak (categorie)</dt><dd>{recommendations.categoryHitRate === null ? "—" : percent(recommendations.categoryHitRate)}</dd><small>populairste categorieën: {recommendations.categoryBaselineHitRate === null ? "—" : percent(recommendations.categoryBaselineHitRate)}</small></div>
          </dl> : null}
          <p className="predict-proof">{number.format(recommendations.evaluated)} klanten kochten in de testperiode een product dat nieuw voor hen was.</p>
          {!recommendations.usable ? <p className="form-error">Aanbevelingen worden niet gebruikt: {recommendations.evaluated < 30 ? "te weinig aankopen om te toetsen." : "ze voorspellen niet duidelijk beter dan de populairste producten."}</p> : null}
        </article>
      </section>

      <section className="panel-grid two-columns">
        <article className="panel table-panel">
          <div className="panel-heading"><div><p className="eyebrow">Vandaag</p><h2>Koopintentie per groep</h2></div></div>
          <div className="table-wrap"><table className="rfm-table">
            <thead><tr><th>Koopintentie</th><th>Kopers</th><th>Prospects</th></tr></thead>
            <tbody>{(["Hoog", "Midden", "Laag"] as const).map((band) => <tr key={band}><td>{band}</td><td>{number.format(bands("buyers").find((item) => item.band === band)?.profiles ?? 0)}</td><td>{number.format(bands("prospects").find((item) => item.band === band)?.profiles ?? 0)}</td></tr>)}</tbody>
          </table></div>
          <p className="rfm-hint">{number.format(summary.scored.buyers)} kopers en {number.format(summary.scored.prospects)} prospects (bezoek in de afgelopen 90 dagen). ‘Hoog’ is de 10% met de hoogste kans, ‘Midden’ de 30% daarna.</p>
        </article>
        <article className="panel table-panel">
          <div className="panel-heading"><div><p className="eyebrow">Vandaag</p><h2>Waarschijnlijk volgende categorie</h2></div></div>
          {summary.scored.nextCategories.length ? <div className="table-wrap"><table className="rfm-table">
            <thead><tr><th>Categorie</th><th>Profielen</th></tr></thead>
            <tbody>{summary.scored.nextCategories.map((item) => <tr key={item.category}><td>{item.category}</td><td>{number.format(item.profiles)}</td></tr>)}</tbody>
          </table></div> : <p className="empty-state">Geen categorieën: de aanbevelingen worden niet gebruikt of de orderregels hebben geen categorie.</p>}
        </article>
      </section>

      <section className="panel table-panel">
        <div className="panel-heading"><div><p className="eyebrow">Datakwaliteit</p><h2>Gebruikte gegevens</h2></div></div>
        <div className="table-wrap"><table className="rfm-table"><tbody>
          <tr><td>Bruikbare orders</td><td>{number.format(summary.quality.orders)}</td></tr>
          <tr><td>Orderregels gekoppeld aan een order</td><td>{number.format(summary.quality.lines)} van {number.format(linked)}{summary.quality.linesWithoutOrder ? ` (${number.format(summary.quality.linesWithoutOrder)} zonder bekende order)` : ""}</td></tr>
          <tr><td>Verschillende producten</td><td>{number.format(summary.data.products)}</td></tr>
          <tr><td>Orderregels met categorie</td><td>{summary.data.lines ? percent(summary.data.linesWithCategory / summary.data.lines) : "—"}</td></tr>
          <tr><td>Webevents (laatste 120 dagen)</td><td>{number.format(summary.quality.events)}{summary.data.events ? `, waarvan ${percent(summary.data.eventsWithProduct / summary.data.events)} met product` : ""}</td></tr>
        </tbody></table></div>
        {summary.data.truncated.length ? <p className="form-error">Niet alle gegevens zijn gebruikt: {summary.data.truncated.join(" en ")}.</p> : null}
        {summary.quality.lines && summary.quality.linesWithoutOrder > summary.quality.lines ? <p className="form-error">De meeste orderregels konden niet aan een order worden gekoppeld. Controleer het veld ‘Verwijst naar order’ en het order-kenmerk.</p> : null}
        <p className="rfm-assumptions">Toetsing: het model wordt getraind op de situatie van 60 dagen geleden en getest op 30 dagen geleden, tegen wat er daarna echt gebeurde. Een model wordt alleen gebruikt bij een AUC van minimaal 0,65 en een top-10%-lift van minimaal 2×. Modellen en gegevens blijven per klant.</p>
      </section>
    </>
  );
}
