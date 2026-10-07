import { Database, RefreshCw, ShieldCheck } from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { connectCopernicaAction, syncCopernicaNowAction, updateCopernicaSelectionsAction } from "@/app/actions";
import { SelectionTrendChart } from "@/components/selection-trend-chart";
import { getPrismaClient } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

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
  let connection: Awaited<ReturnType<typeof loadConnection>> = null;
  let selections: Awaited<ReturnType<typeof loadSelections>> = [];
  let databaseUnavailable = false;

  if (process.env.DATABASE_URL) {
    try {
      [connection, selections] = await Promise.all([
        loadConnection(session.tenantId),
        loadSelections(session.tenantId),
      ]);
    } catch {
      databaseUnavailable = true;
    }
  } else {
    databaseUnavailable = true;
  }

  const enabledSelections = selections.filter((selection) => selection.enabled);
  const pointMap = new Map<string, Record<string, string | number>>();

  for (const selection of enabledSelections) {
    for (const snapshot of selection.snapshots) {
      const date = snapshot.measuredAt.toISOString().slice(0, 10);
      const point = pointMap.get(date) ?? {};
      point[selection.id] = snapshot.profileCount;
      pointMap.set(date, point);
    }
  }

  const chartData = [...pointMap.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, values]) => ({ date, ...values }));
  const latestCount = (selection: (typeof enabledSelections)[number]) => selection.snapshots[0]?.profileCount ?? 0;
  const previousCount = (selection: (typeof enabledSelections)[number]) => selection.snapshots[1]?.profileCount ?? latestCount(selection);

  return (
    <DashboardShell role="customer" title="Copernica-data" subtitle="Koppel je database en kies welke selecties je wilt volgen.">
      {params.notice && noticeText[params.notice] ? <p className="form-success" role="status">{noticeText[params.notice]}</p> : null}
      {params.error && errorText[params.error] ? <p className="form-error" role="alert">{errorText[params.error]}</p> : null}
      {databaseUnavailable ? <p className="form-error" role="status">De databron is nog niet geactiveerd. De beheerder moet eerst PostgreSQL configureren en migreren.</p> : null}

      <section className="data-overview">
        <article className="panel info-panel"><div className="icon-box"><Database size={20} /></div><div><p className="eyebrow">Copernica-status</p><h2>{connection ? "Verbonden" : "Niet gekoppeld"}</h2><p>{connection ? `Database ${connection.databaseId}${connection.lastSyncedAt ? ` · sync ${connection.lastSyncedAt.toLocaleString("nl-NL")}` : ""}` : "Je API-token wordt versleuteld opgeslagen en blijft op de server."}</p></div></article>
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

      {connection ? <>
        <section className="panel table-panel">
          <div className="panel-heading"><div><p className="eyebrow">Databaseselecties</p><h2>Kies selecties om te volgen</h2></div><span className="tab">{enabledSelections.length} gekozen</span></div>
          {selections.length === 0 ? <p className="empty-state">Nog geen Copernica-views gevonden. Werk de verbinding bij om de selecties op te halen.</p> : <form action={updateCopernicaSelectionsAction}>
            <div className="selection-list">{selections.map((selection) => <label className="selection-option" key={selection.id}><span><input type="checkbox" name="selectionId" value={selection.id} defaultChecked={selection.enabled} /><strong>{selection.name}</strong></span><small>{selection.snapshots[0]?.profileCount.toLocaleString("nl-NL") ?? "Nog geen meting"}</small></label>)}</div>
            <button className="button button-secondary" type="submit">Selecties opslaan</button>
          </form>}
        </section>

        <section className="panel table-panel">
          <div className="panel-heading"><div><p className="eyebrow">Profielontwikkeling</p><h2>Aantal profielen per selectie</h2></div><form action={syncCopernicaNowAction}><button className="button button-secondary" type="submit"><RefreshCw size={15} /> Nu synchroniseren</button></form></div>
          <div className="selection-summary">{enabledSelections.map((selection, index) => {
            const delta = latestCount(selection) - previousCount(selection);
            return <article key={selection.id}><span className="selection-swatch" style={{ backgroundColor: colors[index % colors.length] }} /><div><p>{selection.name}</p><strong>{latestCount(selection).toLocaleString("nl-NL")}</strong><small className={delta < 0 ? "trend-down" : "trend-up"}>{delta > 0 ? "+" : ""}{delta.toLocaleString("nl-NL")} sinds vorige meting</small></div></article>;
          })}</div>
          <SelectionTrendChart data={chartData} selections={enabledSelections.map((selection, index) => ({ id: selection.id, name: selection.name, color: colors[index % colors.length] }))} />
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
    include: { snapshots: { orderBy: { measuredAt: "desc" }, take: 90 } },
    orderBy: { name: "asc" },
  });
}