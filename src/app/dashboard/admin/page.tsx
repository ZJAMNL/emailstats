import { Activity, Database, Mail, Users } from "lucide-react";
import Link from "next/link";
import { DashboardShell } from "@/components/dashboard-shell";
import { getPrismaClient } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
  await requireRole("admin");
  let summary: Awaited<ReturnType<typeof loadSummary>> | null = null;
  let databaseUnavailable = false;

  if (process.env.DATABASE_URL) {
    try {
      summary = await loadSummary();
    } catch {
      databaseUnavailable = true;
    }
  } else {
    databaseUnavailable = true;
  }

  return (
    <DashboardShell role="admin" title="Platformoverzicht" subtitle="Beheer klantaccounts, Copernica-bronnen en gesynchroniseerde campagnes.">
      {databaseUnavailable ? <p className="form-error" role="status">Platformgegevens zijn nog niet beschikbaar: configureer en migreer PostgreSQL.</p> : null}
      <section className="metric-grid" aria-label="Platformstatistieken">
        <article className="metric-card"><div className="metric-header"><span>Klanten</span><Users size={16} /></div><strong>{summary?.tenantCount ?? 0}</strong></article>
        <article className="metric-card"><div className="metric-header"><span>Klantaccounts</span><Activity size={16} /></div><strong>{summary?.userCount ?? 0}</strong></article>
        <article className="metric-card"><div className="metric-header"><span>Copernica-koppelingen</span><Database size={16} /></div><strong>{summary?.connectionCount ?? 0}</strong></article>
        <article className="metric-card"><div className="metric-header"><span>Campagnes</span><Mail size={16} /></div><strong>{summary?.campaignCount ?? 0}</strong></article>
      </section>
      <section className="panel table-panel">
        <div className="panel-heading"><div><p className="eyebrow">Klanten</p><h2>Tenant-overzicht</h2></div><Link href="/dashboard/admin/clients" className="button button-secondary">Klanten beheren</Link></div>
        {summary && summary.tenants.length > 0 ? <div className="table-wrap"><table><thead><tr><th>Klant</th><th>Account</th><th>Copernica</th><th>Campagnes</th><th>Laatste sync</th></tr></thead><tbody>{summary.tenants.map((tenant) => <tr key={tenant.id}><td>{tenant.name}</td><td>{tenant.users[0]?.email ?? "Geen login"}</td><td>{tenant.copernica ? "Verbonden" : "Niet gekoppeld"}</td><td>{tenant._count.campaigns}</td><td>{tenant.copernica?.lastSyncedAt?.toLocaleString("nl-NL") ?? "-"}</td></tr>)}</tbody></table></div> : !databaseUnavailable ? <p className="empty-state">Nog geen klanten. Maak de eerste klant aan via Klanten beheren.</p> : null}
      </section>
    </DashboardShell>
  );
}

function loadSummary() {
  const prisma = getPrismaClient();
  return prisma.$transaction([
    prisma.tenant.count(),
    prisma.user.count({ where: { role: "CUSTOMER" } }),
    prisma.copernicaConnection.count(),
    prisma.campaign.count(),
    prisma.tenant.findMany({
      include: {
        users: { where: { role: "CUSTOMER" }, take: 1 },
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