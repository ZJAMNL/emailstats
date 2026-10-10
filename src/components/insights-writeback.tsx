"use client";

import { useState, useTransition } from "react";
import { DatabaseZap, Upload } from "lucide-react";
import { ensureInsightsCollectionAction, rfmProfileFieldsAction, writeInsightsNowAction } from "@/app/insights-actions";
import { predictionWriteBackSettingAction } from "@/app/predict-actions";
import { rfmWriteBackSettingAction } from "@/app/rfm-actions";
import { INSIGHTS_COLLECTION, insightFields, insightTypes } from "@/lib/insights/fields";
import type { InsightsStatus, InsightWriteSummary } from "@/lib/insights/writer";

const number = new Intl.NumberFormat("nl-NL");
const typeLabel = { text: "tekst", integer: "geheel getal", float: "getal", empty_date: "datum" } as const;

type Props = {
  tenantId: string;
  /** Which part of the collection this page switches on: RFM values or predictions. */
  part: "rfm" | "ai";
  enabled: boolean;
  /** For predictions: whether a model passed its backtest. */
  allowed?: boolean;
  status: InsightsStatus | null;
  lastWrite: InsightWriteSummary | null;
  /** RFM only: the transition period for the old RFM_ profile fields. */
  legacy?: { enabled: boolean; remaining: number };
};

