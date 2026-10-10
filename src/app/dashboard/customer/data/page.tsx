import Link from "next/link";
import { Database, Mail, RefreshCw, ShieldCheck } from "lucide-react";
import { CustomerDataTabs } from "@/components/customer-data-tabs";
import { DashboardShell } from "@/components/dashboard-shell";
import { connectCopernicaAction, syncCopernicaNowAction } from "@/app/actions";
import { getPrismaClient } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { ALL_SCOPE, requireTenantManager } from "@/lib/webshops";
import { SelectionPicker } from "@/components/selection-picker";
import { readTenantDashboardModules } from "@/lib/tenant-settings";

export const dynamic = "force-dynamic";

type DataPageProps = {
  searchParams: Promise<{ error?: string; notice?: string }>;
};

const colors = ["#237a63", "#b05b3b", "#356ba5", "#94702c", "#875891", "#4c7878"];

const noticeText: Record<string, string> = {
  connected: "De Copernica-koppeling is getest en opgeslagen.",
  "selections-saved": "Je selectie-keuze is opgeslagen.",
  synced: "De campagnegegevens en geselecteerde profielaantallen zijn gesynchroniseerd.",
};

const errorText: Record<string, string> = {
  "invalid-connection": "Vul een database-ID en API-token in.",
  "connection-failed": "Koppelen is niet gelukt. Controleer de Copernica-token, database-ID en configuratie.",
  "sync-failed": "Synchroniseren is niet gelukt. Controleer de koppeling en probeer opnieuw.",
};

