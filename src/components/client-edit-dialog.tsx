"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Eye, KeyRound, Pencil, Trash2, X } from "lucide-react";
import { deleteCustomerAction, impersonateCustomerAction, sendLoginLinkAction, updateCustomerAction } from "@/app/actions";
import { OwnerSelect, type OwnerOption } from "@/components/create-customer-dialog";
import type { TenantDashboardModules } from "@/lib/tenant-settings";

export type ClientEditDialogClient = {
  id: string;
  name: string;
  status: string;
  logoDataUrl: string | null;
  customerEmail: string | null;
  campaignCount: number;
  copernicaDatabaseId: string | null;
  lastSyncedAt: string | null;
  selections: { id: string; name: string; profileCount: number | null }[];
  modules: TenantDashboardModules;
  ownerId: string | null;
};

export function ClientEditDialog({ client, owners }: { client: ClientEditDialogClient; owners: OwnerOption[] | null }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const titleId = `edit-client-${client.id}`;

  function openDialog() {
    dialogRef.current?.showModal();
    setIsOpen(true);
  }

  function closeDialog() {
    dialogRef.current?.close();
    setIsOpen(false);
  }

  return (
    <>
      <button aria-label={`${client.name} aanpassen`} className="icon-button client-widget-edit" onClick={openDialog} title="Klant aanpassen" type="button"><Pencil size={16} /></button>
      <dialog aria-labelledby={titleId} className="customer-dialog client-dialog" onClose={() => setIsOpen(false)} ref={dialogRef}>
        <div className="customer-dialog-header">
          <div className="client-brand">
            <div className="client-logo">{client.logoDataUrl ? <Image src={client.logoDataUrl} alt={`${client.name} logo`} width={44} height={44} unoptimized /> : <span>{client.name.slice(0, 1).toUpperCase()}</span>}</div>
            <div><p className="eyebrow">{client.status === "active" ? "Actieve klant" : "Inactieve klant"}</p><h2 id={titleId}>{client.name}</h2></div>
          </div>
          <button aria-label="Venster sluiten" className="icon-button" onClick={closeDialog} type="button"><X size={19} /></button>
        </div>

        {isOpen ? <>
          <dl className="client-dialog-facts">
            <div><dt>Login</dt><dd>{client.customerEmail ?? "Geen klantlogin"}</dd></div>
            <div><dt>Campagnes</dt><dd>{client.campaignCount.toLocaleString("nl-NL")}</dd></div>
            <div><dt>Copernica-database</dt><dd>{client.copernicaDatabaseId ?? "Niet gekoppeld"}</dd></div>
            <div><dt>Laatste sync</dt><dd>{client.lastSyncedAt ? new Date(client.lastSyncedAt).toLocaleString("nl-NL") : client.copernicaDatabaseId ? "Nog niet" : "—"}</dd></div>
          </dl>
          {client.selections.length ? <div className="admin-selection-overview" aria-label={`Gevolgde selecties van ${client.name}`}>{client.selections.map((selection) => <div key={selection.id}><span>{selection.name}</span><strong>{selection.profileCount?.toLocaleString("nl-NL") ?? "—"}</strong></div>)}</div> : null}

          <form action={updateCustomerAction} className="customer-form customer-dialog-form client-dialog-form">
            <input type="hidden" name="tenantId" value={client.id} />
            <label>Bedrijfsnaam<input name="name" defaultValue={client.name} maxLength={120} required /></label>
            {client.customerEmail ? <label>Inlog-e-mailadres<input name="email" type="email" defaultValue={client.customerEmail} maxLength={254} required /></label> : <p>Voor deze klant bestaat nog geen klantlogin.</p>}
            {owners ? <OwnerSelect defaultValue={client.ownerId} owners={owners} /> : null}
            <label>Logo uploaden<input name="logo" type="file" accept="image/png,image/jpeg,image/webp" /><small>PNG, JPEG of WebP · maximaal 512 KB</small></label>
            {client.logoDataUrl ? <label className="remove-logo"><input name="removeLogo" type="checkbox" /> Huidig logo verwijderen</label> : null}
            <fieldset className="module-toggle-group">
              <legend>Widgets op het klantdashboard</legend>
              <label><input name="databaseStats" type="checkbox" defaultChecked={client.modules.databaseStats} /> Database- en selectiestatistieken</label>
              <label><input name="campaignStats" type="checkbox" defaultChecked={client.modules.campaignStats} /> E-mailcampagnestatistieken</label>
              <label><input name="insights" type="checkbox" defaultChecked={client.modules.insights} /> Klantinzichten (RFM en voorspellingen)</label>
            </fieldset>
            <div className="customer-dialog-actions">
              <button className="button button-secondary" onClick={closeDialog} type="button">Annuleren</button>
              <button className="button button-primary" type="submit">Wijzigingen opslaan</button>
            </div>
          </form>

          <div className="client-dialog-footer">
            <Link className="button button-secondary" href={`/dashboard/admin/clients/${client.id}`}>Alle klantgegevens <ArrowRight size={15} /></Link>
            {client.customerEmail ? <form action={sendLoginLinkAction}><input type="hidden" name="tenantId" value={client.id} /><input type="hidden" name="returnTo" value="/dashboard/admin/clients" /><button className="button button-secondary" type="submit"><KeyRound size={15} /> Inloglink mailen</button></form> : null}
            {client.customerEmail && client.status === "active" ? <form action={impersonateCustomerAction}><input type="hidden" name="tenantId" value={client.id} /><button className="button button-secondary" type="submit"><Eye size={15} /> Bekijken als klant</button></form> : null}
            <form action={deleteCustomerAction} className="client-dialog-delete">
              <input type="hidden" name="tenantId" value={client.id} />
              <button className="button button-danger" type="submit"><Trash2 size={15} /> Klant verwijderen</button>
            </form>
          </div>
        </> : null}
      </dialog>
    </>
  );
}
