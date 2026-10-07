import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Database, Eye, Mail, ShieldCheck } from "lucide-react";
import { notFound } from "next/navigation";
import { impersonateCustomerAction } from "@/app/actions";
import { DashboardShell } from "@/components/dashboard-shell";
import { MetricsGrid } from "@/components/metrics-grid";
import { SelectionTrendChart } from "@/components/selection-trend-chart";
import { getPrismaClient } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const dynamic = "force-dynamic";

type ClientDetailProps = {
  params: Promise<{ tenantId: string }>;
};

const selectionColors = ["#237a63", "#b05b3b", "#356ba5", "#94702c", "#875891", "#4c7878"];
const integerFormat = new Intl.NumberFormat("nl-NL");

export default async function AdminClientDetail({ params }: ClientDetailProps) {
  await requireRole("admin");
  const { tenantId } = await params;
  if (!process.env.DATABASE_URL) notFound();

  const tenant = await getPrismaClient().tenant.findUnique({
    where: { id: tenantId },
    select: {
      id: true,
      name: true,
      slug: true,
      logoDataUrl: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      users: {
        where: { role: "CUSTOMER" },
        select: { id: true, email: true, name: true, role: true, createdAt: true, updatedAt: true },
        orderBy: { createdAt: "asc" },
      },
      copernica: {
        select: { databaseId: true, connectedAt: true, lastSyncedAt: true },
      },
      selections: {
        include: { snapshots: { orderBy: { measuredAt: "desc" }, take: 90 } },
        orderBy: { name: "asc" },
      },
      campaigns: {
        orderBy: [{ sentAt: "desc" }, { name: "asc" }],
        take: 1000,
      },
      _count: { select: { campaigns: true } },
    },
  });

  if (!tenant) notFound();

  const enabledSelections = tenant.selections.filter((selection) => selection.enabled);
  const totalSent = tenant.campaigns.reduce((total, campaign) => total + campaign.sentCount, 0);
  const totalOpens = tenant.campaigns.reduce((total, campaign) => total + campaign.openCount, 0);
  const totalClicks = tenant.campaigns.reduce((total, campaign) => total + campaign.clickCount, 0);
  const totalProfileMemberships = enabledSelections.reduce((total, selection) => total + (selection.snapshots[0]?.profileCount ?? 0), 0);
  const selectionTrend = buildSelectionTotalSeries(enabledSelections);

  const metrics = [
    { label: "Campagnes in overzicht", value: integerFormat.format(tenant._count.campaigns), delta: "totaal", trend: "flat" as const },
    { label: "Verzonden", value: integerFormat.format(totalSent), delta: "gesynchroniseerd", trend: "flat" as const },
    { label: "Open rate", value: `${totalSent ? ((totalOpens / totalSent) * 100).toFixed(1) : "0.0"}%`, delta: "gemiddeld", trend: "flat" as const },
    { label: "CTR", value: `${totalSent ? ((totalClicks / totalSent) * 100).toFixed(1) : "0.0"}%`, delta: "gemiddeld", trend: "flat" as const },
  ];

  return (
    <DashboardShell role="admin" title={tenant.name} subtitle="Klantdetails, databasekoppeling en prestaties.">
      <div className="detail-toolbar">
        <Link className="button button-secondary" href="/dashboard/admin/clients"><ArrowLeft size={16} /> Alle klanten</Link>
        {tenant.users[0] && tenant.status === "active" ? <form action={impersonateCustomerAction}><input name="tenantId" type="hidden" value={tenant.id} /><button className="button button-primary" type="submit"><Eye size={16} /> Bekijken als klant</button></form> : null}
      </div>

      <section className="client-detail-identity panel">
        <div className="client-logo client-detail-logo">{tenant.logoDataUrl ? <Image src={tenant.logoDataUrl} alt={`${tenant.name} logo`} width={64} height={64} unoptimized /> : <span>{tenant.name.slice(0, 1).toUpperCase()}</span>}</div>
        <div className="client-detail-name"><p className="eyebrow">{tenant.status === "active" ? "Actieve klant" : "Inactieve klant"}</p><h2>{tenant.name}</h2><p>{tenant.slug} · aangemaakt {tenant.createdAt.toLocaleDateString("nl-NL")}</p></div>
        <span className={`status-badge ${tenant.status === "active" ? "status-good" : "status-wachtend"}`}>{tenant.status === "active" ? "Actief" : "Inactief"}</span>
      </section>

      <MetricsGrid metrics={metrics} />

      <section className="panel-grid two-columns client-detail-grid">
        <article className="panel">
          <div className="panel-heading"><div><p className="eyebrow">Account</p><h2>Klantlogins</h2></div><ShieldCheck size={19} /></div>
          {tenant.users.length ? <div className="detail-list">{tenant.users.map((user) => <div key={user.id}><span>{user.name}</span><strong>{user.email}</strong><small>Aangemaakt {user.createdAt.toLocaleDateString("nl-NL")}</small></div>)}</div> : <p className="empty-state">Geen klantlogin ingesteld.</p>}
        </article>
        <article className="panel">
          <div className="panel-heading"><div><p className="eyebrow">Copernica</p><h2>Databaseverbinding</h2></div><Database size={19} /></div>
          {tenant.copernica ? <div className="detail-list"><div><span>Status</span><strong>Verbonden</strong></div><div><span>Database-ID</span><strong>{tenant.copernica.databaseId}</strong></div><div><span>Verbonden sinds</span><strong>{tenant.copernica.connectedAt.toLocaleString("nl-NL")}</strong></div><div><span>Laatste synchronisatie</span><strong>{tenant.copernica.lastSyncedAt?.toLocaleString("nl-NL") ?? "Nog niet gesynchroniseerd"}</strong></div></div> : <p className="empty-state">Deze klant heeft nog geen Copernica-koppeling.</p>}
        </article>
      </section>

      <section className="panel table-panel">
        <div className="panel-heading"><div><p className="eyebrow">Profieldata</p><h2>Gevolgde selecties</h2></div><span className="tab">{enabledSelections.length} actief</span></div>
        {enabledSelections.length ? <>
          <p className="selection-total-caption">Som van de laatste meting per selectie: <strong>{integerFormat.format(totalProfileMemberships)}</strong>. Overlap tussen selecties telt meerdere keren mee.</p>
          <SelectionTrendChart data={selectionTrend} selections={[{ id: "total", name: "Totaal", color: "#237a63" }]} />
          <div className="selection-widget-grid">{enabledSelections.map((selection, index) => {
            const current = selection.snapshots[0]?.profileCount ?? 0;
            const previous = selection.snapshots[1]?.profileCount ?? current;
            const delta = current - previous;
            return <article className="panel selection-widget" key={selection.id}>
              <div className="panel-heading"><div><p className="eyebrow">Selectie {index + 1}</p><h2>{selection.name}</h2></div><span className="selection-widget-dot" style={{ backgroundColor: selectionColors[index % selectionColors.length] }} /></div>
              <strong className="selection-widget-value">{integerFormat.format(current)}</strong>
              <p className={delta < 0 ? "trend-down selection-widget-delta" : "trend-up selection-widget-delta"}>{delta > 0 ? "+" : ""}{integerFormat.format(delta)} sinds vorige meting</p>
              <small className="selection-widget-date">{selection.snapshots[0] ? `Laatst gemeten ${selection.snapshots[0].measuredAt.toLocaleString("nl-NL")}` : "Nog geen meetpunten"}</small>
              <div className="detail-history">{selection.snapshots.slice(0, 10).map((snapshot) => <div key={snapshot.id}><span>{snapshot.measuredAt.toLocaleDateString("nl-NL")}</span><strong>{integerFormat.format(snapshot.profileCount)}</strong></div>)}</div>
            </article>;
          })}</div>
        </> : <p className="empty-state">Er zijn nog geen Copernica-selecties gekozen om te volgen.</p>}
      </section>

      <section className="panel table-panel">
        <div className="panel-heading"><div><p className="eyebrow">Campagnes</p><h2>Gesynchroniseerde mailings</h2></div><span className="tab">{integerFormat.format(tenant._count.campaigns)} totaal</span></div>
        {tenant.campaigns.length ? <><div className="table-wrap"><table><thead><tr><th>Campagne</th><th>Verzonden</th><th>Ontvangers</th><th>Openingen</th><th>Klikken</th><th>CTR</th></tr></thead><tbody>{tenant.campaigns.map((campaign) => <tr key={campaign.id}><td><span className="campaign-detail-name"><Mail size={15} />{campaign.name}</span></td><td>{campaign.sentAt?.toLocaleDateString("nl-NL") ?? "—"}</td><td>{integerFormat.format(campaign.sentCount)}</td><td>{integerFormat.format(campaign.openCount)}</td><td>{integerFormat.format(campaign.clickCount)}</td><td>{campaign.sentCount ? `${((campaign.clickCount / campaign.sentCount) * 100).toFixed(1)}%` : "—"}</td></tr>)}</tbody></table></div>{tenant._count.campaigns > tenant.campaigns.length ? <p className="tenant-boundary">Toont de {integerFormat.format(tenant.campaigns.length)} recentste campagnes van {integerFormat.format(tenant._count.campaigns)}.</p> : null}</> : <p className="empty-state">Nog geen campagnes gesynchroniseerd.</p>}
      </section>
    </DashboardShell>
  );
}

function buildSelectionTotalSeries(selections: Array<{ snapshots: Array<{ measuredAt: Date; profileCount: number }> }>) {
  const totals = new Map<string, number>();
  for (const selection of selections) {
    for (const snapshot of selection.snapshots) {
      const date = snapshot.measuredAt.toISOString().slice(0, 10);
      totals.set(date, (totals.get(date) ?? 0) + snapshot.profileCount);
    }
  }

  return [...totals.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([date, total]) => ({ date, total }));
}
