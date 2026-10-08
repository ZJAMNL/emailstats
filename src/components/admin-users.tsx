"use client";

import { useRef, useState, useTransition } from "react";
import { KeyRound, Pencil, Trash2, UserPlus, X } from "lucide-react";
import { createTenantUserAction, deleteTenantUserAction, sendUserLoginLinkAction, updateTenantUserAction } from "@/app/webshop-actions";

type TenantUser = { id: string; name: string; email: string; allWebshops: boolean; webshopIds: string[]; createdAt: string };
type Draft = { id?: string; name: string; email: string; allWebshops: boolean; webshopIds: string[]; sendInvite: boolean };

export function AdminUsers({ tenantId, users, webshops }: { tenantId: string; users: TenantUser[]; webshops: { id: string; name: string }[] }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const webshopName = new Map(webshops.map((webshop) => [webshop.id, webshop.name]));

  function run(label: string, task: () => Promise<{ ok: boolean; error?: string }>, success?: string, inDialog = false) {
    setBusy(label);
    setMessage(null);
    setDialogError(null);
    startTransition(async () => {
      const result = await task();
      setBusy(null);
      if (!result.ok) {
        if (inDialog) setDialogError(result.error ?? "Er ging iets mis.");
        else setMessage({ tone: "error", text: result.error ?? "Er ging iets mis." });
        return;
      }
      if (inDialog) dialogRef.current?.close();
      setConfirmDelete(null);
      if (success) setMessage({ tone: "success", text: success });
    });
  }

  function open(user: TenantUser | null) {
    setDraft(user ? { id: user.id, name: user.name, email: user.email, allWebshops: user.allWebshops, webshopIds: user.webshopIds, sendInvite: false } : { name: "", email: "", allWebshops: !webshops.length, webshopIds: [], sendInvite: true });
    setDialogError(null);
    dialogRef.current?.showModal();
  }

  function save() {
    if (!draft) return;
    if (draft.id) run("save", () => updateTenantUserAction(tenantId, draft.id!, draft), "De gebruiker is bijgewerkt.", true);
    else run("save", () => createTenantUserAction(tenantId, draft), draft.sendInvite ? `${draft.email} is toegevoegd en heeft een uitnodiging ontvangen.` : `${draft.email} is toegevoegd.`, true);
  }

  const access = (user: TenantUser) => user.allWebshops ? (webshops.length ? "Alle webshops" : "Volledige toegang") : user.webshopIds.map((id) => webshopName.get(id)).filter(Boolean).join(", ") || "Geen webshop";

  return (
    <div className="admin-users">
      {message ? <p className={message.tone === "success" ? "form-success" : "form-error"} role={message.tone === "success" ? "status" : "alert"}>{message.text}</p> : null}
      <div className="table-wrap">
        <table>
          <thead><tr><th>Gebruiker</th><th>Toegang</th><th>Toegevoegd</th><th /></tr></thead>
          <tbody>
            {users.map((user, index) => (
              <tr key={user.id}>
                <td><strong>{user.name}</strong><small className="admin-user-email">{user.email}{index === 0 ? " · hoofdgebruiker" : ""}</small></td>
                <td>{access(user)}</td>
                <td>{new Date(user.createdAt).toLocaleDateString("nl-NL")}</td>
                <td className="admin-user-actions">
                  <button aria-label={`${user.name} wijzigen`} className="icon-button" onClick={() => open(user)} type="button"><Pencil size={15} /></button>
                  <button aria-label={`Inloglink mailen naar ${user.email}`} className="icon-button" disabled={busy !== null} onClick={() => run(`link-${user.id}`, () => sendUserLoginLinkAction(tenantId, user.id), `Inloglink verstuurd naar ${user.email}.`)} type="button"><KeyRound size={15} /></button>
                  {users.length > 1 ? confirmDelete === user.id
                    ? <><button className="button button-danger" disabled={busy !== null} onClick={() => run(`delete-${user.id}`, () => deleteTenantUserAction(tenantId, user.id), `${user.email} is verwijderd.`)} type="button">Verwijderen</button><button className="button button-secondary" onClick={() => setConfirmDelete(null)} type="button">Annuleren</button></>
                    : <button aria-label={`${user.name} verwijderen`} className="icon-button" onClick={() => setConfirmDelete(user.id)} type="button"><Trash2 size={15} /></button> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button className="button button-primary" onClick={() => open(null)} type="button"><UserPlus size={15} /> Gebruiker toevoegen</button>

      <dialog aria-labelledby="user-dialog-title" className="customer-dialog widget-dialog" onClose={() => setDraft(null)} ref={dialogRef}>
        {draft ? <div className="widget-dialog-form">
          <div className="customer-dialog-header">
            <div><p className="eyebrow">Gebruiker</p><h2 id="user-dialog-title">{draft.id ? "Gebruiker wijzigen" : "Gebruiker toevoegen"}</h2></div>
            <button aria-label="Venster sluiten" className="icon-button" onClick={() => dialogRef.current?.close()} type="button"><X size={19} /></button>
          </div>
          <label>Naam<input maxLength={120} onChange={(event) => setDraft({ ...draft, name: event.target.value })} value={draft.name} /></label>
          <label>E-mailadres<input maxLength={254} onChange={(event) => setDraft({ ...draft, email: event.target.value })} type="email" value={draft.email} /></label>
          {webshops.length ? <fieldset className="module-toggle-group">
            <legend>Toegang</legend>
            <label className="widget-dialog-check"><input checked={draft.allWebshops} onChange={(event) => setDraft({ ...draft, allWebshops: event.target.checked })} type="checkbox" /><span>Alle webshops<small>Ziet ook het totaal van alle webshops en kan de koppeling en selecties beheren.</small></span></label>
            {!draft.allWebshops ? webshops.map((webshop) => <label className="widget-dialog-check" key={webshop.id}><input checked={draft.webshopIds.includes(webshop.id)} onChange={(event) => setDraft({ ...draft, webshopIds: event.target.checked ? [...draft.webshopIds, webshop.id] : draft.webshopIds.filter((id) => id !== webshop.id) })} type="checkbox" /><span>{webshop.name}</span></label>) : null}
          </fieldset> : <p className="rfm-hint">Deze klant heeft geen webshops: de gebruiker ziet alle gegevens.</p>}
          {!draft.id ? <label className="widget-dialog-check"><input checked={draft.sendInvite} onChange={(event) => setDraft({ ...draft, sendInvite: event.target.checked })} type="checkbox" /><span>Uitnodiging mailen<small>De gebruiker ontvangt een link om zelf een wachtwoord in te stellen (24 uur geldig).</small></span></label> : null}
          {dialogError ? <p className="form-error" role="alert">{dialogError}</p> : null}
          <div className="customer-dialog-actions">
            <button className="button button-secondary" onClick={() => dialogRef.current?.close()} type="button">Annuleren</button>
            <button className="button button-primary" disabled={busy !== null} onClick={save} type="button">{busy === "save" ? "Opslaan…" : "Opslaan"}</button>
          </div>
        </div> : null}
      </dialog>
    </div>
  );
}
