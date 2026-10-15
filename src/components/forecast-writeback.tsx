"use client";

import { useEffect, useState, useTransition } from "react";
import { DatabaseZap, Save, Upload } from "lucide-react";
import { createForecastCollectionAction, predictionWriteBackSettingAction, saveForecastMappingAction, writeForecastNowAction, type ForecastMappingInput } from "@/app/predict-actions";
import { rfmCollectionDetailsAction, rfmCollectionsAction } from "@/app/rfm-actions";
import { forecastScopes } from "@/lib/predict/orders-plan";

const number = new Intl.NumberFormat("nl-NL");
type Summary = { at: string; created: number; updated: number; deleted: number; failed: number; remaining: number; error?: string };

/** Expected orders to Copernica: one record per expected order in a collection and fields of the beheerder's choice. */
export function ForecastWriteBack({ tenantId, initial, enabled, lastWrite }: { tenantId: string; initial: ForecastMappingInput; enabled: boolean; lastWrite: Summary | null }) {
  const [mapping, setMapping] = useState(initial);
  const [saved, setSaved] = useState(Boolean(initial.collectionId && initial.dateField && initial.skuField));
  const [collections, setCollections] = useState<{ id: string; name: string }[] | null>(null);
  const [fields, setFields] = useState<string[]>([initial.dateField, initial.skuField, initial.nameField, initial.categoryField, initial.chanceField].filter(Boolean));
  const [busy, setBusy] = useState<string | null>("load");
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [, startTransition] = useTransition();

  function run<T>(label: string, task: () => Promise<{ ok: true; data: T } | { ok: false; error: string }>, success: (data: T) => string | null) {
    setBusy(label);
    setMessage(null);
    startTransition(async () => {
      const result = await task();
      setBusy(null);
      if (result.ok) { const text = success(result.data); if (text) setMessage({ tone: "success", text }); }
      else setMessage({ tone: "error", text: result.error });
    });
  }

  // Load the customer's collections (and the fields of the chosen one) straight away, so the lists just work.
  useEffect(() => {
    let current = true;
    Promise.all([rfmCollectionsAction(tenantId), initial.collectionId ? rfmCollectionDetailsAction(tenantId, initial.collectionId) : null]).then(([list, details]) => {
      if (!current) return;
      setBusy(null);
      if (details?.ok) setFields(details.data.fields.map((field) => field.name));
      if (list.ok) setCollections(list.data);
      else setMessage({ tone: "error", text: list.error });
    }, () => { if (current) { setBusy(null); setMessage({ tone: "error", text: "Collecties konden niet worden geladen." }); } });
    return () => { current = false; };
    // Runs once per page view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const update = (patch: Partial<ForecastMappingInput>) => { setMapping((current) => ({ ...current, ...patch })); setSaved(false); };

  function chooseCollection(collectionId: string) {
    update({ collectionId, collectionName: collections?.find((collection) => collection.id === collectionId)?.name ?? "", dateField: "", skuField: "", nameField: "", categoryField: "", chanceField: "" });
    setFields([]);
    if (collectionId) run("fields", () => rfmCollectionDetailsAction(tenantId, collectionId), (data) => { setFields(data.fields.map((field) => field.name)); return null; });
  }

  const fieldSelect = (label: string, key: "dateField" | "skuField" | "nameField" | "categoryField" | "chanceField", required = false) => (
    <label>{label}{required ? null : <small> (optioneel)</small>}
      <select disabled={!fields.length} onChange={(event) => update({ [key]: event.target.value })} value={mapping[key]}>
        <option value="">{!mapping.collectionId ? "Kies eerst een collectie" : busy === "fields" ? "Velden laden…" : required ? "Kies een veld" : "Niet gebruiken"}</option>
        {fields.map((field) => <option key={field} value={field}>{field}</option>)}
      </select>
    </label>
  );

  return (
    <div className="forecast-writeback">
      <p className="rfm-intro">Elke verwachte bestelling wordt een record in een Copernica-collectie: de verwachte <strong>datum</strong> en het <strong>product (SKU)</strong>, eventueel met productnaam, categorie en kans. Zo bouw je in Copernica een flow die een paar dagen vóór de verwachte datum het juiste product mailt.</p>

      <div className="forecast-mapping">
        <div className="forecast-mapping-collection">
          <label>Collectie
            <select disabled={!collections} onChange={(event) => chooseCollection(event.target.value)} value={mapping.collectionId}>
              <option value="">{collections ? "Kies een collectie" : busy === "load" ? "Collecties laden…" : "Collecties konden niet worden geladen"}</option>
              {collections?.map((collection) => <option key={collection.id} value={collection.id}>{collection.name}</option>)}
            </select>
          </label>
          <div className="forecast-mapping-buttons">
            {collections === null && busy !== "load" ? <button className="button button-secondary" onClick={() => run("load", () => rfmCollectionsAction(tenantId), (data) => { setCollections(data); return null; })} type="button">Opnieuw laden</button> : null}
            <button className="button button-secondary" disabled={busy !== null} onClick={() => run("create", () => createForecastCollectionAction(tenantId), (data) => { setMapping(data); setCollections((current) => [...(current ?? []).filter((item) => item.id !== data.collectionId), { id: data.collectionId, name: data.collectionName }]); setFields([data.dateField, data.skuField, data.nameField, data.categoryField, data.chanceField]); setSaved(true); return `Collectie ${data.collectionName} staat klaar en is gekoppeld.`; })} type="button"><DatabaseZap size={15} /> {busy === "create" ? "Aanmaken…" : "Of: nieuwe collectie Verwachte_bestellingen aanmaken"}</button>
          </div>
        </div>
        <div className="forecast-mapping-fields">
          {fieldSelect("Datum", "dateField", true)}
          {fieldSelect("SKU", "skuField", true)}
          {fieldSelect("Productnaam", "nameField")}
          {fieldSelect("Categorie", "categoryField")}
          {fieldSelect("Kans (0–100)", "chanceField")}
        </div>
        <div className="forecast-mapping-fields">
          <label>Records per klant
            <select onChange={(event) => update({ records: Number(event.target.value) })} value={mapping.records}>
              <option value={1}>1: de meest verwachte bestelling</option>
              <option value={2}>2</option>
              <option value={3}>3</option>
            </select>
          </label>
          <label>Welke klanten
            <select onChange={(event) => update({ scope: event.target.value })} value={mapping.scope}>
              {Object.entries(forecastScopes).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
        </div>
      </div>

      {message ? <p className={message.tone === "success" ? "form-success" : "form-error"} role={message.tone === "success" ? "status" : "alert"}>{message.text}</p> : null}
      <div className="rfm-row">
        <button className="button button-primary" disabled={busy !== null || saved || !mapping.collectionId || !mapping.dateField || !mapping.skuField} onClick={() => run("save", () => saveForecastMappingAction(tenantId, mapping), () => { setSaved(true); return "Koppeling opgeslagen."; })} type="button"><Save size={15} /> {saved ? "Opgeslagen" : "Koppeling opslaan"}</button>
        <label className="rfm-check"><input checked={enabled} disabled={busy !== null || !saved} onChange={(event) => run("setting", () => predictionWriteBackSettingAction(tenantId, event.target.checked), () => event.target.checked ? "Elke nacht worden de verwachte bestellingen bijgewerkt." : "Wegschrijven staat uit; de records worden bij de volgende run verwijderd.")} type="checkbox" /> Elke nacht bijwerken</label>
        <button className="button button-secondary" disabled={busy !== null || !saved || !enabled} onClick={() => run("write", () => writeForecastNowAction(tenantId), (data) => data.message)} type="button"><Upload size={15} /> {busy === "write" ? "Starten…" : "Nu wegschrijven"}</button>
      </div>
      {lastWrite ? <p className="rfm-meta">Laatst bijgewerkt op {new Date(lastWrite.at).toLocaleString("nl-NL")}: {number.format(lastWrite.created)} aangemaakt, {number.format(lastWrite.updated)} bijgewerkt, {number.format(lastWrite.deleted)} verwijderd{lastWrite.failed ? `, ${number.format(lastWrite.failed)} mislukt` : ""}{lastWrite.remaining ? `, nog ${number.format(lastWrite.remaining)} te gaan` : ""}.{lastWrite.error ? ` ${lastWrite.error}` : ""}</p> : null}
    </div>
  );
}
