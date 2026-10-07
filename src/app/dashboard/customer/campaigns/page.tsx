import { Gauge, TrendingUp } from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { campaigns } from "@/lib/dashboard-data";
import { requireRole } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function CustomerCampaigns() {
  await requireRole("customer");

  return (
    <DashboardShell role="customer" title="Campagnes" subtitle="Monitor prestaties, resultaten en optimale contactmomenten.">
      <section className="campaign-grid">{campaigns.northwind.map((campaign) => <article key={campaign.name} className="panel campaign-card"><div className="campaign-card-header"><div><p className="eyebrow">Campagne</p><h2>{campaign.name}</h2></div><span className={`status-badge status-${campaign.status}`}>{campaign.status}</span></div><div className="campaign-metrics"><div><Gauge size={17} /><strong>{campaign.delivered.toLocaleString("nl-NL")}</strong><span>Verzonden</span></div><div><TrendingUp size={17} /><strong>{Math.round((campaign.clicks / campaign.delivered) * 1000) / 10}%</strong><span>CTR</span></div></div><div className="campaign-footer"><span>Bijdrage: {campaign.revenue}</span><button type="button">Details</button></div></article>)}</section>
    </DashboardShell>
  );
}