export default async function CustomerData({ searchParams }: DataPageProps) {
  const session = await requireRole("customer");
  const params = await searchParams;
  if (!(await requireTenantManager(session))) {
    return <DashboardShell role="customer" title="Beheer" subtitle="Instellingen voor je Copernica-koppeling en selecties."><p className="empty-state">Je account heeft toegang tot een deel van de webshops. De koppeling en selecties worden beheerd door een gebruiker met toegang tot alle webshops.</p></DashboardShell>;
  }
  let connection: Awaited<ReturnType<typeof loadConnection>> = null;
  let selections: Awaited<ReturnType<typeof loadSelections>> = [];
  let enabledSelections: Awaited<ReturnType<typeof loadEnabledSelections>> = [];
  let databaseUnavailable = false;
  let databaseStatsEnabled = true;
  let campaignStatsEnabled = false;
  let campaignCounts = { total: 0, shown: 0 };

  if (process.env.DATABASE_URL) {
    try {
      let settings: unknown;
      let byStatus: { included: boolean; _count: { _all: number } }[];
      [connection, selections, enabledSelections, settings, byStatus] = await Promise.all([
        loadConnection(session.tenantId),
        loadSelections(session.tenantId),
        loadEnabledSelections(session.tenantId),
        getPrismaClient().tenant.findUnique({ where: { id: session.tenantId }, select: { settings: true } }).then((tenant) => tenant?.settings),
        getPrismaClient().campaign.groupBy({ by: ["included"], where: { tenantId: session.tenantId }, _count: { _all: true } }),
      ]);
      databaseStatsEnabled = readTenantDashboardModules(settings).databaseStats;
      campaignStatsEnabled = readTenantDashboardModules(settings).campaignStats;
      campaignCounts = { total: byStatus.reduce((sum, row) => sum + row._count._all, 0), shown: byStatus.find((row) => row.included)?._count._all ?? 0 };
    } catch {
      databaseUnavailable = true;
    }
  } else {
    databaseUnavailable = true;
  }

  const enabledById = new Map(enabledSelections.map((selection) => [selection.id, selection]));

  return (
    <DashboardShell role="customer" title="Beheer" subtitle="Koppel je database, kies welke selecties je volgt en welke e-mailcampagnes meetellen.">
      <CustomerDataTabs current="copernica" showCampaigns={campaignStatsEnabled} />
      {params.notice && noticeText[params.notice] ? <p className="form-success" role="status">{noticeText[params.notice]}</p> : null}
      {params.error && errorText[params.error] ? <p className="form-error" role="alert">{errorText[params.error]}</p> : null}
      {databaseUnavailable ? <p className="form-error" role="status">De databron is nog niet geactiveerd. De beheerder moet eerst PostgreSQL configureren en migreren.</p> : null}

      <section className="data-overview">
        <article className="panel info-panel"><div className="icon-box"><Database size={20} /></div><div><p className="eyebrow">Copernica-status</p><h2>{connection ? "Verbonden" : "Niet gekoppeld"}</h2><p>{connection ? `Database ${connection.databaseId}${connection.lastSyncedAt ? ` · sync ${connection.lastSyncedAt.toLocaleString("nl-NL")}` : ""}` : "Je API-token wordt versleuteld opgeslagen en blijft op de server."}</p></div></article>
        {campaignStatsEnabled ? <article className="panel info-panel"><div className="icon-box"><Mail size={20} /></div><div><p className="eyebrow">E-mailcampagnes</p><h2>{campaignCounts.shown.toLocaleString("nl-NL")} van {campaignCounts.total.toLocaleString("nl-NL")} getoond</h2><p>{campaignCounts.total > campaignCounts.shown ? "Verborgen campagnes tellen niet mee in je dashboard. " : ""}<Link href="/dashboard/customer/data/campagnes">Campagnes kiezen</Link></p></div></article> : null}
        <article className="panel info-panel"><div className="icon-box"><ShieldCheck size={20} /></div><div><p className="eyebrow">Toegang</p><h2>Alleen jouw tenant</h2><p>Je kunt uitsluitend je eigen Copernica-verbinding, selecties en meetreeksen bekijken.</p></div></article>
      </section>

      <section className="panel form-panel">
        <div className="panel-heading"><div><p className="eyebrow">Verbinding</p><h2>{connection ? "Copernica-instellingen" : "Koppel Copernica"}</h2></div></div>
        <form action={connectCopernicaAction} className="customer-form">
          <label>Copernica-database-ID<input name="databaseId" inputMode="numeric" defaultValue={connection?.databaseId ?? ""} required /></label>
          <label>Copernica API-token<input name="apiToken" type="password" autoComplete="new-password" required={!connection} /><small>{connection ? "Laat leeg om je huidige token te behouden; vul alleen een nieuwe token in om die te vervangen." : "Maak een API-v4 token aan in Copernica. De token wordt nooit in je browser teruggetoond."}</small></label>
          <button className="button button-primary" type="submit">{connection ? "Verbinding bijwerken" : "Verbinding testen en opslaan"}</button>
        </form>
      </section>

      {connection && !databaseStatsEnabled ? <section className="panel table-panel"><p className="empty-state">De beheerder heeft database- en selectiestatistieken voor dit klantaccount uitgeschakeld.</p></section> : null}
      {connection && databaseStatsEnabled ? <>
        <section className="panel table-panel">
          <div className="panel-heading"><div><p className="eyebrow">Databaseselecties</p><h2>Kies selecties om te volgen</h2></div><span className="tab">{enabledSelections.length} gekozen</span></div>
          {selections.length === 0 ? <p className="empty-state">Nog geen Copernica-views gevonden. Werk de verbinding bij om de selecties op te halen.</p> : <SelectionPicker options={selections.map((selection) => ({
            id: selection.id,
            copernicaId: selection.copernicaId,
            name: selection.name,
            enabled: selection.enabled,
            profileCount: enabledById.get(selection.id)?.snapshots[0]?.profileCount ?? null,
          }))} />}
        </section>

        <section className="panel table-panel">
          <div className="panel-heading"><div><p className="eyebrow">Volgstatus</p><h2>Geselecteerde databronnen</h2></div><form action={syncCopernicaNowAction}><button className="button button-secondary" type="submit"><RefreshCw size={15} /> Nu synchroniseren</button></form></div>
          {enabledSelections.length ? <div className="selection-summary">{enabledSelections.map((selection, index) => <article key={selection.id}><span className="selection-swatch" style={{ backgroundColor: colors[index % colors.length] }} /><div><p>{selection.name}</p><strong>{selection.snapshots[0]?.profileCount.toLocaleString("nl-NL") ?? "Nog geen meting"}</strong><small>{selection.snapshots[0] ? `Gemeten ${selection.snapshots[0].measuredAt.toLocaleString("nl-NL")}` : "Wordt zichtbaar na de eerste sync"}</small></div></article>)}</div> : <p className="empty-state">Kies hierboven minimaal één selectie om deze op je dashboard te volgen.</p>}
        </section>
      </> : null}
    </DashboardShell>
  );
}

function loadConnection(tenantId: string) {
  return getPrismaClient().copernicaConnection.findUnique({ where: { tenantId } });
}

function loadSelections(tenantId: string) {
  return getPrismaClient().copernicaSelection.findMany({
    where: { tenantId },
    select: { id: true, copernicaId: true, name: true, enabled: true },
    orderBy: { name: "asc" },
  });
}

function loadEnabledSelections(tenantId: string) {
  return getPrismaClient().copernicaSelection.findMany({
    where: { tenantId, enabled: true },
    include: { snapshots: { where: { scope: ALL_SCOPE }, orderBy: { measuredAt: "desc" }, take: 1 } },
    orderBy: { name: "asc" },
  });
}