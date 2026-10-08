"use client";

import { useState, useTransition } from "react";
import { Power, RefreshCw } from "lucide-react";
import { rfmDisableAction, rfmRunAction, rfmVisibilityAction } from "@/app/rfm-actions";

export function RfmControls({ tenantId, customerVisible }: { tenantId: string; customerVisible: boolean }) {
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
      <label className="rfm-check"><input checked={customerVisible} disabled={busy !== null} onChange={(event) => run("visibility", () => rfmVisibilityAction(tenantId, event.target.checked))} type="checkbox" /> Zichtbaar voor de klant</label>
      <button className="button button-secondary" disabled={busy !== null} onClick={() => run("run", () => rfmRunAction(tenantId))} type="button"><RefreshCw size={15} /> {busy === "run" ? "Berekenen…" : "Nu berekenen"}</button>
      {confirmDisable
        ? <span className="rfm-confirm">Scores per profiel worden verwijderd. <button className="button button-danger" disabled={busy !== null} onClick={() => run("disable", () => rfmDisableAction(tenantId))} type="button">Ja, uitzetten</button><button className="button button-secondary" onClick={() => setConfirmDisable(false)} type="button">Annuleren</button></span>
        : <button className="button button-secondary" disabled={busy !== null} onClick={() => setConfirmDisable(true)} type="button"><Power size={15} /> Model uitzetten</button>}
      {error ? <p className="form-error" role="alert">{error}</p> : null}
    </div>
  );
}
