import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Database, Eye, Gem, KeyRound, Mail, ShieldCheck } from "lucide-react";
import { notFound } from "next/navigation";
import { impersonateCustomerAction, sendLoginLinkAction, updateTenantDashboardModulesAction } from "@/app/actions";
import { AdminUsers } from "@/components/admin-users";
import { AdminWebshops } from "@/components/admin-webshops";
import { DashboardShell } from "@/components/dashboard-shell";
import { MetricsGrid } from "@/components/metrics-grid";
import { SelectionHistoryImport } from "@/components/selection-history-import";
import { SelectionTrendChart } from "@/components/selection-trend-chart";
import { getPrismaClient } from "@/lib/prisma";
import { requireTenantAdmin } from "@/lib/admin-access";
import { getTenantDashboardModules } from "@/lib/tenant-settings";
import { filterCampaigns, getAdminScope, loadWebshops } from "@/lib/webshops";

export const dynamic = "force-dynamic";

type ClientDetailProps = {
  params: Promise<{ tenantId: string }>;
  searchParams: Promise<{ notice?: string; error?: string; webshop?: string }>;
};

const selectionColors = ["#237a63", "#b05b3b", "#356ba5", "#94702c", "#875891", "#4c7878"];
const integerFormat = new Intl.NumberFormat("nl-NL");

