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
          return (
            <article key={client.id} className="client-card client-widget">
              <div className="client-widget-header">
                <div className="client-logo client-widget-logo">{client.logoDataUrl ? <Image src={client.logoDataUrl} alt={`${client.name} logo`} width={56} height={56} unoptimized /> : <span>{client.name.slice(0, 1).toUpperCase()}</span>}</div>
                <div className="client-widget-title"><h3>{client.name}</h3>{client.status !== "active" ? <span className="status-badge status-wachtend">Inactief</span> : null}</div>
              </div>
              <div className="module-chips" aria-label="Actieve widgets"><span className={`module-chip${modules.databaseStats ? "" : " is-off"}`}><Database size={13} /> Database</span><span className={`module-chip${modules.campaignStats ? "" : " is-off"}`}><Mail size={13} /> E-mail</span></div>
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
        include: { snapshots: { orderBy: { measuredAt: "desc" }, take: 1 } },
        orderBy: { name: "asc" },
      },
    },
    orderBy: { name: "asc" },
  });
}