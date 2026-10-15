"use client";

import { useState, useTransition } from "react";
import { Power, RefreshCw } from "lucide-react";
import { rfmDisableAction, rfmRunAction } from "@/app/rfm-actions";

/** Recalculate or switch off the RFM model. Whether the customer sees it is set per customer (Inzicht). */
export function RfmControls({ tenantId }: { tenantId: string }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDisable, setConfirmDisable] = useState(false);
  const [, startTransition] = useTransition();

  function run(label: string, task: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(label);
    setError(null);
    startTransition(async () => {
      const result = await task();
      setBusy(null);
      if (!result.ok) setError(result.error ?? "Er ging iets mis.");
    });
  }

  return (
    <div className="rfm-controls">
      <button className="button button-secondary" disabled={busy !== null} onClick={() => run("run", () => rfmRunAction(tenantId))} type="button"><RefreshCw size={15} /> {busy === "run" ? "Starten…" : "Nu berekenen"}</button>
      {confirmDisable
        ? <span className="rfm-confirm">Scores per profiel worden verwijderd. <button className="button button-danger" disabled={busy !== null} onClick={() => run("disable", () => rfmDisableAction(tenantId))} type="button">Ja, uitzetten</button><button className="button button-secondary" onClick={() => setConfirmDisable(false)} type="button">Annuleren</button></span>
        : <button className="button button-secondary" disabled={busy !== null} onClick={() => setConfirmDisable(true)} type="button"><Power size={15} /> Model uitzetten</button>}
      {error ? <p className="form-error" role="alert">{error}</p> : null}
    </div>
  );
}