export default async function AdminClientDetail({ params, searchParams }: ClientDetailProps) {
  const { tenantId } = await params;
  const query = await searchParams;
  if (!process.env.DATABASE_URL) notFound();
  await requireTenantAdmin(tenantId);

  const [{ allowed: scopes, current: scope }, webshops] = await Promise.all([getAdminScope(tenantId, query.webshop), loadWebshops(tenantId)]);
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
        select: { id: true, email: true, name: true, role: true, allWebshops: true, webshops: { select: { webshopId: true } }, createdAt: true, updatedAt: true },
        orderBy: { createdAt: "asc" },
      },
      copernica: {
        select: { databaseId: true, connectedAt: true, lastSyncedAt: true },
      },
      selections: {
        where: { enabled: true },
        include: { snapshots: { where: { scope: scope.id }, orderBy: { measuredAt: "desc" }, take: 90 } },
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

  const dashboardModules = await getTenantDashboardModules(tenant.id);
  const campaigns = filterCampaigns(tenant.campaigns, scope.webshop);
  const enabledSelections = tenant.selections.filter((selection) => selection.enabled);
  const totalSent = campaigns.reduce((total, campaign) => total + campaign.sentCount, 0);
  const totalOpens = campaigns.reduce((total, campaign) => total + campaign.openCount, 0);
  const totalClicks = campaigns.reduce((total, campaign) => total + campaign.clickCount, 0);
  const totalProfileMemberships = enabledSelections.reduce((total, selection) => total + (selection.snapshots[0]?.profileCount ?? 0), 0);
  const selectionTrend = buildSelectionTotalSeries(enabledSelections);

  const metrics = [
    { label: "Campagnes in overzicht", value: integerFormat.format(scope.webshop ? campaigns.length : tenant._count.campaigns), delta: scope.webshop ? scope.name : "totaal", trend: "flat" as const },
    { label: "Verzonden", value: integerFormat.format(totalSent), delta: "gesynchroniseerd", trend: "flat" as const },
    { label: "Open rate", value: `${totalSent ? ((totalOpens / totalSent) * 100).toFixed(1) : "0.0"}%`, delta: "gemiddeld", trend: "flat" as const },
    { label: "CTR", value: `${totalSent ? ((totalClicks / totalSent) * 100).toFixed(1) : "0.0"}%`, delta: "gemiddeld", trend: "flat" as const },
  ];

  return (
    <DashboardShell role="admin" title={tenant.name} subtitle="Klantdetails, databasekoppeling en prestaties.">
      {query.notice === "settings-saved" ? <p className="form-success" role="status">De statistiekweergaven voor deze klant zijn bijgewerkt.</p> : null}
      {query.notice === "login-link-sent" ? <p className="form-success" role="status">De klant heeft een e-mail ontvangen met een link om een wachtwoord in te stellen.</p> : null}
      {query.error === "login-link-failed" ? <p className="form-error" role="alert">De inloglink kon niet worden verstuurd. Controleer de Resend-koppeling en probeer het opnieuw.</p> : null}
      {query.error === "settings-save-failed" ? <p className="form-error" role="alert">De statistiekinstellingen zijn niet opgeslagen. Probeer het opnieuw.</p> : null}
      <div className="detail-toolbar">
        <Link className="button button-secondary" href="/dashboard/admin/clients"><ArrowLeft size={16} /> Alle klanten</Link>
        <Link className="button button-secondary" href={`/dashboard/admin/clients/${tenant.id}/rfm`}><Gem size={16} /> Klantwaarde (RFM)</Link>
        {tenant.users[0] ? <form action={sendLoginLinkAction}><input name="tenantId" type="hidden" value={tenant.id} /><input name="returnTo" type="hidden" value={`/dashboard/admin/clients/${tenant.id}`} /><button className="button button-secondary" type="submit"><KeyRound size={16} /> Inloglink mailen</button></form> : null}
        {tenant.users[0] && tenant.status === "active" ? <form action={impersonateCustomerAction}><input name="tenantId" type="hidden" value={tenant.id} /><button className="button button-primary" type="submit"><Eye size={16} /> Bekijken als klant</button></form> : null}
      </div>

      {webshops.length ? <nav className="segmented-control admin-scope" aria-label="Gegevens tonen voor">
        {scopes.map((option) => <Link aria-current={option.id === scope.id ? "page" : undefined} href={option.id === "all" ? `/dashboard/admin/clients/${tenant.id}` : `/dashboard/admin/clients/${tenant.id}?webshop=${option.id}`} key={option.id} scroll={false}>{option.name}</Link>)}
      </nav> : null}

      <section className="client-detail-identity panel">
        <div className="client-logo client-detail-logo">{tenant.logoDataUrl ? <Image src={tenant.logoDataUrl} alt={`${tenant.name} logo`} width={64} height={64} unoptimized /> : <span>{tenant.name.slice(0, 1).toUpperCase()}</span>}</div>
        <div className="client-detail-name"><p className="eyebrow">{tenant.status === "active" ? "Actieve klant" : "Inactieve klant"}</p><h2>{tenant.name}</h2><p>{tenant.slug} · aangemaakt {tenant.createdAt.toLocaleDateString("nl-NL")}</p></div>
        <span className={`status-badge ${tenant.status === "active" ? "status-good" : "status-wachtend"}`}>{tenant.status === "active" ? "Actief" : "Inactief"}</span>
      </section>

      <MetricsGrid metrics={metrics} />

      <section className="panel-grid two-columns client-detail-grid">
        <article className="panel">
          <div className="panel-heading"><div><p className="eyebrow">Account</p><h2>Klantlogins</h2></div><ShieldCheck size={19} /></div>
          {tenant.users.length ? <div className="detail-list"><div><span>Gebruikers</span><strong>{tenant.users.length}</strong></div><div><span>Hoofdgebruiker</span><strong>{tenant.users[0].email}</strong></div><div><span>Webshops</span><strong>{webshops.length ? webshops.map((webshop) => webshop.name).join(", ") : "Geen (hele database)"}</strong></div><a className="explain-link" href="#gebruikers">Gebruikers beheren →</a></div> : <p className="empty-state">Geen klantlogin ingesteld.</p>}
        </article>
        <article className="panel">
          <div className="panel-heading"><div><p className="eyebrow">Copernica</p><h2>Databaseverbinding</h2></div><Database size={19} /></div>
          {tenant.copernica ? <div className="detail-list"><div><span>Status</span><strong>Verbonden</strong></div><div><span>Database-ID</span><strong>{tenant.copernica.databaseId}</strong></div><div><span>Verbonden sinds</span><strong>{tenant.copernica.connectedAt.toLocaleString("nl-NL")}</strong></div><div><span>Laatste synchronisatie</span><strong>{tenant.copernica.lastSyncedAt?.toLocaleString("nl-NL") ?? "Nog niet gesynchroniseerd"}</strong></div></div> : <p className="empty-state">Deze klant heeft nog geen Copernica-koppeling.</p>}
        </article>
      </section>

      <section className="panel table-panel">
        <div className="panel-heading"><div><p className="eyebrow">Dashboardtoegang</p><h2>Statistieken voor deze klant</h2></div></div>
        <form action={updateTenantDashboardModulesAction} className="module-settings-form">
          <input name="tenantId" type="hidden" value={tenant.id} />
          <label className="module-setting-option"><span><strong>Database- en selectiestatistieken</strong><small>Toon Copernica-profielaantallen en selectie-widgets op het klantdashboard.</small></span><input defaultChecked={dashboardModules.databaseStats} name="databaseStats" type="checkbox" /></label>
          <label className="module-setting-option"><span><strong>E-mailcampagnestatistieken</strong><small>Toon campagne-KPI’s en campagneoverzichten voor deze klant.</small></span><input defaultChecked={dashboardModules.campaignStats} name="campaignStats" type="checkbox" /></label>
          <button className="button button-primary" type="submit">Instellingen opslaan</button>
        </form>
      </section>

      <section className="panel table-panel" id="webshops">
        <div className="panel-heading"><div><p className="eyebrow">Omgevingen</p><h2>Webshops in deze database</h2></div><span className="tab">{webshops.length}</span></div>
        <p className="tenant-boundary">Splits de database op een profielveld in afzonderlijke webshops. De klant kiest na het inloggen welke webshop hij bekijkt; per gebruiker bepaal je hieronder welke webshops hij mag zien.</p>
        <AdminWebshops connected={Boolean(tenant.copernica)} tenantId={tenant.id} webshops={webshops} />
      </section>

      <section className="panel table-panel" id="gebruikers">
        <div className="panel-heading"><div><p className="eyebrow">Toegang</p><h2>Gebruikers van deze klant</h2></div><span className="tab">{tenant.users.length}</span></div>
        <AdminUsers tenantId={tenant.id} users={tenant.users.map((user) => ({ id: user.id, name: user.name, email: user.email, allWebshops: user.allWebshops, webshopIds: user.webshops.map((link) => link.webshopId), createdAt: user.createdAt.toISOString() }))} webshops={webshops.map((webshop) => ({ id: webshop.id, name: webshop.name }))} />
      </section>

      <section className="panel table-panel">
        <div className="panel-heading"><div><p className="eyebrow">Historische data</p><h2>Selectiehistorie importeren</h2></div></div>
        <p className="tenant-boundary">Voeg eerdere profielaantallen toe vanuit een CSV-bestand. Je ziet eerst een voorbeeld; er wordt pas iets opgeslagen als je bevestigt.</p>
        <SelectionHistoryImport tenantId={tenant.id} webshops={webshops.map((webshop) => ({ id: webshop.id, name: webshop.name }))} />
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
        {campaigns.length ? <><div className="table-wrap"><table><thead><tr><th>Campagne</th><th>Verzonden</th><th>Ontvangers</th><th>Openingen</th><th>Klikken</th><th>CTR</th></tr></thead><tbody>{campaigns.map((campaign) => <tr key={campaign.id}><td><span className="campaign-detail-name"><Mail size={15} />{campaign.name}</span></td><td>{campaign.sentAt?.toLocaleDateString("nl-NL") ?? "—"}</td><td>{integerFormat.format(campaign.sentCount)}</td><td>{integerFormat.format(campaign.openCount)}</td><td>{integerFormat.format(campaign.clickCount)}</td><td>{campaign.sentCount ? `${((campaign.clickCount / campaign.sentCount) * 100).toFixed(1)}%` : "—"}</td></tr>)}</tbody></table></div>{!scope.webshop && tenant._count.campaigns > campaigns.length ? <p className="tenant-boundary">Toont de {integerFormat.format(campaigns.length)} recentste campagnes van {integerFormat.format(tenant._count.campaigns)}.</p> : null}</> : <p className="empty-state">Nog geen campagnes gesynchroniseerd.</p>}
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
