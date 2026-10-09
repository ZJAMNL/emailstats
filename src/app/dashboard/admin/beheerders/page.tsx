import { KeyRound, Trash2, UserPlus } from "lucide-react";
import { createAdminAction, deleteAdminAction, sendAdminLoginLinkAction, updateAdminRoleAction } from "@/app/admin-user-actions";
import { DashboardShell } from "@/components/dashboard-shell";
import { requireSuperAdmin } from "@/lib/admin-access";
import { getPrismaClient } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type AdminsPageProps = {
  searchParams: Promise<{ error?: string; notice?: string }>;
};

const noticeText: Record<string, string> = {
  "admin-invited": "De beheerder is aangemaakt en heeft een e-mail ontvangen om een wachtwoord in te stellen.",
  "admin-updated": "De rol is bijgewerkt.",
  "admin-deleted": "De beheerder is verwijderd.",
  "login-link-sent": "De beheerder heeft een e-mail ontvangen met een link om een wachtwoord in te stellen.",
};

const errorText: Record<string, string> = {
  "invalid-admin": "Controleer de naam, het e-mailadres en de rol.",
  "create-admin": "Aanmaken is niet gelukt. Wordt dit e-mailadres al gebruikt?",
  "invite-failed": "De beheerder is aangemaakt, maar de uitnodiging kon niet worden verstuurd. Probeer ‘Inloglink mailen’.",
  "login-link-failed": "De inloglink kon niet worden verstuurd. Controleer de Resend-koppeling en probeer het opnieuw.",
  "own-account": "Je kunt je eigen rol niet wijzigen en je eigen account niet verwijderen.",
};

export default async function AdminUsersPage({ searchParams }: AdminsPageProps) {
  const session = await requireSuperAdmin();
  const params = await searchParams;
  let admins: Awaited<ReturnType<typeof loadAdmins>> = [];
  let unassigned = 0;
  let databaseUnavailable = false;

  if (process.env.DATABASE_URL) {
    try {
      [admins, unassigned] = await Promise.all([loadAdmins(), getPrismaClient().tenant.count({ where: { ownerId: null } })]);
    } catch {
      databaseUnavailable = true;
    }
  } else {
    databaseUnavailable = true;
  }

  return (
    <DashboardShell role="admin" title="Beheerders" subtitle="Beheerders zien alleen hun eigen klanten; superbeheerders zien alle omgevingen en beheren de beheerders.">
      {params.notice && noticeText[params.notice] ? <p className="form-success" role="status">{noticeText[params.notice]}</p> : null}
      {params.error && errorText[params.error] ? <p className="form-error" role="alert">{errorText[params.error]}</p> : null}
      {databaseUnavailable ? <p className="form-error" role="status">Beheerders zijn nog niet beschikbaar: configureer en migreer eerst de PostgreSQL-database (`DATABASE_URL`).</p> : null}

      <section className="panel table-panel">
        <div className="panel-heading"><div><p className="eyebrow">Toegang</p><h2>Beheerders en superbeheerders</h2></div>{unassigned ? <span className="tab">{unassigned} {unassigned === 1 ? "klant" : "klanten"} niet toegewezen</span> : null}</div>
        {admins.length ? (
          <div className="table-wrap">
            <table className="admin-table">
              <thead><tr><th>Naam</th><th>E-mailadres</th><th>Rol</th><th>Klanten</th><th><span className="sr-only">Acties</span></th></tr></thead>
              <tbody>
                {admins.map((admin) => {
                  const isSelf = admin.id === session.userId;
                  const others = admins.filter((other) => other.id !== admin.id);
                  return (
                    <tr key={admin.id}>
                      <td>{admin.name}{isSelf ? <small className="admin-self"> (jij)</small> : null}</td>
                      <td>{admin.email}</td>
                      <td>
                        {isSelf ? (admin.role === "SUPERADMIN" ? "Superbeheerder" : "Beheerder") : (
                          <form action={updateAdminRoleAction} className="admin-inline-form admin-form">
                            <input name="userId" type="hidden" value={admin.id} />
                            <select aria-label={`Rol van ${admin.name}`} defaultValue={admin.role === "SUPERADMIN" ? "superadmin" : "admin"} name="role">
                              <option value="admin">Beheerder</option>
                              <option value="superadmin">Superbeheerder</option>
                            </select>
                            <button className="button button-secondary" type="submit">Opslaan</button>
                          </form>
                        )}
                      </td>
                      <td>{admin._count.ownedTenants.toLocaleString("nl-NL")}</td>
                      <td>
                        <div className="admin-row-actions">
                          <form action={sendAdminLoginLinkAction}>
                            <input name="userId" type="hidden" value={admin.id} />
                            <button aria-label={`Inloglink mailen naar ${admin.name}`} className="icon-button" title="Inloglink mailen" type="submit"><KeyRound size={16} /></button>
                          </form>
                          {isSelf ? null : (
                            <details className="admin-delete">
                              <summary aria-label={`${admin.name} verwijderen`} className="icon-button" title="Verwijderen"><Trash2 size={16} /></summary>
                              <form action={deleteAdminAction} className="admin-delete-form admin-form">
                                <input name="userId" type="hidden" value={admin.id} />
                                <label>Klanten van {admin.name} overdragen aan
                                  <select defaultValue={session.userId} name="transferTo">
                                    <option value="">Niemand (alleen superbeheerders zien ze)</option>
                                    {others.map((other) => <option key={other.id} value={other.id}>{other.name}</option>)}
                                  </select>
                                </label>
                                <button className="button button-danger" type="submit"><Trash2 size={15} /> Definitief verwijderen</button>
                              </form>
                            </details>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : !databaseUnavailable ? <p className="empty-state">Er zijn nog geen beheerders.</p> : null}
      </section>

      <section className="panel">
        <div className="panel-heading"><div><p className="eyebrow">Nieuw account</p><h2>Beheerder toevoegen</h2></div><UserPlus size={19} /></div>
        <form action={createAdminAction} className="customer-form admin-create-form">
          <label>Naam<input autoComplete="name" maxLength={120} name="name" required /></label>
          <label>E-mailadres<input autoComplete="email" maxLength={254} name="email" required type="email" /></label>
          <label>Rol
            <select defaultValue="admin" name="role">
              <option value="admin">Beheerder: ziet alleen eigen klanten</option>
              <option value="superadmin">Superbeheerder: ziet alles en beheert beheerders</option>
            </select>
          </label>
          <p className="admin-create-hint">De beheerder krijgt een e-mail om zelf een wachtwoord in te stellen.</p>
          <button className="button button-primary" disabled={databaseUnavailable} type="submit"><UserPlus size={16} /> Beheerder uitnodigen</button>
        </form>
      </section>
    </DashboardShell>
  );
}

function loadAdmins() {
  return getPrismaClient().user.findMany({
    where: { role: { in: ["ADMIN", "SUPERADMIN"] } },
    select: { id: true, name: true, email: true, role: true, _count: { select: { ownedTenants: true } } },
    orderBy: [{ role: "asc" }, { name: "asc" }],
  });
}
