import { Database, Mail, Search } from "lucide-react";
import Image from "next/image";
import { DashboardShell } from "@/components/dashboard-shell";
import { ClientEditDialog } from "@/components/client-edit-dialog";
import { CreateCustomerDialog } from "@/components/create-customer-dialog";
import { getPrismaClient } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { readTenantDashboardModules } from "@/lib/tenant-settings";

export const dynamic = "force-dynamic";

type ClientPageProps = {
  searchParams: Promise<{ q?: string; error?: string; notice?: string }>;
};

const noticeText: Record<string, string> = {
  "customer-created": "De klant en klantlogin zijn aangemaakt.",
  "customer-updated": "De klantgegevens zijn bijgewerkt.",
  "customer-deleted": "De klant en bijbehorende gegevens zijn verwijderd.",
};

const errorText: Record<string, string> = {
  "invalid-customer": "Controleer de klantnaam, het e-mailadres en het wachtwoord van minimaal 12 tekens.",
  "invalid-logo": "Kies een geldige PNG-, JPEG- of WebP-afbeelding van maximaal 512 KB.",
  "create-customer": "Aanmaken is niet gelukt. Controleer of het e-mailadres al bestaat en de database bereikbaar is.",
  "update-customer": "Wijzigen is niet gelukt. Controleer of het e-mailadres al door een ander account wordt gebruikt.",
  "delete-customer": "Verwijderen is niet gelukt. Probeer het opnieuw.",
  "impersonation-failed": "Deze klant kan niet worden geopend. Controleer of het account actief is.",
};

export default async function AdminClients({ searchParams }: ClientPageProps) {
  await requireRole("admin");
  const params = await searchParams;
  const search = params.q?.trim() ?? "";
  let clients: Awaited<ReturnType<typeof loadClients>> = [];
  let databaseUnavailable = false;

  if (process.env.DATABASE_URL) {
    try {
      clients = await loadClients(search);
    } catch {
      databaseUnavailable = true;
    }
  } else {
    databaseUnavailable = true;
  }

  return (
    <DashboardShell role="admin" title="Klantenbeheer" subtitle="Beheer klantaccounts, toegang en Copernica-koppelingen.">
      {params.notice && noticeText[params.notice] ? <p className="form-success" role="status">{noticeText[params.notice]}</p> : null}
      {params.error && errorText[params.error] ? <p className="form-error" role="alert">{errorText[params.error]}</p> : null}
      {databaseUnavailable ? <p className="form-error" role="status">Klantbeheer is nog niet beschikbaar: configureer en migreer eerst de PostgreSQL-database (`DATABASE_URL`).</p> : null}

      <section className="toolbar">
        <form className="search-box" action="/dashboard/admin/clients" role="search">
          <Search size={16} />
          <input aria-label="Zoek klant" name="q" placeholder="Zoek klant" defaultValue={search} />
          <button className="button button-secondary" type="submit">Zoeken</button>
        </form>
        <CreateCustomerDialog />
      </section>

      <section className="client-grid" aria-label="Klanten">
        {clients.map((client) => {
          const modules = readTenantDashboardModules(client.settings);
          const showProfiles = modules.databaseStats && client.selections.length > 0;
          const profileTotal = client.selections.reduce((total, selection) => total + (selection.snapshots[0]?.profileCount ?? 0), 0);
          const profileDelta = showProfiles ? dailyProfileDelta(client.selections) : null;
          const lastSync = client.copernica?.lastSyncedAt;
          return (
            <article key={client.id} className="panel client-card client-widget">
              <div className="client-widget-header">
                <div className="client-logo">{client.logoDataUrl ? <Image src={client.logoDataUrl} alt={`${client.name} logo`} width={44} height={44} unoptimized /> : <span>{client.name.slice(0, 1).toUpperCase()}</span>}</div>
                <p className="eyebrow">{client.status === "active" ? "Klant" : "Inactieve klant"}</p>
                <span className={`selection-widget-dot${client.status === "active" ? "" : " is-inactive"}`} aria-label={client.status === "active" ? "Actief" : "Inactief"} />
              </div>
              <h2 className="client-widget-name">{client.name}</h2>
              <strong className="selection-widget-value">{(showProfiles ? profileTotal : client._count.campaigns).toLocaleString("nl-NL")}</strong>
              <p className="client-widget-metric">{showProfiles ? "profielen in gevolgde selecties" : "campagnes gesynchroniseerd"}</p>
              {showProfiles ? profileDelta === null
                ? <p className="selection-widget-delta selection-widget-delta-empty">Nog geen meting van gisteren</p>
                : <p className={`selection-widget-delta ${profileDelta < 0 ? "trend-down" : profileDelta > 0 ? "trend-up" : "trend-flat"}`}>{profileDelta > 0 ? "+" : ""}{profileDelta.toLocaleString("nl-NL")} sinds gisteren</p> : null}
              <div className="module-chips" aria-label="Actieve widgets"><span className={`module-chip${modules.databaseStats ? "" : " is-off"}`}><Database size={13} /> Database</span><span className={`module-chip${modules.campaignStats ? "" : " is-off"}`}><Mail size={13} /> E-mail</span></div>
              <div className="client-widget-footer">
                <small className="selection-widget-date">{client.copernica ? lastSync ? `Laatste sync ${lastSync.toLocaleDateString("nl-NL")}` : "Nog niet gesynchroniseerd" : "Geen Copernica-koppeling"}</small>
              <ClientEditDialog client={{
                id: client.id,
                name: client.name,
                status: client.status,
                logoDataUrl: client.logoDataUrl,
                customerEmail: client.users[0]?.email ?? null,
                campaignCount: client._count.campaigns,
                copernicaDatabaseId: client.copernica?.databaseId ?? null,
                lastSyncedAt: client.copernica?.lastSyncedAt?.toISOString() ?? null,
                selections: client.selections.map((selection) => ({ id: selection.id, name: selection.name, profileCount: selection.snapshots[0]?.profileCount ?? null })),
                modules,
              }} />
              </div>
            </article>
          );
        })}
        {!databaseUnavailable && clients.length === 0 ? <p>{search ? "Geen klanten gevonden." : "Er zijn nog geen klanten aangemaakt."}</p> : null}
      </section>
    </DashboardShell>
  );
}

function loadClients(search: string) {
  return getPrismaClient().tenant.findMany({
    where: search ? { name: { contains: search, mode: "insensitive" } } : undefined,
    include: {
      users: { where: { role: "CUSTOMER" }, take: 1 },
      _count: { select: { campaigns: true } },
      copernica: true,
      selections: {
        where: { enabled: true },
        include: { snapshots: { orderBy: { measuredAt: "desc" }, take: 3 } },
        orderBy: { name: "asc" },
      },
    },
    orderBy: { name: "asc" },
  });
}

const dayMs = 24 * 60 * 60 * 1000;

function dailyProfileDelta(selections: Array<{ snapshots: Array<{ measuredAt: Date; profileCount: number }> }>) {
  let delta = 0;
  for (const selection of selections) {
    const [latest, ...older] = selection.snapshots;
    if (!latest) continue;
    const previous = older.find((snapshot) => snapshot.measuredAt.getTime() <= latest.measuredAt.getTime() - dayMs);
    if (!previous) return null;
    delta += latest.profileCount - previous.profileCount;
  }
  return delta;
}
