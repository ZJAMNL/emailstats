import { Database, Plus, Search, ShieldCheck } from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { tenantOverview } from "@/lib/dashboard-data";
import { requireRole } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function AdminClients() {
  await requireRole("admin");

  return (
    <DashboardShell role="admin" title="Klantenbeheer" subtitle="Beheer tenantinstellingen, access control en gezondheidsstatus.">
      <section className="toolbar"><div className="search-box"><Search size={16} /><input aria-label="Zoek klant" placeholder="Zoek klant of eigenaar" /></div><button className="button button-primary"><Plus size={16} /> Klant toevoegen</button></section>
      <section className="client-grid">{tenantOverview.map((tenant) => <article key={tenant.id} className="client-card"><div className="client-card-header"><div><p className="eyebrow">Tenant</p><h3>{tenant.name}</h3></div><span className="status-badge status-good">{tenant.health}</span></div><dl><div><dt>Eigenaar</dt><dd>{tenant.owner}</dd></div><div><dt>Verzonden</dt><dd>{tenant.delivered.toLocaleString("nl-NL")}</dd></div><div><dt>CTR</dt><dd>{tenant.ctr}%</dd></div></dl><div className="client-card-footer"><span><Database size={15} /> Database gekoppeld</span><button type="button"><ShieldCheck size={15} /> Toegang controleren</button></div></article>)}</section>
    </DashboardShell>
  );
}