export function InsightsWriteBack({ tenantId, part, enabled, allowed = true, status, lastWrite, legacy }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [, startTransition] = useTransition();
  const ready = status !== null && status.collectionId !== null && status.missingFields.length === 0;
  const needsUpdate = status !== null && (!ready || status.obsoleteFields.length > 0);

  function run<T>(label: string, task: () => Promise<{ ok: true; data: T } | { ok: false; error: string }>, success: (data: T) => string) {
    setBusy(label);
    setMessage(null);
    startTransition(async () => {
      const result = await task();
      setBusy(null);
      setMessage(result.ok ? { tone: "success", text: success(result.data) } : { tone: "error", text: result.error });
    });
  }

  const toggle = (value: boolean) => (part === "rfm" ? rfmWriteBackSettingAction(tenantId, value) : predictionWriteBackSettingAction(tenantId, value));
  const what = part === "rfm" ? "de RFM-waarden" : "de voorspellingen";

  return (
    <div className="rfm-writeback">
      <p className="rfm-intro">De inzichten komen in de Copernica-collectie <strong>{INSIGHTS_COLLECTION}</strong>, zodat het profiel zelf schoon blijft. Net als bij orders krijgt elk profiel meerdere records: één per inzicht. In Copernica selecteer je bijvoorbeeld op ‘heeft een record in {INSIGHTS_COLLECTION} met {part === "rfm" ? "Type = Segment en Waarde = Risico" : "Type = Koopintentie en Waarde = Hoog"}’.</p>
      <div className="table-wrap">
        <table className="rfm-table">
          <thead><tr><th>Soort inzicht (Type)</th><th>Voorbeeld</th><th>Gebruik</th></tr></thead>
          <tbody>{insightTypes.filter((info) => info.source === part).map((info) => <tr key={info.type}><td><strong>{info.type}</strong></td><td>{info.example}</td><td>{info.use}</td></tr>)}</tbody>
        </table>
      </div>
      <div className="table-wrap">
        <table className="rfm-table">
          <thead><tr><th>Veld</th><th>Type</th><th>Inhoud</th><th>Status</th></tr></thead>
          <tbody>{insightFields.map((field) => <tr key={field.name}><td><code>{field.name}</code></td><td>{typeLabel[field.type]}</td><td>{field.description}</td><td>{status === null ? "—" : status.missingFields.includes(field.name) ? <span className="explain-status explain-status-missing">Ontbreekt</span> : <span className="explain-status explain-status-ok">Aanwezig</span>}</td></tr>)}</tbody>
        </table>
      </div>
      <p className="rfm-assumptions">Alleen records die veranderen worden bijgewerkt. Records die niet meer gelden (bijv. een aanbeveling die vervalt) worden verwijderd. Zet je terugschrijven uit, dan worden {what} bij de volgende run uit {INSIGHTS_COLLECTION} gehaald.</p>
      {status?.obsoleteFields.length ? <p className="rfm-hint">In de collectie staan nog {status.obsoleteFields.length} velden van de eerste versie (bijv. {status.obsoleteFields.slice(0, 3).join(", ")}). ‘Collectie bijwerken’ verwijdert die; andere velden blijven onaangeroerd.</p> : null}
      {part === "ai" && !allowed ? <p className="form-error">Geen enkel model haalde de backtest. Er komen geen voorspellingen in {INSIGHTS_COLLECTION}, ook niet als terugschrijven aan staat.</p> : null}
      {message ? <p className={message.tone === "success" ? "form-success" : "form-error"} role={message.tone === "success" ? "status" : "alert"}>{message.text}</p> : null}
      <div className="rfm-row">
        {needsUpdate ? <button className="button button-secondary" disabled={busy !== null || status === null} onClick={() => run("collection", () => ensureInsightsCollectionAction(tenantId), (data) => `${data.createdCollection ? `Collectie ${INSIGHTS_COLLECTION} aangemaakt` : `Collectie ${INSIGHTS_COLLECTION} bijgewerkt`}${data.createdFields.length ? `, ${data.createdFields.length} velden toegevoegd` : ""}${data.removedFields.length ? `, ${data.removedFields.length} oude velden verwijderd` : ""}.`)} type="button"><DatabaseZap size={15} /> {busy === "collection" ? "Bezig…" : status?.collectionId ? `Collectie ${INSIGHTS_COLLECTION} bijwerken` : `Collectie ${INSIGHTS_COLLECTION} aanmaken`}</button> : null}
        <label className="rfm-check"><input checked={enabled} disabled={busy !== null || !ready} onChange={(event) => run("setting", () => toggle(event.target.checked), () => event.target.checked ? `Elke nacht worden ${what} bijgewerkt in ${INSIGHTS_COLLECTION}.` : `Terugschrijven van ${what} staat uit.`)} type="checkbox" /> Elke nacht automatisch terugschrijven</label>
        <button className="button button-primary" disabled={busy !== null || !ready} onClick={() => run("write", () => writeInsightsNowAction(tenantId), (data) => `${number.format(data.created)} records aangemaakt, ${number.format(data.updated)} bijgewerkt, ${number.format(data.deleted)} verwijderd${data.failed ? `, ${number.format(data.failed)} mislukt` : ""}.${data.remaining ? ` Nog ${number.format(data.remaining)} te gaan: klik opnieuw of wacht op de nachtelijke run.` : ""}`)} type="button"><Upload size={15} /> {busy === "write" ? "Terugschrijven… (kan enkele minuten duren)" : "Nu terugschrijven"}</button>
      </div>
      {lastWrite ? <p className="rfm-meta">Laatst bijgewerkt op {new Date(lastWrite.at).toLocaleString("nl-NL")}: {number.format(lastWrite.created)} aangemaakt, {number.format(lastWrite.updated)} bijgewerkt, {number.format(lastWrite.deleted)} verwijderd{lastWrite.failed ? `, ${number.format(lastWrite.failed)} mislukt` : ""}{lastWrite.remaining ? `, nog ${number.format(lastWrite.remaining)} te gaan` : ""}.{lastWrite.error ? ` ${lastWrite.error}` : ""}</p> : null}
      {status === null ? <p className="form-error" role="alert">Copernica kon niet worden gecontroleerd. Controleer de koppeling.</p> : null}

      {legacy ? (
        <div className="insights-legacy">
          <p className="eyebrow">Overgang</p>
          <label className="rfm-check"><input checked={legacy.enabled} disabled={busy !== null} onChange={(event) => run("legacy", () => rfmProfileFieldsAction(tenantId, event.target.checked), (data) => event.target.checked ? "De oude RFM_-profielvelden worden weer bijgewerkt." : `Oude RFM_-profielvelden: ${number.format(data.cleared)} profielen leeggemaakt${data.remaining ? `, nog ${number.format(data.remaining)} te gaan (de nachtelijke run maakt het af)` : ""}.`)} type="checkbox" /> Ook de oude profielvelden (RFM_Segment, RFM_Score, …) blijven bijwerken</label>
          <p className="rfm-hint">{legacy.enabled
            ? "Laat dit aan tot de selecties en flows van deze klant op Klantinzichten zijn overgezet. Zet je het uit, dan worden de oude velden leeggemaakt."
            : legacy.remaining ? `De oude velden worden leeggemaakt: nog ${number.format(legacy.remaining)} profielen.` : "De oude profielvelden worden niet meer gebruikt en zijn leeg."}</p>
        </div>
      ) : null}
    </div>
  );
}
