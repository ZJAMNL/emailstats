"use client";

import { useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { createCustomerAction } from "@/app/actions";

export function CreateCustomerDialog() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [sendInvite, setSendInvite] = useState(true);

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
      <button className="button button-primary" onClick={openDialog} type="button"><Plus size={16} /> Nieuwe klant</button>
      <dialog aria-labelledby="create-customer-title" className="customer-dialog" onClose={() => setIsOpen(false)} ref={dialogRef}>
        <div className="customer-dialog-header">
          <div><p className="eyebrow">Nieuw account</p><h2 id="create-customer-title">Klant aanmaken</h2></div>
          <button aria-label="Venster sluiten" className="icon-button" onClick={closeDialog} type="button"><X size={19} /></button>
        </div>
        <form action={createCustomerAction} className="customer-form customer-dialog-form">
          <label>Bedrijfsnaam<input name="name" autoComplete="organization" maxLength={120} required /></label>
          <label>Logo<input name="logo" type="file" accept="image/png,image/jpeg,image/webp" /><small>PNG, JPEG of WebP · maximaal 512 KB</small></label>
          <label>Inlog-e-mailadres<input name="email" type="email" autoComplete="email" maxLength={254} required /></label>
          <label className="invite-option"><input checked={sendInvite} name="sendInvite" onChange={(event) => setSendInvite(event.target.checked)} type="checkbox" /> Stuur de klant een e-mail om zelf een wachtwoord in te stellen</label>
          {sendInvite ? null : <label>Tijdelijk wachtwoord<input name="password" type="password" autoComplete="new-password" minLength={12} required /><small>Minimaal 12 tekens. Deel dit wachtwoord veilig met de klant.</small></label>}
          <fieldset className="module-toggle-group">
            <legend>Widgets op het klantdashboard</legend>
            <label><input name="databaseStats" type="checkbox" defaultChecked /> Database- en selectiestatistieken</label>
            <label><input name="campaignStats" type="checkbox" defaultChecked /> E-mailcampagnestatistieken</label>
          </fieldset>
          <div className="customer-dialog-actions">
            <button className="button button-secondary" onClick={closeDialog} type="button">Annuleren</button>
            <button className="button button-primary" disabled={!isOpen} type="submit"><Plus size={16} /> Klant aanmaken</button>
          </div>
        </form>
      </dialog>
    </>
  );
}
