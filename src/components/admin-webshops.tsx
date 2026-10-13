"use client";

import { useRef, useState, useTransition } from "react";
import { Pencil, Plus, Store, Trash2, X } from "lucide-react";
import { deleteWebshopAction, saveWebshopAction, webshopCheckAction, webshopFieldsAction, webshopSampleValuesAction, type WebshopInput } from "@/app/webshop-actions";

type Webshop = { id: string; name: string; kind: "field" | "selections"; profileField: string; fieldValues: string[]; selectionIds: string[]; campaignTerms: string[] };

const number = new Intl.NumberFormat("nl-NL");
const splitList = (value: string) => value.split(",").map((item) => item.trim()).filter(Boolean);
const emptyWebshop: WebshopInput = { name: "", kind: "selections", profileField: "", fieldValues: [], selectionIds: [], campaignTerms: [] };

export function AdminWebshops({ tenantId, webshops, connected, selections }: { tenantId: string; webshops: Webshop[]; connected: boolean; selections: { id: string; name: string }[] }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState<WebshopInput | null>(null);
  const [valuesText, setValuesText] = useState("");
  const [termsText, setTermsText] = useState("");
  const [fields, setFields] = useState<{ id: string; name: string }[] | null>(null);
  const [samples, setSamples] = useState<{ value: string; count: number }[] | null>(null);
  const [check, setCheck] = useState<{ profiles: number | null; campaigns: number; totalCampaigns: number } | null>(null);
  const selectionName = new Map(selections.map((selection) => [selection.id, selection.name]));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function run<T>(label: string, task: () => Promise<{ ok: true; data: T } | { ok: false; error: string }>, onSuccess: (data: T) => void) {
    setBusy(label);
    setError(null);
    startTransition(async () => {
      const result = await task();
      setBusy(null);
      if (result.ok) onSuccess(result.data);
      else setError(result.error);
    });
  }

  function open(webshop: Webshop | null) {
    const start: WebshopInput = webshop ? { id: webshop.id, name: webshop.name, kind: webshop.kind, profileField: webshop.profileField, fieldValues: webshop.fieldValues, selectionIds: webshop.selectionIds, campaignTerms: webshop.campaignTerms } : emptyWebshop;
    setDraft(start);
    setValuesText(start.fieldValues.join(", "));
    setTermsText(start.campaignTerms.join(", "));
    setSamples(null);
    setCheck(null);
    setError(null);
    dialogRef.current?.showModal();
    if (start.kind === "field") loadFieldOptions(start.profileField);
  }

  function loadFieldOptions(profileField: string) {
    if (!fields && connected) run("fields", () => webshopFieldsAction(tenantId), setFields);
    if (profileField) run("samples", () => webshopSampleValuesAction(tenantId, profileField), setSamples);
  }

  function chooseKind(kind: WebshopInput["kind"]) {
    setDraft((value) => ({ ...value!, kind }));
    setCheck(null);
    if (kind === "field") loadFieldOptions(draft?.profileField ?? "");
  }

  function toggleSelection(id: string) {
    setDraft((value) => ({ ...value!, selectionIds: value!.selectionIds.includes(id) ? value!.selectionIds.filter((item) => item !== id) : [...value!.selectionIds, id] }));
    setCheck(null);
  }

  const current = (): WebshopInput => ({ ...draft!, fieldValues: splitList(valuesText), campaignTerms: splitList(termsText) });

  function chooseField(profileField: string) {
    setDraft((value) => ({ ...value!, profileField }));
    setSamples(null);
    setCheck(null);
    if (profileField) run("samples", () => webshopSampleValuesAction(tenantId, profileField), setSamples);
  }

  function addValue(value: string) {
    const values = splitList(valuesText);
    if (!values.includes(value)) setValuesText([...values, value].join(", "));
    setCheck(null);
  }

  return (
    <div className="admin-webshops">
      {webshops.length ? <div className="admin-webshop-list">
        {webshops.map((webshop) => (
          <article className="admin-webshop" key={webshop.id}>
            <div className="admin-webshop-head"><Store size={17} /><strong>{webshop.name}</strong></div>
            {webshop.kind === "selections"
              ? <p><span>Selecties</span> {webshop.selectionIds.map((id) => selectionName.get(id) ?? "(niet meer gevolgd)").join(", ")}</p>
              : <p><span>Profielveld</span> {webshop.profileField} = {webshop.fieldValues.join(" of ")}</p>}
            <p><span>Campagnes met</span> {webshop.campaignTerms.length ? webshop.campaignTerms.map((term) => `‘${term}’`).join(", ") : "geen zoekterm (alleen in Alle webshops)"}</p>
            <div className="admin-webshop-actions">
              <button className="button button-secondary" onClick={() => open(webshop)} type="button"><Pencil size={14} /> Wijzigen</button>
              {confirmDelete === webshop.id
                ? <><button className="button button-danger" disabled={busy !== null} onClick={() => run("delete", () => deleteWebshopAction(tenantId, webshop.id), () => setConfirmDelete(null))} type="button">Ja, verwijderen</button><button className="button button-secondary" onClick={() => setConfirmDelete(null)} type="button">Annuleren</button></>
                : <button className="button button-secondary" onClick={() => setConfirmDelete(webshop.id)} type="button"><Trash2 size={14} /> Verwijderen</button>}
            </div>
          </article>
        ))}
      </div> : <p className="empty-state">Nog geen webshops. Zonder webshops ziet de klant de hele database als één geheel.</p>}
      {!draft && error ? <p className="form-error" role="alert">{error}</p> : null}
      <button className="button button-primary" disabled={!connected} onClick={() => open(null)} type="button"><Plus size={15} /> Webshop toevoegen</button>
      {!connected ? <small className="rfm-hint">Koppel eerst Copernica voor deze klant.</small> : null}

      <dialog aria-labelledby="webshop-dialog-title" className="customer-dialog widget-dialog" onClose={() => setDraft(null)} ref={dialogRef}>
        {draft ? <div className="widget-dialog-form">
          <div className="customer-dialog-header">
            <div><p className="eyebrow">Webshop</p><h2 id="webshop-dialog-title">{draft.id ? `${draft.name} wijzigen` : "Webshop toevoegen"}</h2></div>
            <button aria-label="Venster sluiten" className="icon-button" onClick={() => dialogRef.current?.close()} type="button"><X size={19} /></button>
          </div>
          <label>Naam<input maxLength={80} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="bijv. Macropest" value={draft.name} /></label>
          <fieldset className="webshop-kind">
            <legend>Hoe herken je deze webshop?</legend>
            <label><input checked={draft.kind === "selections"} name="webshop-kind" onChange={() => chooseKind("selections")} type="radio" /> <span><strong>Aan selecties</strong><small>De webshop bestaat uit een of meer gevolgde selecties, bijvoorbeeld B_Macropest. De klant ziet bij deze webshop alleen die selecties.</small></span></label>
            <label><input checked={draft.kind === "field"} name="webshop-kind" onChange={() => chooseKind("field")} type="radio" /> <span><strong>Aan een profielveld</strong><small>Elke gevolgde selectie wordt apart geteld voor de profielen met een bepaalde waarde, bijvoorbeeld MStoreID = 6.</small></span></label>
          </fieldset>
          {draft.kind === "selections" ? <div className="webshop-selections">
            <span>Selecties van deze webshop</span>
            {selections.length ? <ul>{selections.map((selection) => <li key={selection.id}><label><input checked={draft.selectionIds.includes(selection.id)} onChange={() => toggleSelection(selection.id)} type="checkbox" /> {selection.name}</label></li>)}</ul> : <small className="rfm-hint">Deze klant volgt nog geen selecties. Kies eerst selecties bij Beheer.</small>}
          </div> : <>
          <label>Profielveld met de webshop
            <select onChange={(event) => chooseField(event.target.value)} value={draft.profileField}>
              <option value="">{fields ? "Kies een veld" : busy === "fields" ? "Velden ophalen…" : "Kies een veld"}</option>
              {(fields ?? (draft.profileField ? [{ id: draft.profileField, name: draft.profileField }] : [])).map((field) => <option key={field.id} value={field.name}>{field.name}</option>)}
            </select>
          </label>
          <label>Waarden die bij deze webshop horen
            <input onChange={(event) => { setValuesText(event.target.value); setCheck(null); }} placeholder="bijv. TM, tuinmanieren.nl" value={valuesText} />
            <small>Gescheiden door komma’s. Een profiel hoort bij de webshop als het veld precies een van deze waarden bevat.</small>
          </label>
          {busy === "samples" ? <small className="rfm-hint">Voorbeeldwaarden ophalen…</small> : samples?.length ? <div className="webshop-samples"><small>Meest voorkomende waarden in de eerste 1.000 profielen (klik om toe te voegen):</small><div>{samples.map((sample) => <button className="selection-group" key={sample.value || "(leeg)"} disabled={!sample.value} onClick={() => addValue(sample.value)} type="button">{sample.value || "(leeg)"} <small>{number.format(sample.count)}</small></button>)}</div></div> : null}
          </>}
          <label>Zoektermen in campagnenamen
            <input onChange={(event) => { setTermsText(event.target.value); setCheck(null); }} placeholder="bijv. TM, Tuinmanieren" value={termsText} />
            <small>Een mailing hoort bij deze webshop als de naam of het onderwerp een van deze termen bevat. Hoofdletters maken niet uit.</small>
          </label>
          {check ? <p className="form-success" role="status">{check.profiles !== null ? `${number.format(check.profiles)} profielen horen bij deze webshop · ` : ""}{number.format(check.campaigns)} van {number.format(check.totalCampaigns)} campagnes passen op de zoektermen.</p> : null}
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          <div className="customer-dialog-actions">
            <button className="button button-secondary" disabled={busy !== null} onClick={() => run("check", () => webshopCheckAction(tenantId, current()), setCheck)} type="button">{busy === "check" ? "Controleren…" : "Controleren"}</button>
            <button className="button button-primary" disabled={busy !== null} onClick={() => run("save", () => saveWebshopAction(tenantId, current()), () => dialogRef.current?.close())} type="button">{busy === "save" ? "Opslaan…" : "Opslaan"}</button>
          </div>
        </div> : null}
      </dialog>
    </div>
  );
}
