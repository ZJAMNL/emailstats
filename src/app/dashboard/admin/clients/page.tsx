import { Database, Eye, Pencil, Plus, Search, ShieldCheck, Trash2 } from "lucide-react";
import Image from "next/image";
import { DashboardShell } from "@/components/dashboard-shell";
import { createCustomerAction, deleteCustomerAction, impersonateCustomerAction, updateCustomerAction } from "@/app/actions";
import { getPrismaClient } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

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
      </section>

      <section className="panel form-panel">
        <div className="panel-heading"><div><p className="eyebrow">Nieuw account</p><h2>Klant toevoegen</h2></div><Plus size={19} /></div>
        <form action={createCustomerAction} className="customer-form">
          <label>Bedrijfsnaam<input name="name" autoComplete="organization" maxLength={120} required /></label>
          <label>Logo<input name="logo" type="file" accept="image/png,image/jpeg,image/webp" /><small>PNG, JPEG of WebP · maximaal 512 KB</small></label>
          <label>Inlog-e-mailadres<input name="email" type="email" autoComplete="email" maxLength={254} required /></label>
          <label>Tijdelijk wachtwoord<input name="password" type="password" autoComplete="new-password" minLength={12} required /><small>Minimaal 12 tekens. Deel dit wachtwoord veilig met de klant.</small></label>
          <button className="button button-primary" type="submit"><Plus size={16} /> Klant aanmaken</button>
        </form>
      </section>

      <section className="client-grid" aria-label="Klanten">
        {clients.map((client) => {
          const customer = client.users[0];
          return (
            <article key={client.id} className="client-card">
              <div className="client-card-header"><div className="client-brand"><div className="client-logo">{client.logoDataUrl ? <Image src={client.logoDataUrl} alt={`${client.name} logo`} width={44} height={44} unoptimized /> : <span>{client.name.slice(0, 1).toUpperCase()}</span>}</div><div><p className="eyebrow">{client.status === "active" ? "Actieve klant" : "Inactieve klant"}</p><h3>{client.name}</h3></div></div><span className={`status-badge ${client.status === "active" ? "status-good" : "status-wachtend"}`}>{client.status === "active" ? "Actief" : "Inactief"}</span></div>
              <dl><div><dt>Login</dt><dd>{customer?.email ?? "Geen klantlogin"}</dd></div><div><dt>Campagnes</dt><dd>{client._count.campaigns}</dd></div></dl>
              <div className="client-card-footer"><span><Database size={15} />{client.copernica ? "Copernica gekoppeld" : "Geen Copernica-koppeling"}</span><span><ShieldCheck size={15} />Tenant-afgeschermd</span></div>
              <details className="client-actions"><summary><Pencil size={15} /> Klant bewerken</summary>
                <form action={updateCustomerAction} className="customer-form">
                  <input type="hidden" name="tenantId" value={client.id} />
                  <label>Bedrijfsnaam<input name="name" defaultValue={client.name} maxLength={120} required /></label>
                  {customer ? <label>Inlog-e-mailadres<input name="email" type="email" defaultValue={customer.email} maxLength={254} required /></label> : <p>Voor deze klant bestaat nog geen klantlogin.</p>}
                  <label>Logo uploaden<input name="logo" type="file" accept="image/png,image/jpeg,image/webp" /><small>PNG, JPEG of WebP · maximaal 512 KB</small></label>
                  {client.logoDataUrl ? <label className="remove-logo"><input name="removeLogo" type="checkbox" /> Huidig logo verwijderen</label> : null}
                  <button className="button button-secondary" type="submit">Wijzigingen opslaan</button>
                </form>
                {customer && client.status === "active" ? <form action={impersonateCustomerAction} className="impersonate-form"><input type="hidden" name="tenantId" value={client.id} /><button className="button button-secondary" type="submit"><Eye size={15} /> Bekijken als klant</button></form> : null}
                <form action={deleteCustomerAction} className="delete-customer-form">
                  <input type="hidden" name="tenantId" value={client.id} />
                  <button className="button button-danger" type="submit"><Trash2 size={15} /> Klant verwijderen</button>
                </form>
              </details>
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
    },
    orderBy: { name: "asc" },
  });
}