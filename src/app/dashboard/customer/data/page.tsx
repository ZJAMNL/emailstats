import { Database, ExternalLink, ShieldCheck } from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { requireRole } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function CustomerData() {
  const session = await requireRole("customer");

  return (
    <DashboardShell role="customer" title="Database en klantgegevens" subtitle="Beveiligde toegang tot de data die gekoppeld is aan je tenant.">
      <section className="data-overview">
        <article className="panel info-panel"><div className="icon-box"><Database size={20} /></div><div><p className="eyebrow">Tenant</p><h2>{session.tenantId}</h2><p>Gesynchroniseerd met de Copernica-datawarehouse.</p></div></article>
        <article className="panel info-panel"><div className="icon-box"><ShieldCheck size={20} /></div><div><p className="eyebrow">Beveiliging</p><h2>Least privilege</h2><p>Alle databasequeries zijn tenantgebonden en door de backend gecontroleerd.</p></div></article>
      </section>
      <section className="panel table-panel">
        <div className="panel-heading"><div><p className="eyebrow">Databronnen</p><h2>Gekoppelde datasets</h2></div><span className="tab">3 actieve connectors</span></div>
        <div className="table-wrap"><table><thead><tr><th>Naam</th><th>Type</th><th>Laatste sync</th><th>Status</th><th>Actie</th></tr></thead><tbody><tr><td>Copernica contacten</td><td>CRM</td><td>2 minuten geleden</td><td><span className="status-badge status-good">Online</span></td><td><button type="button" className="table-link">Bekijken <ExternalLink size={14} /></button></td></tr><tr><td>Campagne prestaties</td><td>Marketing</td><td>6 minuten geleden</td><td><span className="status-badge status-good">Online</span></td><td><button type="button" className="table-link">Bekijken <ExternalLink size={14} /></button></td></tr><tr><td>Transacties</td><td>Finance</td><td>Vandaag 08:40</td><td><span className="status-badge status-good">Online</span></td><td><button type="button" className="table-link">Bekijken <ExternalLink size={14} /></button></td></tr></tbody></table></div>
      </section>
    </DashboardShell>
  );
}
