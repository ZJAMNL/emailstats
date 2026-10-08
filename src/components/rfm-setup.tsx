"use client";

import { useState, useTransition } from "react";
import { Calculator, Database, Save } from "lucide-react";
import { rfmCollectionDetailsAction, rfmCollectionsAction, rfmPreviewAction, rfmSaveAction } from "@/app/rfm-actions";
import type { RfmModelSettings, RfmRunSummary } from "@/lib/rfm/run";
import { RfmCohorts, RfmHeatmap, RfmKpis, RfmPrediction, RfmQuality, RfmSegmentTable } from "@/components/rfm-overview";

type Collection = { id: string; name: string };
type Field = { id: string; name: string; type: string };
type Sample = { total: number; rows: { profile: string; fields: Record<string, string> }[] };

export type RfmSetupInitial = RfmModelSettings & { collectionName: string; customerVisible: boolean };

const guessField = (fields: Field[], patterns: RegExp[]) => fields.find((field) => patterns.some((pattern) => pattern.test(field.name)))?.name ?? "";

export function RfmSetup({ tenantId, initial }: { tenantId: string; initial: RfmSetupInitial | null }) {
  const [collections, setCollections] = useState<Collection[] | null>(initial ? [{ id: initial.collectionId, name: initial.collectionName }] : null);
  const [fields, setFields] = useState<Field[]>([]);
  const [sample, setSample] = useState<Sample | null>(null);
  const [settings, setSettings] = useState<RfmSetupInitial>(initial ?? {
    collectionId: "", collectionName: "", dateField: "", amountField: "", statusField: null, excludedStatuses: [],
    windowMonths: 24, frequencyThresholds: [1, 2, 3, 4, 5], marginPercent: 100, customerVisible: false,
  });
  const [preview, setPreview] = useState<RfmRunSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
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

  function update(patch: Partial<RfmSetupInitial>) {
    setSettings((current) => ({ ...current, ...patch }));
    setPreview(null);
    setSaved(false);
  }

  function loadCollections() {
    run("collections", () => rfmCollectionsAction(tenantId), (data) => setCollections(data));
  }

  function chooseCollection(collectionId: string) {
    const collection = collections?.find((item) => item.id === collectionId);
    update({ collectionId, collectionName: collection?.name ?? "", dateField: "", amountField: "", statusField: null, excludedStatuses: [] });
    setFields([]);
    setSample(null);
    if (!collectionId) return;
    run("fields", () => rfmCollectionDetailsAction(tenantId, collectionId), (data) => {
      setFields(data.fields);
      setSample(data.sample);
      update({
        collectionId,
        collectionName: collection?.name ?? "",
        dateField: guessField(data.fields, [/datum/i, /date/i]),
        amountField: guessField(data.fields, [/bedrag/i, /totaal/i, /total/i, /amount/i, /omzet/i, /prijs/i, /price/i]),
        statusField: guessField(data.fields, [/status/i]) || null,
      });
    });
  }

  function reloadFields() {
    if (settings.collectionId) run("fields", () => rfmCollectionDetailsAction(tenantId, settings.collectionId), (data) => { setFields(data.fields); setSample(data.sample); });
  }

  const ready = Boolean(settings.collectionId && settings.dateField && settings.amountField);
  const fieldOptions = fields.length ? fields : [settings.dateField, settings.amountField, settings.statusField].filter(Boolean).map((name) => ({ id: String(name), name: String(name), type: "" }));
  const sampleColumns = sample ? [settings.dateField, settings.amountField, settings.statusField].filter((name): name is string => Boolean(name)) : [];

  return (
    <div className="rfm-setup">
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {saved ? <p className="form-success" role="status">Het model is opgeslagen en berekend.</p> : null}

      <ol className="rfm-steps">
        <li>
          <h3>1. Orderscollectie</h3>
          <p>De collectie in Copernica waarin elke order als subprofiel bij een profiel staat.</p>
          <div className="rfm-row">
            {collections ? <select aria-label="Collectie" onChange={(event) => chooseCollection(event.target.value)} value={settings.collectionId}>
              <option value="">Kies een collectie</option>
              {collections.map((collection) => <option key={collection.id} value={collection.id}>{collection.name}</option>)}
            </select> : null}
            <button className="button button-secondary" disabled={busy !== null} onClick={loadCollections} type="button"><Database size={15} /> {busy === "collections" ? "Ophalen…" : collections ? "Lijst vernieuwen" : "Collecties ophalen"}</button>
          </div>
        </li>

        <li className={settings.collectionId ? undefined : "is-disabled"}>
          <h3>2. Velden koppelen</h3>
          {busy === "fields" ? <p>Velden en voorbeeldorders ophalen…</p> : null}
          {settings.collectionId && !fields.length && busy !== "fields" ? <button className="button button-secondary" onClick={reloadFields} type="button">Velden ophalen</button> : null}
          <div className="rfm-fields">
            <label>Orderdatum *<select disabled={!fieldOptions.length} onChange={(event) => update({ dateField: event.target.value })} value={settings.dateField}><option value="">Kies een veld</option>{fieldOptions.map((field) => <option key={field.id} value={field.name}>{field.name}{field.type ? ` (${field.type})` : ""}</option>)}</select></label>
            <label>Orderbedrag *<select disabled={!fieldOptions.length} onChange={(event) => update({ amountField: event.target.value })} value={settings.amountField}><option value="">Kies een veld</option>{fieldOptions.map((field) => <option key={field.id} value={field.name}>{field.name}{field.type ? ` (${field.type})` : ""}</option>)}</select></label>
            <label>Orderstatus<select disabled={!fieldOptions.length} onChange={(event) => update({ statusField: event.target.value || null })} value={settings.statusField ?? ""}><option value="">Geen statusveld</option>{fieldOptions.map((field) => <option key={field.id} value={field.name}>{field.name}</option>)}</select></label>
            <label>Uitsluiten bij status<input disabled={!settings.statusField} onChange={(event) => update({ excludedStatuses: event.target.value.split(",").map((status) => status.trim()).filter(Boolean) })} placeholder="bijv. geannuleerd, retour" defaultValue={settings.excludedStatuses.join(", ")} /><small>Gescheiden door komma’s, hoofdletters maken niet uit.</small></label>
          </div>
          {sample && sampleColumns.length ? <div className="table-wrap rfm-sample">
            <p>Voorbeeld van de laatste {sample.rows.length} van {sample.total.toLocaleString("nl-NL")} orders:</p>
            <table><thead><tr><th>Profiel</th>{sampleColumns.map((column) => <th key={column}>{column}</th>)}</tr></thead>
              <tbody>{sample.rows.map((row, index) => <tr key={index}><td>{row.profile}</td>{sampleColumns.map((column) => <td key={column}>{row.fields[column] || "—"}</td>)}</tr>)}</tbody></table>
          </div> : null}
        </li>

        <li className={ready ? undefined : "is-disabled"}>
          <h3>3. Model</h3>
          <div className="rfm-fields">
            <label>Analysevenster<select onChange={(event) => update({ windowMonths: Number(event.target.value) })} value={settings.windowMonths}><option value={12}>12 maanden</option><option value={24}>24 maanden (aanbevolen)</option><option value={36}>36 maanden</option></select></label>
            <label>Marge voor klantwaarde (%)<input max={100} min={1} onChange={(event) => update({ marginPercent: Number(event.target.value) })} type="number" value={settings.marginPercent} /><small>100% = klantwaarde in omzet.</small></label>
            <fieldset className="rfm-thresholds">
              <legend>Frequentie: minimaal aantal orders per score</legend>
              {settings.frequencyThresholds.map((threshold, index) => <label key={index}>F{index + 1}<input min={1} onChange={(event) => update({ frequencyThresholds: settings.frequencyThresholds.map((value, position) => position === index ? Number(event.target.value) : value) })} type="number" value={threshold} /></label>)}
            </fieldset>
          </div>
        </li>

        <li className={ready ? undefined : "is-disabled"}>
          <h3>4. Controleren en activeren</h3>
          <label className="rfm-check"><input checked={settings.customerVisible} onChange={(event) => update({ customerVisible: event.target.checked })} type="checkbox" /> Ook tonen op het dashboard van de klant</label>
          <div className="rfm-row">
            <button className="button button-secondary" disabled={!ready || busy !== null} onClick={() => run("preview", () => rfmPreviewAction(tenantId, settings), setPreview)} type="button"><Calculator size={15} /> {busy === "preview" ? "Berekenen… (kan even duren)" : "Proefberekening"}</button>
            <button className="button button-primary" disabled={!ready || busy !== null} onClick={() => run("save", () => rfmSaveAction(tenantId, settings), () => setSaved(true))} type="button"><Save size={15} /> {busy === "save" ? "Opslaan en berekenen…" : "Opslaan en berekenen"}</button>
          </div>
          <small className="rfm-hint">De proefberekening haalt alle orders op en slaat niets op. Bij grote databases kan dat een minuut duren.</small>
        </li>
      </ol>

      {preview ? <section className="rfm-preview" aria-label="Resultaat van de proefberekening">
        <h3>Proefberekening</h3>
        <RfmQuality summary={preview} />
        <RfmKpis summary={preview} />
        <div className="rfm-preview-grid"><RfmHeatmap grid={preview.grid} /></div>
        <RfmSegmentTable summary={preview} />
        <h3>Voorspelde klantwaarde</h3>
        <RfmPrediction summary={preview} />
        <h3>Cohortanalyse</h3>
        <RfmCohorts summary={preview} />
      </section> : null}
    </div>
  );
}
