import Link from "next/link";
import { notFound } from "next/navigation";
import { campaignAutoIncludeAction } from "@/app/campaign-actions";
import { CampaignFiltersForm } from "@/components/campaign-filters-form";
import { CampaignSelectionTable } from "@/components/campaign-selection-table";
import { CustomerDataTabs } from "@/components/customer-data-tabs";
import { DashboardShell } from "@/components/dashboard-shell";
import { CAMPAIGN_PAGE_SIZE, campaignFilterQuery, campaignOrderBy, campaignStatuses, campaignWhere, parseCampaignFilters } from "@/lib/campaign-filters";
import { getPrismaClient } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { readCampaignAutoInclude, readTenantDashboardModules } from "@/lib/tenant-settings";
import { requireTenantManager } from "@/lib/webshops";

export const dynamic = "force-dynamic";
export const metadata = { title: "E-mailcampagnes kiezen" };

const number = new Intl.NumberFormat("nl-NL");
const base = "/dashboard/customer/data/campagnes";

export default async function CustomerCampaignSelection({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requireRole("customer");
  if (!process.env.DATABASE_URL) notFound();
  if (!(await requireTenantManager(session))) notFound();
  const params = await searchParams;
  const filters = parseCampaignFilters(params);
  const prisma = getPrismaClient();
  const where = campaignWhere(session.tenantId, filters);

  // Round 1: counts and settings. Round 2: only the rows of this page.
  const [tenant, byStatus, filteredCount] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: session.tenantId }, select: { settings: true } }),
    prisma.campaign.groupBy({ by: ["included"], where: { tenantId: session.tenantId }, _count: { _all: true } }),
    prisma.campaign.count({ where }),
  ]);
  const modules = readTenantDashboardModules(tenant?.settings);
  const autoInclude = readCampaignAutoInclude(tenant?.settings);
  const total = byStatus.reduce((sum, row) => sum + row._count._all, 0);
  const shown = byStatus.find((row) => row.included)?._count._all ?? 0;
  const pages = Math.max(1, Math.ceil(filteredCount / CAMPAIGN_PAGE_SIZE));
  const current = { ...filters, pagina: Math.min(filters.pagina, pages) };
  const rows = modules.campaignStats && filteredCount ? await prisma.campaign.findMany({
    where,
    orderBy: campaignOrderBy(current.sort),
    skip: (current.pagina - 1) * CAMPAIGN_PAGE_SIZE,
    take: CAMPAIGN_PAGE_SIZE,
    select: { id: true, name: true, sentAt: true, sentCount: true, openCount: true, included: true },
  }) : [];

  const melding = typeof params.melding === "string" ? params.melding : null;
  const aantal = Number(params.aantal ?? 0);
  const notice = melding === "getoond" ? `${number.format(aantal)} ${aantal === 1 ? "campagne wordt" : "campagnes worden"} nu getoond.`
    : melding === "verborgen" ? `${number.format(aantal)} ${aantal === 1 ? "campagne is" : "campagnes zijn"} verborgen.`
      : melding === "instelling-opgeslagen" ? "De instelling is opgeslagen." : null;
  const href = (patch: Partial<typeof current>) => `${base}${campaignFilterQuery(current, { pagina: 1, ...patch })}`;
  const hasFilters = Boolean(current.q || current.status !== "alle" || current.periode !== "alle");

  return (
    <DashboardShell role="customer" title="Beheer" subtitle="Kies welke e-mailcampagnes je dashboard toont en meetelt.">
      <CustomerDataTabs current="campagnes" showCampaigns={modules.campaignStats} />
      {!modules.campaignStats ? <section className="panel table-panel"><p className="empty-state">De beheerder heeft campagnestatistieken voor dit klantaccount uitgeschakeld.</p></section> : <>
        {notice ? <p className="form-success" role="status">{notice}</p> : null}
        {melding === "niets-geselecteerd" ? <p className="form-error" role="alert">Selecteer eerst een of meer campagnes.</p> : null}

        <section className="panel campaign-summary">
          <div>
            <p className="eyebrow">E-mailcampagnes</p>
            <h2>{number.format(shown)} van {number.format(total)} campagnes worden getoond</h2>
            <p className="rfm-hint">Verborgen campagnes, zoals testmailings of interne mails, tellen niet mee in je dashboard, de campagne-overzichten en de alerts. Ze worden niet verwijderd: je kunt ze altijd weer tonen.</p>
          </div>
          <form action={campaignAutoIncludeAction} className="campaign-auto">
            <label className="rfm-check"><input defaultChecked={autoInclude} name="autoInclude" type="checkbox" /> Nieuwe campagnes automatisch tonen</label>
            <button className="button button-secondary" type="submit">Opslaan</button>
            <small>{autoInclude ? "Zet dit uit als je liever zelf kiest welke nieuwe campagnes meetellen." : "Nieuwe campagnes komen verborgen binnen; zet ze hier aan."}</small>
          </form>
        </section>

        {total === 0 ? <section className="panel table-panel"><p className="empty-state">Nog geen campagnes gesynchroniseerd. Synchroniseer een periode via <Link href="/dashboard/customer/campaigns">Campagnes</Link>.</p></section> : (
          <section className="panel table-panel">
            <div className="campaign-toolbar">
              <nav aria-label="Status" className="segmented-control">
                {(Object.keys(campaignStatuses) as (keyof typeof campaignStatuses)[]).map((status) => (
                  <Link aria-current={current.status === status ? "page" : undefined} href={href({ status })} key={status}>
                    {campaignStatuses[status]} <span className="campaign-count">{number.format(status === "alle" ? total : status === "getoond" ? shown : total - shown)}</span>
                  </Link>
                ))}
              </nav>
              <CampaignFiltersForm filters={current} />
            </div>
            <p className="campaign-results" aria-live="polite">
              {number.format(filteredCount)} {filteredCount === 1 ? "resultaat" : "resultaten"}{pages > 1 ? ` · pagina ${number.format(current.pagina)} van ${number.format(pages)}` : ""}
              {hasFilters ? <> · <Link href={base}>Filters wissen</Link></> : null}
            </p>
            {rows.length ? <>
              <CampaignSelectionTable filteredCount={filteredCount} filters={current} rows={rows.map((row) => ({ id: row.id, name: row.name, sentAt: row.sentAt?.toISOString() ?? null, sentCount: row.sentCount, openRate: row.sentCount ? (row.openCount / row.sentCount) * 100 : null, included: row.included }))} />
              {pages > 1 ? (
                <nav aria-label="Pagina's" className="campaign-pagination">
                  {current.pagina > 1 ? <Link className="button button-secondary" href={href({ pagina: current.pagina - 1 })}>Vorige</Link> : <span />}
                  <span>Pagina {number.format(current.pagina)} van {number.format(pages)}</span>
                  {current.pagina < pages ? <Link className="button button-secondary" href={href({ pagina: current.pagina + 1 })}>Volgende</Link> : <span />}
                </nav>
              ) : null}
            </> : <p className="empty-state">Geen campagnes gevonden met deze filters. <Link href={base}>Filters wissen</Link></p>}
          </section>
        )}
      </>}
    </DashboardShell>
  );
}
