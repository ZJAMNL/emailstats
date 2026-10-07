import { CalendarDays, RefreshCw } from "lucide-react";
import { syncCampaignsAction } from "@/app/actions";
import { DashboardShell } from "@/components/dashboard-shell";
import { getPrismaClient } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const dynamic = "force-dynamic";

type CampaignPageProps = {
  searchParams: Promise<{ from?: string; to?: string; error?: string; notice?: string }>;
};

export default async function CustomerCampaigns({ searchParams }: CampaignPageProps) {
  const session = await requireRole("customer");
  const params = await searchParams;
  const from = validDate(params.from) ? params.from ?? "" : "";
  const to = validDate(params.to) ? params.to ?? "" : "";
  let campaigns: Awaited<ReturnType<typeof loadCampaigns>> = [];
  let databaseUnavailable = false;

  if (process.env.DATABASE_URL) {
    try {
      campaigns = await loadCampaigns(session.tenantId, from, to);
    } catch {
      databaseUnavailable = true;
    }
  } else {
    databaseUnavailable = true;
  }

  return (
    <DashboardShell role="customer" title="Campagnes" subtitle="Bekijk Copernica-mailingresultaten binnen een gekozen periode.">
      {params.notice === "synced" ? <p className="form-success" role="status">Campagnes voor deze periode zijn bijgewerkt.</p> : null}
      {params.error === "sync-failed" ? <p className="form-error" role="alert">Synchroniseren is niet gelukt. Controleer eerst de Copernica-koppeling.</p> : null}
      {params.error === "invalid-date" ? <p className="form-error" role="alert">Kies een geldige start- en einddatum.</p> : null}
      {databaseUnavailable ? <p className="form-error" role="status">Campagnegegevens zijn nog niet beschikbaar: PostgreSQL moet eerst worden geconfigureerd en gemigreerd.</p> : null}

      <section className="panel campaign-filter-panel">
        <div className="panel-heading"><div><p className="eyebrow">Periode</p><h2>Filter campagnes</h2></div><CalendarDays size={19} /></div>
        <form action={syncCampaignsAction} className="date-filter customer-form">
          <label>Van<input name="from" type="date" defaultValue={from} required /></label>
          <label>Tot en met<input name="to" type="date" defaultValue={to} required /></label>
          <button className="button button-primary" type="submit"><RefreshCw size={15} /> Periode synchroniseren</button>
        </form>
      </section>

      <section className="panel table-panel">
        <div className="panel-heading"><div><p className="eyebrow">Mailings</p><h2>Campagneresultaten</h2></div><span className="tab">{campaigns.length} campagnes</span></div>
        {campaigns.length === 0 ? <p className="empty-state">Geen campagnes voor deze periode. Synchroniseer een periode of pas de datums aan.</p> : <div className="table-wrap"><table><thead><tr><th>Campagne</th><th>Verzonden op</th><th>Ontvangers</th><th>Openingen</th><th>Klikken</th><th>CTR</th></tr></thead><tbody>{campaigns.map((campaign) => <tr key={campaign.id}><td>{campaign.name}</td><td>{campaign.sentAt?.toLocaleDateString("nl-NL") ?? "-"}</td><td>{campaign.sentCount.toLocaleString("nl-NL")}</td><td>{campaign.openCount.toLocaleString("nl-NL")}</td><td>{campaign.clickCount.toLocaleString("nl-NL")}</td><td>{campaign.sentCount ? `${((campaign.clickCount / campaign.sentCount) * 100).toFixed(1)}%` : "-"}</td></tr>)}</tbody></table></div>}
      </section>
    </DashboardShell>
  );
}

function loadCampaigns(tenantId: string, from: string, to: string) {
  const sentAt = from || to ? {
    ...(from ? { gte: new Date(`${from}T00:00:00.000Z`) } : {}),
    ...(to ? { lte: new Date(`${to}T23:59:59.999Z`) } : {}),
  } : undefined;

  return getPrismaClient().campaign.findMany({
    where: { tenantId, ...(sentAt ? { sentAt } : {}) },
    orderBy: [{ sentAt: "desc" }, { name: "asc" }],
    take: 500,
  });
}

function validDate(value?: string) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().startsWith(value);
}