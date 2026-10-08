import Link from "next/link";
import { BarChart3, Gem, GitCompareArrows, LineChart, MailOpen, Users } from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { getPrismaClient } from "@/lib/prisma";
import type { RfmRunSummary } from "@/lib/rfm/run";
import { requireRole } from "@/lib/session";
import { readSelectionRatios, readTenantDashboardModules } from "@/lib/tenant-settings";
import { canManageTenant, filterCampaigns, getCustomerScope, type WebshopDefinition } from "@/lib/webshops";

export const dynamic = "force-dynamic";
export const metadata = { title: "Uitleg modellen" };

const number = new Intl.NumberFormat("nl-NL");
const date = (value: Date | null | undefined) => value ? value.toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" }) : "—";

type Status = { tone: "ok" | "off" | "missing"; text: string };

export default async function CustomerExplanation() {
  const session = await requireRole("customer");
  const { allowed, current: scope } = await getCustomerScope(session);
  const data = process.env.DATABASE_URL ? await loadData(session.tenantId, scope?.webshop ?? null).catch(() => null) : null;
  const modules = readTenantDashboardModules(data?.tenant?.settings);
  const rfm = data?.tenant?.rfmConfig;
  const summary = rfm?.enabled && rfm.lastRunSummary ? rfm.lastRunSummary as unknown as RfmRunSummary : null;
  const rfmVisible = Boolean(summary && rfm?.customerVisible && canManageTenant(allowed));
  const connected = Boolean(data?.tenant?.copernica);
  const ratioCount = Object.keys(readSelectionRatios(data?.tenant?.settings)).length;

  const statuses: Record<string, Status> = {
    selections: !connected ? { tone: "missing", text: "Copernica is nog niet gekoppeld." }
      : !modules.databaseStats ? { tone: "off", text: "Niet ingeschakeld voor jouw account." }
      : data!.enabledSelections ? { tone: "ok", text: `${data!.enabledSelections} van ${number.format(data!.selections)} selecties gevolgd, gemeten sinds ${date(data!.firstSnapshot)}.` }
      : { tone: "missing", text: `${number.format(data!.selections)} selecties beschikbaar, nog geen gekozen.` },
    ratios: !modules.databaseStats ? { tone: "off", text: "Niet ingeschakeld voor jouw account." }
      : ratioCount ? { tone: "ok", text: `${ratioCount} ${ratioCount === 1 ? "widget toont" : "widgets tonen"} een verhouding.` }
      : { tone: "missing", text: "Nog geen verhouding ingesteld. Kies via het potlood op een widget ‘Vergelijk met andere selectie’." },
    campaigns: !connected ? { tone: "missing", text: "Copernica is nog niet gekoppeld." }
      : !modules.campaignStats ? { tone: "off", text: "Niet ingeschakeld voor jouw account." }
      : data!.campaigns ? { tone: "ok", text: `${number.format(data!.campaigns)} campagnes, van ${date(data!.firstCampaign)} tot ${date(data!.lastCampaign)}.` }
      : { tone: "missing", text: "Nog geen campagnes gesynchroniseerd." },
    rfm: rfmVisible ? { tone: "ok", text: `Actief op ${number.format(summary!.quality.usedOrders)} orders uit de collectie ‘${rfm!.collectionName}’: ${number.format(summary!.value.customers)} klanten in de afgelopen ${summary!.settings.windowMonths} maanden.` }
      : { tone: "off", text: "Niet ingeschakeld voor jouw account. Je beheerder kan het instellen als je orders in Copernica staan." },
    clv: !rfmVisible ? { tone: "off", text: "Beschikbaar zodra het RFM-model voor je is ingeschakeld." }
      : summary!.clv?.status === "ok" ? { tone: "ok", text: `Voorspeld voor ${number.format(summary!.clv.customers)} kopers, waarvan ${number.format(summary!.clv.repeatCustomers)} met een herhaalaankoop.` }
      : { tone: "missing", text: summary!.clv?.status === "insufficient" ? summary!.clv.message : "Wordt berekend bij de volgende update." },
    cohorts: !rfmVisible ? { tone: "off", text: "Beschikbaar zodra het RFM-model voor je is ingeschakeld." }
      : summary!.cohorts?.length ? { tone: "ok", text: `${summary!.cohorts.length} maanden met nieuwe klanten te volgen.` }
      : { tone: "missing", text: "Wordt berekend bij de volgende update." },
  };

  const models = [
    { key: "selections", icon: BarChart3, title: "Selectiewidgets", question: "Hoeveel profielen zitten er in mijn belangrijkste groepen, en groeit dat?", how: "Elke nacht tellen we hoeveel profielen er in de Copernica-selecties zitten die je volgt. Zo ontstaat een tijdlijn per selectie. Met Dag, Week, Maand en Jaar zie je het verschil met eerder.", uses: "Je Copernica-selecties (views) en een dagelijkse telling.", caveat: "Een profiel dat in meerdere selecties staat, telt in elke selectie mee.", href: "/dashboard/customer" },
    { key: "ratios", icon: GitCompareArrows, title: "Verhoudingen tussen selecties", question: "Welk deel van mijn database heeft bijvoorbeeld een opt-in, en verbetert dat?", how: "Een widget toont zijn aantal als percentage van een andere selectie. Het verschil met eerder staat in procentpunten: van 50% naar 52% is +2 pt.", uses: "Twee selecties die je volgt, gemeten op dezelfde dag.", caveat: "Vergelijk selecties die logisch bij elkaar horen, zoals opt-ins binnen je totale database.", href: "/dashboard/customer" },
    { key: "campaigns", icon: MailOpen, title: "Campagnestatistieken", question: "Hoe presteren mijn mailings?", how: "Per mailing halen we het aantal ontvangers, openingen en kliks op. Open rate = openingen ÷ ontvangers, CTR = kliks ÷ ontvangers.", uses: "De HTML- en drag-and-drop-mailings uit je Copernica-database.", caveat: "Apple Mail opent afbeeldingen automatisch, waardoor de open rate hoger lijkt dan in werkelijkheid. Kliks zijn een betrouwbaardere maat voor interesse.", href: "/dashboard/customer/campaigns" },
    { key: "rfm", icon: Gem, title: "RFM-model", question: "Wie zijn mijn beste klanten, en wie dreig ik te verliezen?", how: "Elke klant krijgt een score van 1 tot 5 voor Recency (hoe kort geleden), Frequency (hoe vaak) en Monetary (hoeveel besteed). De combinatie bepaalt een van 11 segmenten, zoals Kampioenen of Risico, met een aanpak per segment.", uses: "De orders in je Copernica-collectie: datum, bedrag en het profiel dat bestelde.", caveat: "RFM kijkt terug: het beschrijft wat klanten deden, niet wat ze gaan doen. Daarvoor is de voorspelde klantwaarde.", href: "/dashboard/customer/rfm" },
    { key: "clv", icon: LineChart, title: "Voorspelde klantwaarde (CLV)", question: "Hoeveel gaan mijn klanten de komende 12 maanden nog opleveren?", how: "Twee beproefde statistische modellen voorspellen per klant het aantal aankopen (BG/NBD) en het bedrag per aankoop (Gamma-Gamma). Ze rekenen met het eigen koopritme van elke klant, en geven ook de kans dat iemand nog actief is. Opgeteld, plus de verwachte waarde van profielen die nog niet kochten, is dat de waarde van je database.", uses: "Dezelfde orders als het RFM-model, over je hele orderhistorie.", caveat: "Een voorspelling op basis van het verleden. Grote veranderingen, zoals een nieuw assortiment, ziet het model pas terug in nieuwe orders.", href: "/dashboard/customer/rfm" },
    { key: "cohorts", icon: Users, title: "Cohortanalyse", question: "Houden we nieuwe klanten beter vast dan vorig jaar?", how: "Klanten worden gegroepeerd op de maand van hun eerste aankoop. Per groep zie je welk deel in de maanden daarna opnieuw kocht, en hoeveel omzet een klant gemiddeld opleverde na 1, 3, 6, 12 en 24 maanden.", uses: "De orders in je Copernica-collectie, vanaf de allereerste aankoop.", caveat: "Vergelijk bij seizoensgebonden verkoop een maand met dezelfde maand een jaar eerder.", href: "/dashboard/customer/rfm" },
  ];

  return (
    <DashboardShell role="customer" title="Uitleg modellen" subtitle="Wat de cijfers op je dashboard betekenen, op welke gegevens ze zijn gebaseerd en wat er voor jouw account beschikbaar is.">
      <section className="panel table-panel">
        <div className="panel-heading"><div><p className="eyebrow">Jouw gegevens</p><h2>Wat er voor jouw account beschikbaar is</h2></div></div>
        <div className="table-wrap">
          <table className="explain-status-table">
            <thead><tr><th>Model</th><th>Beantwoordt</th><th>Status bij jou</th></tr></thead>
            <tbody>{models.map((model) => <tr key={model.key}><td><a href={`#${model.key}`}>{model.title}</a></td><td>{model.question}</td><td><span className={`explain-status explain-status-${statuses[model.key].tone}`}>{statuses[model.key].tone === "ok" ? "Beschikbaar" : statuses[model.key].tone === "off" ? "Niet ingeschakeld" : "Nog niet compleet"}</span><small>{statuses[model.key].text}</small></td></tr>)}</tbody>
          </table>
        </div>
        <p className="explain-source">Bron van alle cijfers: je Copernica-database{data?.tenant?.copernica ? ` (database ${data.tenant.copernica.databaseId}, laatst bijgewerkt ${date(data.tenant.copernica.lastSyncedAt)})` : ""}. Je ziet alleen de gegevens van je eigen account.</p>
      </section>

      <section className="explain-grid">
        {models.map(({ key, icon: Icon, title, question, how, uses, caveat, href }) => (
          <article className="panel explain-card" id={key} key={key}>
            <div className="explain-card-head"><span className="benefit-icon"><Icon size={20} /></span><div><h2>{title}</h2><p className="explain-question">{question}</p></div></div>
            <dl>
              <div><dt>Hoe het werkt</dt><dd>{how}</dd></div>
              <div><dt>Gebruikt</dt><dd>{uses}</dd></div>
              <div><dt>Bij jou</dt><dd><span className={`explain-status explain-status-${statuses[key].tone}`}>{statuses[key].tone === "ok" ? "Beschikbaar" : statuses[key].tone === "off" ? "Niet ingeschakeld" : "Nog niet compleet"}</span> {statuses[key].text}</dd></div>
              <div><dt>Let op</dt><dd>{caveat}</dd></div>
            </dl>
            {statuses[key].tone === "ok" ? <Link className="explain-link" href={href}>Bekijken →</Link> : null}
          </article>
        ))}
      </section>
    </DashboardShell>
  );
}

async function loadData(tenantId: string, webshop: WebshopDefinition | null) {
  const prisma = getPrismaClient();
  const [tenant, selections, enabledSelections, firstSnapshot, campaignStats] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { settings: true, copernica: { select: { databaseId: true, lastSyncedAt: true } }, rfmConfig: true } }),
    prisma.copernicaSelection.count({ where: { tenantId } }),
    prisma.copernicaSelection.count({ where: { tenantId, enabled: true } }),
    prisma.selectionSnapshot.findFirst({ where: { scope: "all", selection: { tenantId, enabled: true } }, orderBy: { measuredAt: "asc" }, select: { measuredAt: true } }),
    prisma.campaign.findMany({ where: { tenantId }, select: { name: true, sentAt: true } }),
  ]);
  const campaigns = filterCampaigns(campaignStats, webshop);
  const dates = campaigns.map((campaign) => campaign.sentAt?.getTime()).filter((time): time is number => time !== undefined).sort((left, right) => left - right);
  return { tenant, selections, enabledSelections, firstSnapshot: firstSnapshot?.measuredAt ?? null, campaigns: campaigns.length, firstCampaign: dates.length ? new Date(dates[0]) : null, lastCampaign: dates.length ? new Date(dates[dates.length - 1]) : null };
}
