"use client";

import { useState, useTransition } from "react";
import { DatabaseZap, Power, RefreshCw, Upload } from "lucide-react";
import { disablePredictionsAction, ensurePredictionFieldsAction, predictionWriteBackSettingAction, runPredictionsAction, writePredictionsNowAction } from "@/app/predict-actions";
import { predictionCopernicaFields } from "@/lib/predict/writeback-plan";
import type { WriteBackSummary } from "@/lib/rfm/writeback";

const number = new Intl.NumberFormat("nl-NL");

type Message = { tone: "success" | "error"; text: string } | null;

function useAction() {
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<Message>(null);
  const [, startTransition] = useTransition();
  function run<T>(label: string, task: () => Promise<{ ok: true; data: T } | { ok: false; error: string }>, success: (data: T) => string) {
    setBusy(label);
    setMessage(null);
    startTransition(async () => {
      const result = await task();
      setBusy(null);
      setMessage(result.ok ? { tone: "success", text: success(result.data) } : { tone: "error", text: result.error });
    });
  }
  return { busy, message, run };
}

const messageView = (message: Message) => message ? <p className={message.tone === "success" ? "form-success" : "form-error"} role={message.tone === "success" ? "status" : "alert"}>{message.text}</p> : null;

export function PredictRunControls({ tenantId }: { tenantId: string }) {
  const { busy, message, run } = useAction();
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="rfm-controls">
      <button className="button button-secondary" disabled={busy !== null} onClick={() => run("run", () => runPredictionsAction(tenantId), () => "Opnieuw berekend.")} type="button"><RefreshCw size={15} /> {busy === "run" ? "Berekenen…" : "Nu berekenen"}</button>
      {confirm
        ? <><button className="button button-danger" disabled={busy !== null} onClick={() => run("off", () => disablePredictionsAction(tenantId), () => "Voorspellingen staan uit; de scores per profiel zijn verwijderd.")} type="button">Ja, uitzetten</button><button className="button button-secondary" onClick={() => setConfirm(false)} type="button">Annuleren</button></>
        : <button className="button button-secondary" onClick={() => setConfirm(true)} type="button"><Power size={15} /> Uitzetten</button>}
      {messageView(message)}
    </div>
  );
}

export function PredictWriteBack({ tenantId, enabled, allowed, missingFields, lastWrite }: { tenantId: string; enabled: boolean; allowed: boolean; missingFields: string[] | null; lastWrite: WriteBackSummary | null }) {
  const { busy, message, run } = useAction();
  const fieldsReady = missingFields !== null && missingFields.length === 0;
  return (
    <div className="rfm-writeback">
      <p className="rfm-intro">Schrijf de voorspellingen als kenmerk terug naar Copernica. Dan bouw je in Copernica selecties zoals <strong>AI_Koopintentie = Hoog</strong> en <strong>AI_Klanttype = Prospect</strong>, en zet je <strong>AI_Aanbeveling_1</strong> in een mailing.</p>
      <div className="table-wrap">
        <table className="rfm-table">
          <thead><tr><th>Veld in Copernica</th><th>Inhoud</th><th>Status</th></tr></thead>
          <tbody>{predictionCopernicaFields.map((field) => <tr key={field.name}><td><code>{field.name}</code></td><td>{field.description}</td><td>{missingFields === null ? "—" : missingFields.includes(field.name) ? <span className="explain-status explain-status-missing">Ontbreekt</span> : <span className="explain-status explain-status-ok">Aanwezig</span>}</td></tr>)}</tbody>
        </table>
      </div>
      <p className="rfm-assumptions">Alleen voorspellingen van modellen die de backtest haalden worden gevuld; de andere velden blijven leeg. Alleen gewijzigde profielen worden bijgewerkt.</p>
      {!allowed ? <p className="form-error">Geen enkel model haalde de backtest. Er wordt niets teruggeschreven, ook niet als de nachtelijke run aan staat.</p> : null}
      {messageView(message)}
      <div className="rfm-row">
        {!fieldsReady ? <button className="button button-secondary" disabled={busy !== null || missingFields === null} onClick={() => run("fields", () => ensurePredictionFieldsAction(tenantId), (data) => data.created.length ? `Aangemaakt in Copernica: ${data.created.join(", ")}.` : "Alle velden bestonden al.")} type="button"><DatabaseZap size={15} /> {busy === "fields" ? "Velden aanmaken…" : "Velden aanmaken in Copernica"}</button> : null}
        <label className="rfm-check"><input checked={enabled} disabled={busy !== null || !fieldsReady} onChange={(event) => run("setting", () => predictionWriteBackSettingAction(tenantId, event.target.checked), () => event.target.checked ? "Elke nacht worden de wijzigingen teruggeschreven." : "Automatisch terugschrijven staat uit.")} type="checkbox" /> Elke nacht automatisch terugschrijven</label>
        <button className="button button-primary" disabled={busy !== null || !fieldsReady || !allowed} onClick={() => run("write", () => writePredictionsNowAction(tenantId), (data) => `${number.format(data.updated)} profielen bijgewerkt, ${number.format(data.cleared)} leeggemaakt${data.failed ? `, ${number.format(data.failed)} mislukt` : ""}.${data.remaining ? ` Nog ${number.format(data.remaining)} te gaan: klik opnieuw of wacht op de nachtelijke run.` : ""}`)} type="button"><Upload size={15} /> {busy === "write" ? "Terugschrijven… (kan enkele minuten duren)" : "Nu terugschrijven"}</button>
      </div>
      {lastWrite ? <p className="rfm-meta">Laatst teruggeschreven op {new Date(lastWrite.at).toLocaleString("nl-NL")}: {number.format(lastWrite.updated)} bijgewerkt, {number.format(lastWrite.cleared)} leeggemaakt{lastWrite.failed ? `, ${number.format(lastWrite.failed)} mislukt` : ""}{lastWrite.remaining ? `, nog ${number.format(lastWrite.remaining)} te gaan` : ""}.{lastWrite.error ? ` ${lastWrite.error}` : ""}</p> : null}
      {missingFields === null ? <p className="form-error" role="alert">De velden in Copernica konden niet worden gecontroleerd. Controleer de koppeling.</p> : null}
    </div>
  );
}
