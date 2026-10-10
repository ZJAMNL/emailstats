"use client";

import { useState, useTransition } from "react";
import { Power, RefreshCw } from "lucide-react";
import { disablePredictionsAction, runPredictionsAction } from "@/app/predict-actions";


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
