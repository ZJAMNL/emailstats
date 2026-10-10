"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Eye, ImageUp, KeyRound, Pencil, Trash2, X } from "lucide-react";
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
  modules: TenantDashboardModules;
  ownerId: string | null;
};

const visibilityOptions: { name: keyof TenantDashboardModules; title: string; description: string }[] = [
  { name: "databaseStats", title: "Database en selecties", description: "Profielaantallen en de gevolgde Copernica-selecties." },
  { name: "campaignStats", title: "E-mailcampagnes", description: "Verzonden mailings met open rate en CTR." },
  { name: "insights", title: "Klantinzichten", description: "RFM-segmenten, koopintentie, categorieën en doelgroepen." },
];

/**
 * Edit a customer: what can be changed comes first in numbered sections, quick links sit above,
 * removing the customer is a separate, confirmed step, and Save stays in view at the bottom.
 */
export function ClientEditDialog({ client, owners }: { client: ClientEditDialogClient; owners: OwnerOption[] | null }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoName, setLogoName] = useState<string | null>(null);
  const [removeLogo, setRemoveLogo] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const titleId = `edit-client-${client.id}`;
  const formId = `edit-client-form-${client.id}`;
  let section = 0;

  useEffect(() => () => { if (logoPreview) URL.revokeObjectURL(logoPreview); }, [logoPreview]);

  function openDialog() {
    dialogRef.current?.showModal();
    setIsOpen(true);
  }

  function closeDialog() {
    dialogRef.current?.close();
  }

  function reset() {
    setIsOpen(false);
    setLogoPreview(null);
    setLogoName(null);
    setRemoveLogo(false);
    setConfirmDelete(false);
  }

  const shownLogo = removeLogo ? null : logoPreview ?? client.logoDataUrl;
  const facts = [
    client.customerEmail ? `Login ${client.customerEmail}` : "Nog geen klantlogin",
    client.copernicaDatabaseId ? `Copernica-database ${client.copernicaDatabaseId}` : "Copernica niet gekoppeld",
    client.lastSyncedAt ? `gesynchroniseerd ${new Date(client.lastSyncedAt).toLocaleDateString("nl-NL", { day: "numeric", month: "short" })}` : null,
    `${client.campaignCount.toLocaleString("nl-NL")} campagnes`,
  ].filter(Boolean);

  return (
    <>
      <button aria-label={`${client.name} aanpassen`} className="icon-button client-widget-edit" onClick={openDialog} title="Klant aanpassen" type="button"><Pencil size={16} /></button>
      <dialog aria-labelledby={titleId} className="customer-dialog client-edit" onClose={reset} ref={dialogRef}>
        <header className="client-edit-header">
          <div className="client-brand">
            <div className="client-logo">{client.logoDataUrl ? <Image src={client.logoDataUrl} alt="" width={44} height={44} unoptimized /> : <span>{client.name.slice(0, 1).toUpperCase()}</span>}</div>
            <div>
              <h2 id={titleId}>{client.name}</h2>
              <p className="client-edit-facts"><span className={`client-edit-status${client.status === "active" ? "" : " is-inactive"}`}>{client.status === "active" ? "Actief" : "Inactief"}</span>{facts.join(" · ")}</p>
            </div>
          </div>
          <button aria-label="Venster sluiten" className="icon-button" onClick={closeDialog} type="button"><X size={19} /></button>
        </header>

        {isOpen ? <>
          <nav aria-label="Snel naar" className="client-edit-quick">
            <Link className="button button-secondary" href={`/dashboard/admin/clients/${client.id}`}>Alle klantgegevens <ArrowRight size={15} /></Link>
            {client.customerEmail && client.status === "active" ? <form action={impersonateCustomerAction}><input type="hidden" name="tenantId" value={client.id} /><button className="button button-secondary" type="submit"><Eye size={15} /> Bekijken als klant</button></form> : null}
            {client.customerEmail ? <form action={sendLoginLinkAction}><input type="hidden" name="tenantId" value={client.id} /><input type="hidden" name="returnTo" value="/dashboard/admin/clients" /><button className="button button-secondary" type="submit"><KeyRound size={15} /> Inloglink mailen</button></form> : null}
          </nav>

          <form action={updateCustomerAction} className="client-edit-form" id={formId}>
            <input type="hidden" name="tenantId" value={client.id} />

            <section className="client-edit-section">
              <h3><span>{++section}</span> Gegevens</h3>
              <div className="client-edit-grid">
                <label>Bedrijfsnaam<input name="name" defaultValue={client.name} maxLength={120} required /></label>
                {client.customerEmail
                  ? <label>Inlog-e-mailadres<input name="email" type="email" defaultValue={client.customerEmail} maxLength={254} required /><small>Hiermee logt de klant in en ontvangt die mails.</small></label>
                  : <p className="client-edit-note">Voor deze klant bestaat nog geen klantlogin.</p>}
              </div>
            </section>

            <section className="client-edit-section">
              <h3><span>{++section}</span> Logo</h3>
              <div className="client-edit-logo">
                <div className="client-edit-logo-preview">{shownLogo ? <Image src={shownLogo} alt="Voorbeeld van het logo" width={56} height={56} unoptimized /> : <span>{client.name.slice(0, 1).toUpperCase()}</span>}</div>
                <div className="client-edit-logo-actions">
                  <label className="button button-secondary client-edit-file">
                    <ImageUp size={15} /> {client.logoDataUrl || logoName ? "Ander logo kiezen" : "Logo kiezen"}
                    <input accept="image/png,image/jpeg,image/webp" name="logo" onChange={(event) => {
                      const file = event.target.files?.[0];
                      setLogoName(file?.name ?? null);
                      setLogoPreview(file ? URL.createObjectURL(file) : null);
                      if (file) setRemoveLogo(false);
                    }} type="file" />
                  </label>
                  <small>{logoName ?? "PNG, JPEG of WebP, maximaal 512 KB."}</small>
                  {client.logoDataUrl && !logoName ? <label className="client-edit-check"><input checked={removeLogo} name="removeLogo" onChange={(event) => setRemoveLogo(event.target.checked)} type="checkbox" /> Huidig logo verwijderen</label> : null}
                </div>
              </div>
            </section>

            {owners ? (
              <section className="client-edit-section">
                <h3><span>{++section}</span> Beheerder</h3>
                <OwnerSelect defaultValue={client.ownerId} hideLabel owners={owners} />
              </section>
            ) : null}

            <section className="client-edit-section">
              <h3><span>{++section}</span> Wat ziet de klant?</h3>
              <p className="client-edit-intro">Kies welke onderdelen in de klantomgeving staan.</p>
              <div className="client-edit-switches">
                {visibilityOptions.map((option) => (
                  <label className="client-edit-switch" key={option.name}>
                    <span><strong>{option.title}</strong><small>{option.description}</small></span>
                    <input defaultChecked={client.modules[option.name]} name={option.name} role="switch" type="checkbox" />
                  </label>
                ))}
              </div>
            </section>
          </form>

          <section className="client-edit-danger">
            <div><strong>Klant verwijderen</strong><small>Verwijdert de klant met alle logins, koppelingen en statistieken. Dit kan niet ongedaan worden gemaakt.</small></div>
            {confirmDelete ? (
              <form action={deleteCustomerAction} className="client-edit-danger-confirm">
                <input type="hidden" name="tenantId" value={client.id} />
                <button className="button button-secondary" onClick={() => setConfirmDelete(false)} type="button">Annuleren</button>
                <button className="button button-danger" type="submit"><Trash2 size={15} /> Ja, {client.name} verwijderen</button>
              </form>
            ) : <button className="button button-danger" onClick={() => setConfirmDelete(true)} type="button"><Trash2 size={15} /> Verwijderen…</button>}
          </section>

          <footer className="client-edit-footer">
            <button className="button button-secondary" onClick={closeDialog} type="button">Annuleren</button>
            <button className="button button-primary" form={formId} type="submit">Wijzigingen opslaan</button>
          </footer>
        </> : null}
      </dialog>
    </>
  );
}
