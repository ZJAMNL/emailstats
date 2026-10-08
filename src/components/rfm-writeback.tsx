"use client";

import { useState, useTransition } from "react";
import { DatabaseZap, Upload } from "lucide-react";
import { rfmEnsureFieldsAction, rfmWriteBackNowAction, rfmWriteBackSettingAction } from "@/app/rfm-actions";
import { noRecentPurchaseLabel, rfmCopernicaFields } from "@/lib/rfm/writeback-plan";
import type { WriteBackSummary } from "@/lib/rfm/writeback";

const number = new Intl.NumberFormat("nl-NL");

export function RfmWriteBack({ tenantId, enabled, missingFields, lastWrite }: { tenantId: string; enabled: boolean; missingFields: string[] | null; lastWrite: WriteBackSummary | null }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [, startTransition] = useTransition();
  const fieldsReady = missingFields !== null && missingFields.length === 0;

  function run<T>(label: string, task: () => Promise<{ ok: true; data: T } | { ok: false; error: string }>, success: (data: T) => string) {
    setBusy(label);
    setMessage(null);
    startTransition(async () => {
      const result = await task();
      setBusy(null);
      setMessage(result.ok ? { tone: "success", text: success(result.data) } : { tone: "error", text: result.error });
    });
  }

  return (
    <div className="rfm-writeback">
      <p className="rfm-intro">Schrijf het RFM-profiel van elke klant als kenmerk terug naar Copernica. Dan kun je in Copernica selecties en flows bouwen op bijvoorbeeld <strong>RFM_Segment = Risico</strong>, en volgen die selecties automatisch in dit dashboard.</p>
      <div className="table-wrap">
        <table className="rfm-table">
          <thead><tr><th>Veld in Copernica</th><th>Type</th><th>Inhoud</th><th>Status</th></tr></thead>
          <tbody>{rfmCopernicaFields.map((field) => <tr key={field.name}><td><code>{field.name}</code></td><td>{field.type === "empty_date" ? "datum" : field.type === "float" ? "getal" : field.type === "integer" ? "geheel getal" : "tekst"}</td><td>{field.description}</td><td>{missingFields === null ? "—" : missingFields.includes(field.name) ? <span className="explain-status explain-status-missing">Ontbreekt</span> : <span className="explain-status explain-status-ok">Aanwezig</span>}</td></tr>)}</tbody>
        </table>
      </div>
      <p className="rfm-assumptions">Alleen profielen waarvan het segment, de score of de waarde verandert worden bijgewerkt. Klanten die uit het analysevenster vallen krijgen het segment ‘{noRecentPurchaseLabel}’.</p>

      {message ? <p className={message.tone === "success" ? "form-success" : "form-error"} role={message.tone === "success" ? "status" : "alert"}>{message.text}</p> : null}
      <div className="rfm-row">
        {!fieldsReady ? <button className="button button-secondary" disabled={busy !== null || missingFields === null} onClick={() => run("fields", () => rfmEnsureFieldsAction(tenantId), (data) => data.created.length ? `Aangemaakt in Copernica: ${data.created.join(", ")}.` : "Alle velden bestonden al.")} type="button"><DatabaseZap size={15} /> {busy === "fields" ? "Velden aanmaken…" : "Velden aanmaken in Copernica"}</button> : null}
        <label className="rfm-check"><input checked={enabled} disabled={busy !== null || !fieldsReady} onChange={(event) => run("setting", () => rfmWriteBackSettingAction(tenantId, event.target.checked), () => event.target.checked ? "Elke nacht worden de wijzigingen teruggeschreven." : "Automatisch terugschrijven staat uit.")} type="checkbox" /> Elke nacht automatisch terugschrijven</label>
        <button className="button button-primary" disabled={busy !== null || !fieldsReady} onClick={() => run("write", () => rfmWriteBackNowAction(tenantId), (data) => `${number.format(data.updated)} profielen bijgewerkt, ${number.format(data.cleared)} gemarkeerd als ‘${noRecentPurchaseLabel}’${data.failed ? `, ${number.format(data.failed)} mislukt` : ""}.${data.remaining ? ` Nog ${number.format(data.remaining)} te gaan: klik opnieuw of wacht op de nachtelijke run.` : ""}`)} type="button"><Upload size={15} /> {busy === "write" ? "Terugschrijven… (kan enkele minuten duren)" : "Nu terugschrijven"}</button>
      </div>
      {lastWrite ? <p className="rfm-meta">Laatst teruggeschreven op {new Date(lastWrite.at).toLocaleString("nl-NL")}: {number.format(lastWrite.updated)} bijgewerkt, {number.format(lastWrite.cleared)} uit het venster{lastWrite.failed ? `, ${number.format(lastWrite.failed)} mislukt` : ""}{lastWrite.remaining ? `, nog ${number.format(lastWrite.remaining)} te gaan` : ""}.{lastWrite.error ? ` ${lastWrite.error}` : ""}</p> : null}
      {missingFields === null ? <p className="form-error" role="alert">De velden in Copernica konden niet worden gecontroleerd. Controleer de koppeling.</p> : null}
    </div>
  );
}
