"use client";

import { useRef, useState, useTransition } from "react";
import { ArrowDown, ArrowUp, FolderPlus, Pencil, Search, Trash2, X } from "lucide-react";
import { saveSelectionGroupsAction } from "@/app/actions";
import { saveTenantSelectionGroupsAction } from "@/app/webshop-actions";
import type { SelectionGroup } from "@/lib/selection-groups";

type Draft = { id: string; name: string; selectionIds: string[] };

/**
 * Named groups of followed selections, shown as headings on the dashboard. Used by the customer (Beheer)
 * and by the beheerder on the client page (with `tenantId`).
 */
export function SelectionGroupsEditor({ tenantId, groups, selections }: { tenantId?: string; groups: SelectionGroup[]; selections: { id: string; name: string }[] }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const name = new Map(selections.map((selection) => [selection.id, selection.name]));
  const groupOf = new Map(groups.flatMap((group) => group.selectionIds.map((id) => [id, group] as const)));

  function save(next: SelectionGroup[], success: string, closeDialog = false) {
    setMessage(null);
    startTransition(async () => {
      const result = tenantId ? await saveTenantSelectionGroupsAction(tenantId, next) : await saveSelectionGroupsAction(next);
      if (!result.ok) {
        setMessage({ tone: "error", text: result.error });
        return;
      }
      if (closeDialog) dialogRef.current?.close();
      setConfirmDelete(null);
      setMessage({ tone: "success", text: success });
    });
  }

  function open(group: SelectionGroup | null) {
    setDraft(group ? { ...group } : { id: crypto.randomUUID(), name: "", selectionIds: [] });
    setQuery("");
    setMessage(null);
    dialogRef.current?.showModal();
  }

  function submit() {
    if (!draft) return;
    const name = draft.name.trim();
    if (!name || !draft.selectionIds.length) {
      setMessage({ tone: "error", text: "Geef de groep een naam en kies minstens één selectie." });
      return;
    }
    // A selection belongs to one group: choosing it here moves it out of its current group.
    const chosen = new Set(draft.selectionIds);
    const others = groups.filter((group) => group.id !== draft.id).map((group) => ({ ...group, selectionIds: group.selectionIds.filter((id) => !chosen.has(id)) }));
    const exists = groups.some((group) => group.id === draft.id);
    const next = exists ? groups.map((group) => (group.id === draft.id ? { ...draft, name } : others.find((other) => other.id === group.id)!)) : [...others, { ...draft, name }];
    save(next, exists ? `De groep ${name} is bijgewerkt.` : `De groep ${name} is aangemaakt.`, true);
  }

  function move(index: number, offset: number) {
    const next = [...groups];
    const [group] = next.splice(index, 1);
    next.splice(index + offset, 0, group);
    save(next, "De volgorde van de groepen is opgeslagen.");
  }

  const needle = query.trim().toLowerCase();
  const visible = selections.filter((selection) => !needle || selection.name.toLowerCase().includes(needle));

  return (
    <div className="selection-groups-editor">
      {message && !draft ? <p className={message.tone === "success" ? "form-success" : "form-error"} role={message.tone === "success" ? "status" : "alert"}>{message.text}</p> : null}
      {groups.length ? <ul className="widget-group-list">
        {groups.map((group, index) => (
          <li key={group.id}>
            <div className="widget-group-main">
              <strong>{group.name}</strong>
              <div className="widget-group-chips">{group.selectionIds.map((id) => <span className="selection-chip" key={id}>{name.get(id) ?? "Niet meer gevolgd"}</span>)}</div>
            </div>
            <div className="widget-group-actions">
              <button aria-label={`${group.name} omhoog`} className="icon-button" disabled={pending || index === 0} onClick={() => move(index, -1)} type="button"><ArrowUp size={15} /></button>
              <button aria-label={`${group.name} omlaag`} className="icon-button" disabled={pending || index === groups.length - 1} onClick={() => move(index, 1)} type="button"><ArrowDown size={15} /></button>
              <button aria-label={`${group.name} wijzigen`} className="icon-button" onClick={() => open(group)} type="button"><Pencil size={15} /></button>
              {confirmDelete === group.id
                ? <><button className="button button-danger" disabled={pending} onClick={() => save(groups.filter((item) => item.id !== group.id), `De groep ${group.name} is verwijderd; de selecties blijven gevolgd.`)} type="button">Verwijderen</button><button className="button button-secondary" onClick={() => setConfirmDelete(null)} type="button">Annuleren</button></>
                : <button aria-label={`${group.name} verwijderen`} className="icon-button" onClick={() => setConfirmDelete(group.id)} type="button"><Trash2 size={15} /></button>}
            </div>
          </li>
        ))}
      </ul> : <p className="empty-state">Nog geen groepen. Zonder groepen staan alle selecties onder elkaar.</p>}
      <button className="button button-primary" disabled={!selections.length} onClick={() => open(null)} type="button"><FolderPlus size={15} /> Groep toevoegen</button>
      {!selections.length ? <small className="rfm-hint">Volg eerst selecties; daarna kun je ze groeperen.</small> : null}

      <dialog aria-labelledby="group-dialog-title" className="customer-dialog widget-dialog" onClose={() => setDraft(null)} ref={dialogRef}>
        {draft ? <div className="widget-dialog-form">
          <div className="customer-dialog-header">
            <div><p className="eyebrow">Groep</p><h2 id="group-dialog-title">{groups.some((group) => group.id === draft.id) ? `${draft.name || "Groep"} wijzigen` : "Groep toevoegen"}</h2></div>
            <button aria-label="Venster sluiten" className="icon-button" onClick={() => dialogRef.current?.close()} type="button"><X size={19} /></button>
          </div>
          <label>Naam<input autoFocus maxLength={60} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="bijv. Orders of B2B" value={draft.name} /></label>
          <div className="webshop-selections">
            <span>Selecties in deze groep <small>({draft.selectionIds.length} gekozen)</small></span>
            {selections.length > 8 ? <label className="selection-search"><Search size={15} /><input aria-label="Zoek selectie" onChange={(event) => setQuery(event.target.value)} placeholder="Zoek selectie" type="search" value={query} /></label> : null}
            <ul>
              {visible.map((selection) => {
                const current = groupOf.get(selection.id);
                const checked = draft.selectionIds.includes(selection.id);
                return (
                  <li key={selection.id}>
                    <label>
                      <input checked={checked} onChange={() => setDraft({ ...draft, selectionIds: checked ? draft.selectionIds.filter((id) => id !== selection.id) : [...draft.selectionIds, selection.id] })} type="checkbox" />
                      {selection.name}
                      {current && current.id !== draft.id ? <small className="widget-group-note">{checked ? `wordt verplaatst uit ${current.name}` : `nu in ${current.name}`}</small> : null}
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>
          {message?.tone === "error" ? <p className="form-error" role="alert">{message.text}</p> : null}
          <div className="customer-dialog-actions">
            <button className="button button-secondary" onClick={() => dialogRef.current?.close()} type="button">Annuleren</button>
            <button className="button button-primary" disabled={pending} onClick={submit} type="button">{pending ? "Opslaan…" : "Opslaan"}</button>
          </div>
        </div> : null}
      </dialog>
    </div>
  );
}
