"use client";

import { useEffect, useState, useTransition } from "react";
import { BrainCircuit, Database } from "lucide-react";
import { savePredictionConfigAction, type PredictionSetupInput } from "@/app/predict-actions";
import { rfmCollectionDetailsAction, rfmCollectionsAction } from "@/app/rfm-actions";

type Collection = { id: string; name: string };
type Field = { id: string; name: string; type: string };
type Sample = { total: number; rows: { profile: string; fields: Record<string, string> }[] };

const empty: PredictionSetupInput = { lineCollectionId: "", lineCollectionName: "", lineOrderField: "", orderKeyField: "", lineProductField: "", lineNameField: "", lineCategoryField: "", webCollectionId: "", webCollectionName: "", webDateField: "", webProductField: "", webCategoryField: "", webEventField: "" };
const guess = (fields: Field[], patterns: RegExp[]) => fields.find((field) => patterns.some((pattern) => pattern.test(field.name)))?.name ?? "";
const number = new Intl.NumberFormat("nl-NL");

export function PredictSetup({ tenantId, orderCollection, initial }: { tenantId: string; orderCollection: Collection; initial: PredictionSetupInput | null }) {
  const [settings, setSettings] = useState<PredictionSetupInput>(initial ?? empty);
  const [collections, setCollections] = useState<Collection[] | null>(null);
  const [orderFields, setOrderFields] = useState<Field[]>([]);
  const [lineFields, setLineFields] = useState<Field[]>([]);
  const [webFields, setWebFields] = useState<Field[]>([]);
  const [lineSample, setLineSample] = useState<Sample | null>(null);
  const [webSample, setWebSample] = useState<Sample | null>(null);
  const [consent, setConsent] = useState(Boolean(initial));
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
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

  const update = (patch: Partial<PredictionSetupInput>) => setSettings((current) => ({ ...current, ...patch }));

  // Field lists for the saved choices, so an existing setup can be adjusted.
  useEffect(() => {
    run("load", async () => {
      const [list, order, line, web] = await Promise.all([
        rfmCollectionsAction(tenantId),
        rfmCollectionDetailsAction(tenantId, orderCollection.id),
        initial?.lineCollectionId ? rfmCollectionDetailsAction(tenantId, initial.lineCollectionId) : null,
        initial?.webCollectionId ? rfmCollectionDetailsAction(tenantId, initial.webCollectionId) : null,
      ]);
      if (!list.ok) return list;
      if (order.ok) setOrderFields(order.data.fields);
      if (line?.ok) { setLineFields(line.data.fields); setLineSample(line.data.sample); }
      if (web?.ok) { setWebFields(web.data.fields); setWebSample(web.data.sample); }
      return list;
    }, setCollections);
    // Runs once per page view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function chooseLines(id: string) {
    update({ lineCollectionId: id, lineCollectionName: collections?.find((item) => item.id === id)?.name ?? "", lineOrderField: "", lineProductField: "", lineNameField: "", lineCategoryField: "" });
    setLineFields([]);
    setLineSample(null);
    if (id) run("lines", () => rfmCollectionDetailsAction(tenantId, id), (data) => {
      setLineFields(data.fields);
      setLineSample(data.sample);
      update({
        lineOrderField: guess(data.fields, [/^order.?(id|nr|nummer)?$/i, /order/i]),
        lineProductField: guess(data.fields, [/^(sku|product.?id|artikel.?nummer|ean)$/i, /sku|product.?id|artikel/i]),
        lineNameField: guess(data.fields, [/^(product.?)?naam$/i, /name|naam|titel|title/i]),
        lineCategoryField: guess(data.fields, [/categor/i, /group|groep/i]),
      });
    });
  }

  function chooseWeb(id: string) {
    update({ webCollectionId: id, webCollectionName: collections?.find((item) => item.id === id)?.name ?? "", webDateField: "", webProductField: "", webCategoryField: "", webEventField: "" });
    setWebFields([]);
    setWebSample(null);
    if (id) run("web", () => rfmCollectionDetailsAction(tenantId, id), (data) => {
      setWebFields(data.fields);
      setWebSample(data.sample);
      update({
        webDateField: guess(data.fields, [/^(datum|date|timestamp|tijd)/i, /date|datum|time|tijd/i]),
        webProductField: guess(data.fields, [/sku|product/i]),
        webCategoryField: guess(data.fields, [/categor/i]),
        webEventField: guess(data.fields, [/^(event|type|actie|action)/i, /event|type/i]),
      });
    });
  }

  const select = (label: string, value: string, fields: Field[], onChange: (value: string) => void, { optional = false, emptyLabel = "Niet gebruiken" } = {}) => (
    <label>{label}
      <select disabled={!fields.length} onChange={(event) => onChange(event.target.value)} value={value}>
        {optional || !value ? <option value="">{optional ? emptyLabel : "Kies een veld"}</option> : null}
        {fields.map((field) => <option key={field.id} value={field.name}>{field.name}</option>)}
      </select>
    </label>
  );

  const preview = (sample: Sample | null, columns: string[]) => sample && columns.filter(Boolean).length ? (
    <div className="table-wrap rfm-sample">
      <p className="rfm-hint">{number.format(sample.total)} rijen in deze collectie. Voorbeeld:</p>
      <table className="rfm-table"><thead><tr><th>Profiel</th>{columns.filter(Boolean).map((column) => <th key={column}>{column}</th>)}</tr></thead>
        <tbody>{sample.rows.slice(0, 3).map((row, index) => <tr key={index}><td>{row.profile}</td>{columns.filter(Boolean).map((column) => <td key={column}>{row.fields[column] || "—"}</td>)}</tr>)}</tbody></table>
    </div>
  ) : null;

  const ready = settings.lineCollectionId && settings.lineOrderField && settings.lineProductField && (!settings.webCollectionId || settings.webDateField) && consent;

  return (
    <div className="rfm-setup predict-setup">
      {collections === null ? <p className="rfm-hint">{busy === "load" ? "Collecties ophalen uit Copernica…" : null}</p> : null}

      <fieldset className="predict-step">
        <legend><Database size={15} /> Bestelde producten</legend>
        <label>Collectie met orderregels
          <select disabled={!collections} onChange={(event) => chooseLines(event.target.value)} value={settings.lineCollectionId}>
            <option value="">Kies een collectie</option>
            {collections?.filter((collection) => collection.id !== orderCollection.id).map((collection) => <option key={collection.id} value={collection.id}>{collection.name}</option>)}
          </select>
        </label>
        <div className="predict-fields">
          {select("Verwijst naar order", settings.lineOrderField, lineFields, (value) => update({ lineOrderField: value }))}
          <label>…via dit kenmerk van de order (collectie {orderCollection.name})
            <select onChange={(event) => update({ orderKeyField: event.target.value })} value={settings.orderKeyField}>
              <option value="">Subprofiel-ID van de order</option>
              {orderFields.map((field) => <option key={field.id} value={field.name}>{field.name}</option>)}
            </select>
          </label>
          {select("Product-ID of SKU", settings.lineProductField, lineFields, (value) => update({ lineProductField: value }))}
          {select("Productnaam", settings.lineNameField, lineFields, (value) => update({ lineNameField: value }), { optional: true })}
          {select("Categorie", settings.lineCategoryField, lineFields, (value) => update({ lineCategoryField: value }), { optional: true })}
        </div>
        {preview(lineSample, [settings.lineOrderField, settings.lineProductField, settings.lineNameField, settings.lineCategoryField])}
      </fieldset>

      <fieldset className="predict-step">
        <legend><Database size={15} /> Webtracking (optioneel)</legend>
        <p className="rfm-hint">Zonder webtracking werkt alleen het model voor bestaande kopers en de aanbevelingen op aankopen. Profielen zonder aankoop krijgen dan geen voorspelling.</p>
        <label>Collectie met websitebezoek
          <select disabled={!collections} onChange={(event) => chooseWeb(event.target.value)} value={settings.webCollectionId}>
            <option value="">Geen webtracking gebruiken</option>
            {collections?.filter((collection) => collection.id !== orderCollection.id && collection.id !== settings.lineCollectionId).map((collection) => <option key={collection.id} value={collection.id}>{collection.name}</option>)}
          </select>
        </label>
        {settings.webCollectionId ? <div className="predict-fields">
          {select("Datum en tijd", settings.webDateField, webFields, (value) => update({ webDateField: value }))}
          {select("Bekeken product (ID/SKU)", settings.webProductField, webFields, (value) => update({ webProductField: value }), { optional: true })}
          {select("Categorie", settings.webCategoryField, webFields, (value) => update({ webCategoryField: value }), { optional: true })}
          {select("Soort event (bijv. view, add_to_cart)", settings.webEventField, webFields, (value) => update({ webEventField: value }), { optional: true })}
        </div> : null}
        {settings.webCollectionId ? preview(webSample, [settings.webDateField, settings.webProductField, settings.webCategoryField, settings.webEventField]) : null}
      </fieldset>

      <label className="rfm-check predict-consent"><input checked={consent} onChange={(event) => setConsent(event.target.checked)} type="checkbox" /> De klant heeft een grondslag (zoals toestemming) om aankopen en websitegedrag te gebruiken voor profilering en informeert klanten daarover in de privacyverklaring.</label>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <div className="rfm-row">
        <button className="button button-primary" disabled={!ready || busy !== null} onClick={() => run("save", () => savePredictionConfigAction(tenantId, settings), () => undefined)} type="button"><BrainCircuit size={15} /> {busy === "save" ? "Opslaan en berekenen… (kan enkele minuten duren)" : "Opslaan en berekenen"}</button>
      </div>
    </div>
  );
}
