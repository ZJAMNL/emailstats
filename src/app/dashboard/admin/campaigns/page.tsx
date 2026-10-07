import { Gauge, Sparkles } from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { campaigns } from "@/lib/dashboard-data";
import { requireRole } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function AdminCampaigns() {
  await requireRole("admin");

  return (
    <DashboardShell role="admin" title="Campagnes over alle klanten" subtitle="Beheer campagnes, prioriteiten en de performancetrend per tenant.">
      <section className="campaign-summary"><div><Sparkles size={20} /><div><strong>24 actieve campagnelijnen</strong><span>6 nieuwe tests in de laatste week.</span></div></div></section>
      <section className="campaign-grid">{Object.entries(campaigns).flatMap(([tenantId, tenantCampaigns]) => tenantCampaigns.map((campaign) => <article key={`${tenantId}-${campaign.name}`} className="panel campaign-card"><div className="campaign-card-header"><div><p className="eyebrow">{tenantId}</p><h2>{campaign.name}</h2></div><span className={`status-badge status-${campaign.status}`}>{campaign.status}</span></div><div className="campaign-metrics"><div><Gauge size={17} /><strong>{campaign.delivered.toLocaleString("nl-NL")}</strong><span>Verzonden</span></div><div><Sparkles size={17} /><strong>{campaign.opens.toLocaleString("nl-NL")}</strong><span>Openingen</span></div></div><div className="campaign-footer"><span>Bijdrage: {campaign.revenue}</span><button type="button">Campagne openen</button></div></article>))}</section>
    </DashboardShell>
  );
}
