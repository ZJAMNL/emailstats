import { saveCostSettingsAction } from "@/app/cost-actions";
import { DashboardShell } from "@/components/dashboard-shell";
import { CostChart } from "@/components/cost-chart";
import { requireAdmin } from "@/lib/admin-access";
import { loadCostSettings, loadTenantUsage } from "@/lib/costs/data";
import { buildCostRows, packageLabel, portfolio, type CostPackage, type Signal } from "@/lib/costs/model";

export const dynamic = "force-dynamic";
export const metadata = { title: "Kosten en prijzen" };

const euro = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const euroCents = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const number = new Intl.NumberFormat("nl-NL");
const signalLabel: Record<Signal["tone"], string> = { critical: "Verlies", warning: "Let op", opportunity: "Kans", info: "Info" };
const packages: CostPackage[] = ["basis", "inzicht", "voorspellen"];

function megabytes(bytes: number) {
  return bytes < 1e6 ? `${number.format(Math.round(bytes / 1e3))} kB` : `${(bytes / 1e6).toLocaleString("nl-NL", { maximumFractionDigits: 1 })} MB`;
}

export default async function CostsPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const session = await requireAdmin();
  const { notice } = await searchParams;
  const isSuperAdmin = session.role === "superadmin";
  if (!process.env.DATABASE_URL) return <DashboardShell role="admin" title="Kosten en prijzen" subtitle="Kostprijs en geadviseerd bedrag per klant."><p className="empty-state">Configureer eerst de database.</p></DashboardShell>;

  const [settings, { usages, activeCustomers }] = await Promise.all([loadCostSettings(), loadTenantUsage(session)]);
  const rows = buildCostRows(usages, settings, activeCustomers);
  const totals = portfolio(rows, settings);
  const fixedTotal = settings.fixedCosts.reduce((sum, item) => sum + item.amount, 0);
  const measuring = usages.filter((usage) => usage.measuredDays > 0);
  const measuredDays = measuring.length ? Math.max(...measuring.map((usage) => usage.measuredDays)) : 0;

  return (
    <DashboardShell role="admin" title="Kosten en prijzen" subtitle={isSuperAdmin ? "Wat elke klant werkelijk kost, wat hij zou moeten betalen en waar actie nodig is." : "Kostprijs en geadviseerd bedrag voor jouw klanten."}>
      {notice === "saved" ? <p className="form-success" role="status">De aannames zijn opgeslagen; alle bedragen zijn opnieuw berekend.</p> : null}

      <section className="rfm-kpis">
        <article className="panel rfm-kpi rfm-kpi-accent"><span>Geadviseerde omzet per maand</span><strong>{euro.format(totals.revenue)}</strong><small>{euro.format(totals.partnerRevenue)} bij partnerprijs (−{Math.round(settings.partnerDiscount * 100)}%)</small></article>
        <article className="panel rfm-kpi"><span>Kosten per maand</span><strong>{euro.format(totals.cost)}</strong><small>verbruik {euro.format(totals.usageCost)} · vast {euro.format(totals.fixedCost)} · inzet {euro.format(totals.supportCost)}</small></article>
        <article className="panel rfm-kpi"><span>Marge</span><strong>{euro.format(totals.margin)}</strong><small>{totals.marginRate === null ? "—" : `${Math.round(totals.marginRate * 100)}% van de omzet`}{totals.lossMaking ? ` · ${totals.lossMaking} verliesgevend` : ""}</small></article>
        <article className="panel rfm-kpi"><span>Groeipotentieel per maand</span><strong>{euro.format(totals.upsell)}</strong><small>klanten met orderdata zonder Voorspellen{totals.unrealized ? ` · ${totals.unrealized} onboarding niet af` : ""}</small></article>
      </section>
      <p className="rfm-meta">{packages.map((pkg) => `${totals.perPackage[pkg]} × ${packageLabel[pkg]}`).join(" · ")} · vaste platformkosten {euro.format(fixedTotal)} per maand verdeeld over {activeCustomers} actieve klanten · rekentijd {measuredDays ? `gemeten over ${measuredDays} ${measuredDays === 1 ? "dag" : "dagen"}${measuredDays < 30 ? ", omgerekend naar een maand" : ""}` : "nog niet gemeten (vanaf de eerste nachtelijke run)"}</p>

      <section className="panel table-panel">
        <div className="panel-heading"><div><p className="eyebrow">Per klant</p><h2>Kostprijs tegenover advies</h2></div></div>
        <CostChart rows={rows.filter((row) => row.usage.active)} />
      </section>

      <section className="panel table-panel">
        <div className="panel-heading"><div><p className="eyebrow">Uitsplitsing</p><h2>Kosten, advies en signalen</h2></div><span className="tab">verliesgevend eerst</span></div>
        <div className="table-wrap"><table className="rfm-table cost-table">
          <thead><tr><th>Klant</th><th>Pakket</th><th>Profielen</th><th>Verbruik</th><th>Vast</th><th>Inzet</th><th>Kostprijs</th><th>Advies</th><th>Marge</th></tr></thead>
          {rows.map((row) => (
            <tbody className={row.usage.active ? undefined : "is-inactive"} key={row.usage.id}>
            <tr>
              <td><strong>{row.usage.name}</strong>{isSuperAdmin && row.usage.owner ? <small className="cost-owner">{row.usage.owner}</small> : null}</td>
              <td>{packageLabel[row.price.package]}</td>
              <td>{row.usage.profiles ? number.format(row.usage.profiles) : "—"}</td>
              <td>{euroCents.format(row.cost.usage)}<small className="cost-sub">opslag {megabytes(row.usage.storageBytes)} · {euroCents.format(row.cost.storage)}</small><small className="cost-sub">rekentijd {row.usage.measuredDays ? `${row.usage.jobHoursPerMonth.toLocaleString("nl-NL", { maximumFractionDigits: 1 })} u` : "nog niet gemeten"} · {euroCents.format(row.cost.compute)}</small>{row.cost.email ? <small className="cost-sub">e-mail {euroCents.format(row.cost.email)}</small> : null}</td>
              <td>{euroCents.format(row.cost.fixed)}</td>
              <td>{euro.format(row.cost.support)}</td>
              <td><strong>{euro.format(row.cost.total)}</strong></td>
              <td><strong>{euro.format(row.price.total)}</strong>{row.price.volume ? <small className="cost-sub">incl. {euro.format(row.price.volume)} volume</small> : null}{row.price.total ? <small className="cost-sub">partner {euro.format(row.price.partner)}</small> : null}</td>
              <td className={row.margin < 0 ? "trend-down" : "trend-up"}><strong>{euro.format(row.margin)}</strong>{row.price.total ? <small className="cost-sub">{Math.round((row.margin / row.price.total) * 100)}%</small> : null}</td>
            </tr>
            {row.signals.length ? <tr className="cost-signal-row"><td colSpan={9}><ul className="cost-signals">{row.signals.map((signal) => <li className={`is-${signal.tone}`} key={signal.text}><span>{signalLabel[signal.tone]}</span> {signal.text}</li>)}</ul></td></tr> : null}
            </tbody>
          ))}
        </table></div>
      </section>

      <section className="panel table-panel">
        <div className="panel-heading"><div><p className="eyebrow">Aannames</p><h2>Hoe wordt dit berekend?</h2></div></div>
        <ul className="cost-explain">
          <li><strong>Verbruik</strong>: opslag (rijen van de klant × gemiddelde rijgrootte per tabel, uit de database zelf) × {euroCents.format(settings.storagePerGbMonth)} per GB, plus de gemeten duur van de nachtelijke taken (synchronisatie, RFM, voorspellingen, wegschrijven, alerts) × {euroCents.format(settings.computePerHour)} per uur, plus alert-e-mails × {euroCents.format(settings.emailPerThousand)} per 1.000.</li>
          <li><strong>Vast</strong>: de platformkosten ({euro.format(fixedTotal)} per maand) gelijk verdeeld over de actieve klanten.</li>
          <li><strong>Inzet</strong>: support- en beheertijd per pakket × {euro.format(settings.supportRate)} per uur. Voor de meeste klanten de grootste kostenpost.</li>
          <li><strong>Advies</strong>: het pakket waar de klant echt iets aan heeft (Voorspellen &gt; Inzicht &gt; Basis), plus een toeslag per 100.000 profielen boven {number.format(settings.includedProfiles)}. Een module die aan staat maar nog geen resultaat geeft, of een voorspelmodel dat de toets niet haalt, wordt niet gefactureerd.</li>
        </ul>
        {isSuperAdmin ? (
          <form action={saveCostSettingsAction} className="cost-settings">
            <fieldset>
              <legend>Vaste platformkosten per maand</legend>
              {[...settings.fixedCosts, { label: "", amount: 0 }].map((item, index) => (
                <div className="cost-fixed-row" key={index}>
                  <input aria-label="Omschrijving" defaultValue={item.label} name="fixedLabel" placeholder="Nieuwe kostenpost" />
                  <input aria-label="Bedrag per maand" defaultValue={item.label ? item.amount : ""} inputMode="decimal" name="fixedAmount" placeholder="€" />
                </div>
              ))}
              <small>Maak een omschrijving leeg om de post te verwijderen.</small>
            </fieldset>
            <fieldset>
              <legend>Verbruik en inzet</legend>
              <label>Rekentijd per uur (€)<input defaultValue={settings.computePerHour} inputMode="decimal" name="computePerHour" /></label>
              <label>Opslag per GB per maand (€)<input defaultValue={settings.storagePerGbMonth} inputMode="decimal" name="storagePerGbMonth" /></label>
              <label>E-mail per 1.000 (€)<input defaultValue={settings.emailPerThousand} inputMode="decimal" name="emailPerThousand" /></label>
              <label>Uurtarief support (€)<input defaultValue={settings.supportRate} inputMode="decimal" name="supportRate" /></label>
              {packages.map((pkg) => <label key={pkg}>Supporturen per maand · {packageLabel[pkg]}<input defaultValue={settings.supportHours[pkg]} inputMode="decimal" name={`hours-${pkg}`} /></label>)}
            </fieldset>
            <fieldset>
              <legend>Prijzen per maand</legend>
              {packages.map((pkg) => <label key={pkg}>{packageLabel[pkg]} (€)<input defaultValue={settings.prices[pkg]} inputMode="decimal" name={`price-${pkg}`} /></label>)}
              <label>Inbegrepen profielen<input defaultValue={settings.includedProfiles} inputMode="numeric" name="includedProfiles" /></label>
              <label>Per 100.000 extra · Inzicht (€)<input defaultValue={settings.extraPer100k.inzicht} inputMode="decimal" name="extra-inzicht" /></label>
              <label>Per 100.000 extra · Voorspellen (€)<input defaultValue={settings.extraPer100k.voorspellen} inputMode="decimal" name="extra-voorspellen" /></label>
              <label>Partnerkorting (%)<input defaultValue={Math.round(settings.partnerDiscount * 100)} inputMode="numeric" name="partnerDiscount" /></label>
            </fieldset>
            <button className="button button-primary" type="submit">Aannames opslaan</button>
          </form>
        ) : <p className="rfm-hint">De aannames worden beheerd door de superbeheerder.</p>}
      </section>
    </DashboardShell>
  );
}
