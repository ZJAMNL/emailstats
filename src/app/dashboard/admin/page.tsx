import { Activity, Database, Mail, Users } from "lucide-react";
import Link from "next/link";
import { DashboardShell } from "@/components/dashboard-shell";
import { getPrismaClient } from "@/lib/prisma";
import { requireAdmin, tenantWhere, type AdminSession } from "@/lib/admin-access";

export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
  const session = await requireAdmin();
  let summary: Awaited<ReturnType<typeof loadSummary>> | null = null;
  let databaseUnavailable = false;

  if (process.env.DATABASE_URL) {
    try {
      summary = await loadSummary(session);
    } catch {
      databaseUnavailable = true;
    }
  } else {
    databaseUnavailable = true;
  }

  return (
    <DashboardShell role="admin" title={session.role === "superadmin" ? "Platformoverzicht" : "Mijn klanten"} subtitle={session.role === "superadmin" ? "Alle klanten, beheerders, Copernica-bronnen en gesynchroniseerde campagnes." : "Jouw klantaccounts, Copernica-bronnen en gesynchroniseerde campagnes."}>
      {databaseUnavailable ? <p className="form-error" role="status">Platformgegevens zijn nog niet beschikbaar: configureer en migreer PostgreSQL.</p> : null}
      <section className="metric-grid" aria-label="Platformstatistieken">
        <article className="metric-card"><div className="metric-header"><span>Klanten</span><Users size={16} /></div><strong>{summary?.tenantCount ?? 0}</strong></article>
        <article className="metric-card"><div className="metric-header"><span>Klantaccounts</span><Activity size={16} /></div><strong>{summary?.userCount ?? 0}</strong></article>
        <article className="metric-card"><div className="metric-header"><span>Copernica-koppelingen</span><Database size={16} /></div><strong>{summary?.connectionCount ?? 0}</strong></article>
        <article className="metric-card"><div className="metric-header"><span>Campagnes</span><Mail size={16} /></div><strong>{summary?.campaignCount ?? 0}</strong></article>
      </section>
      <section className="panel table-panel">
        <div className="panel-heading"><div><p className="eyebrow">Klanten</p><h2>Tenant-overzicht</h2></div><Link href="/dashboard/admin/clients" className="button button-secondary">Klanten beheren</Link></div>
        {summary && summary.tenants.length > 0 ? <div className="table-wrap"><table><thead><tr><th>Klant</th>{session.role === "superadmin" ? <th>Beheerder</th> : null}<th>Account</th><th>Copernica</th><th>Campagnes</th><th>Laatste sync</th></tr></thead><tbody>{summary.tenants.map((tenant) => <tr key={tenant.id}><td>{tenant.name}</td>{session.role === "superadmin" ? <td>{tenant.owner?.name ?? "Niet toegewezen"}</td> : null}<td>{tenant.users[0]?.email ?? "Geen login"}</td><td>{tenant.copernica ? "Verbonden" : "Niet gekoppeld"}</td><td>{tenant._count.campaigns}</td><td>{tenant.copernica?.lastSyncedAt?.toLocaleString("nl-NL") ?? "-"}</td></tr>)}</tbody></table></div> : !databaseUnavailable ? <p className="empty-state">Nog geen klanten. Maak de eerste klant aan via Klanten beheren.</p> : null}
      </section>
    </DashboardShell>
  );
}

function loadSummary(session: AdminSession) {
  const prisma = getPrismaClient();
  const tenants = tenantWhere(session);
  return prisma.$transaction([
    prisma.tenant.count({ where: tenants }),
    prisma.user.count({ where: { role: "CUSTOMER", tenant: tenants } }),
    prisma.copernicaConnection.count({ where: { tenant: tenants } }),
    prisma.campaign.count({ where: { tenant: tenants } }),
    prisma.tenant.findMany({
      where: tenants,
      include: {
        owner: { select: { name: true } },
        users: { where: { role: "CUSTOMER" }, orderBy: { createdAt: "asc" }, take: 1 },
        copernica: true,
        _count: { select: { campaigns: true } },
      },
      orderBy: { name: "asc" },
    }),
  ]).then(([tenantCount, userCount, connectionCount, campaignCount, tenants]) => ({
    tenantCount,
    userCount,
    connectionCount,
    campaignCount,
    tenants,
  }));
}