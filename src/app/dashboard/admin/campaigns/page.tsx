import { CalendarDays } from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { getPrismaClient } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const dynamic = "force-dynamic";

type CampaignPageProps = {
  searchParams: Promise<{ from?: string; to?: string }>;
};

export default async function AdminCampaigns({ searchParams }: CampaignPageProps) {
  await requireRole("admin");
  const params = await searchParams;
  const from = validDate(params.from) ? params.from ?? "" : "";
  const to = validDate(params.to) ? params.to ?? "" : "";
  let campaigns: Awaited<ReturnType<typeof loadCampaigns>> = [];
  let databaseUnavailable = false;

  if (process.env.DATABASE_URL) {
    try {
      campaigns = await loadCampaigns(from, to);
    } catch {
      databaseUnavailable = true;
    }
  } else {
    databaseUnavailable = true;
  }

  return (
    <DashboardShell role="admin" title="Campagnes over alle klanten" subtitle="Vergelijk verzonden mailings en resultaten per tenant.">
      {databaseUnavailable ? <p className="form-error" role="status">Campagnegegevens zijn nog niet beschikbaar: configureer en migreer eerst PostgreSQL.</p> : null}
      <section className="panel campaign-filter-panel">
        <div className="panel-heading"><div><p className="eyebrow">Periode</p><h2>Filter campagnes</h2></div><CalendarDays size={19} /></div>
        <form action="/dashboard/admin/campaigns" className="date-filter customer-form">
          <label>Van<input name="from" type="date" defaultValue={from} /></label>
          <label>Tot en met<input name="to" type="date" defaultValue={to} /></label>
          <button className="button button-primary" type="submit">Filteren</button>
        </form>
      </section>
      <section className="panel table-panel">
        <div className="panel-heading"><div><p className="eyebrow">Mailings</p><h2>Campagneresultaten</h2></div><span className="tab">{campaigns.length} campagnes</span></div>
        {campaigns.length === 0 ? <p className="empty-state">Geen campagnegegevens voor deze periode.</p> : <div className="table-wrap"><table><thead><tr><th>Klant</th><th>Campagne</th><th>Verzonden op</th><th>Ontvangers</th><th>Openingen</th><th>Klikken</th><th>CTR</th></tr></thead><tbody>{campaigns.map((campaign) => <tr key={campaign.id}><td>{campaign.tenant.name}</td><td>{campaign.name}</td><td>{campaign.sentAt?.toLocaleDateString("nl-NL") ?? "-"}</td><td>{campaign.sentCount.toLocaleString("nl-NL")}</td><td>{campaign.openCount.toLocaleString("nl-NL")}</td><td>{campaign.clickCount.toLocaleString("nl-NL")}</td><td>{campaign.sentCount ? `${((campaign.clickCount / campaign.sentCount) * 100).toFixed(1)}%` : "-"}</td></tr>)}</tbody></table></div>}
      </section>
    </DashboardShell>
  );
}

function loadCampaigns(from: string, to: string) {
  const sentAt = from || to ? {
    ...(from ? { gte: new Date(`${from}T00:00:00.000Z`) } : {}),
    ...(to ? { lte: new Date(`${to}T23:59:59.999Z`) } : {}),
  } : undefined;

  return getPrismaClient().campaign.findMany({
    where: sentAt ? { sentAt } : undefined,
    include: { tenant: { select: { name: true } } },
    orderBy: [{ sentAt: "desc" }, { tenant: { name: "asc" } }],
    take: 1000,
  });
}

function validDate(value?: string) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().startsWith(value);
}