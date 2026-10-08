"use client";

import { useState, useTransition } from "react";
import { FileUp, Upload } from "lucide-react";
import { importSelectionHistoryAction, previewSelectionHistoryAction } from "@/app/actions";
import type { HistoryPreview } from "@/lib/selection-history";

const dateFormat = (value: string | null) => value ? new Date(`${value}T12:00:00Z`).toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" }) : "—";

export function SelectionHistoryImport({ tenantId, webshops = [] }: { tenantId: string; webshops?: { id: string; name: string }[] }) {
  const [csv, setCsv] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<HistoryPreview | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [follow, setFollow] = useState(true);
  const [scope, setScope] = useState("all");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function reset() {
    setCsv(null);
    setFileName("");
    setPreview(null);
    setMapping({});
    setError(null);
  }

  async function onFile(file: File | undefined) {
    reset();
    setDone(null);
    if (!file) return;
    const text = await file.text();
    setFileName(file.name);
    startTransition(async () => {
      const response = await previewSelectionHistoryAction(tenantId, text, scope);
      if (!response.ok) {
        setError(response.error);
        return;
      }
      setCsv(text);
      setPreview(response.preview);
      setMapping(Object.fromEntries(response.preview.columns.map((column) => [String(column.index), column.suggestedSelectionId ?? ""])));
    });
  }

  function runImport() {
    if (!csv) return;
    startTransition(async () => {
      const response = await importSelectionHistoryAction(tenantId, csv, mapping, follow, scope);
      if (!response.ok) {
        setError(response.error);
        return;
      }
      const { created, updated, selections } = response.result;
      reset();
      setDone(`${created.toLocaleString("nl-NL")} metingen toegevoegd en ${updated.toLocaleString("nl-NL")} bijgewerkt voor ${selections} selecties.`);
    });
  }

  const mappedColumns = preview?.columns.filter((column) => mapping[String(column.index)]) ?? [];
  const mappedSelectionIds = mappedColumns.map((column) => mapping[String(column.index)]);
  const duplicateTargets = mappedSelectionIds.filter((id, index) => mappedSelectionIds.indexOf(id) !== index);
  const snapshotCount = mappedColumns.reduce((total, column) => total + column.values, 0);
  const overwriteCount = [...new Set(mappedSelectionIds)].reduce((total, id) => total + (preview?.existingBySelection[id] ?? 0), 0);
  const selectionName = new Map(preview?.selections.map((selection) => [selection.id, selection]) ?? []);
  const unfollowed = [...new Set(mappedSelectionIds)].filter((id) => !selectionName.get(id)?.enabled).length;

  return (
    <div className="history-import">
      {done ? <p className="form-success" role="status">{done}</p> : null}
      {error ? <p className="form-error" role="alert">{error}</p> : null}

      {webshops.length && !preview ? <label className="history-scope">De cijfers gelden voor
        <select onChange={(event) => setScope(event.target.value)} value={scope}>
          <option value="all">Alle webshops (hele database)</option>
          {webshops.map((webshop) => <option key={webshop.id} value={webshop.id}>{webshop.name}</option>)}
        </select>
      </label> : null}
      {preview && webshops.length ? <p className="history-note">Importeert voor: <strong>{scope === "all" ? "Alle webshops" : webshops.find((webshop) => webshop.id === scope)?.name}</strong></p> : null}
      {!preview ? <label className="history-dropzone">
        <FileUp size={22} />
        <span><strong>{isPending ? "Bestand wordt gecontroleerd…" : "Kies een CSV-bestand"}</strong><small>Eerste kolom een datum (dd-mm-jjjj of jjjj-mm-dd), daarna één kolom per selectie. Puntkomma, komma of tab als scheidingsteken.</small></span>
        <input accept=".csv,text/csv,text/plain" disabled={isPending} onChange={(event) => { void onFile(event.target.files?.[0]); event.target.value = ""; }} type="file" />
      </label> : <>
        <div className="history-summary">
          <div><span>Bestand</span><strong>{fileName}</strong></div>
          <div><span>Periode</span><strong>{dateFormat(preview.firstDate)} – {dateFormat(preview.lastDate)}</strong></div>
          <div><span>Meetmomenten</span><strong>{preview.dateCount.toLocaleString("nl-NL")}</strong></div>
          <div><span>Te importeren metingen</span><strong>{snapshotCount.toLocaleString("nl-NL")}</strong></div>
        </div>

        {preview.errors.length ? <div className="form-error history-errors" role="alert"><strong>Deze waarden worden overgeslagen:</strong><ul>{preview.errors.map((message) => <li key={message}>{message}</li>)}</ul></div> : null}

        <div className="table-wrap">
          <table className="history-mapping">
            <thead><tr><th>Kolom in bestand</th><th>Waarden</th><th>Koppelen aan selectie</th></tr></thead>
            <tbody>
              {preview.columns.map((column) => {
                const key = String(column.index);
                return <tr key={key} className={mapping[key] ? undefined : "is-skipped"}>
                  <td>{column.header}</td>
                  <td>{column.values.toLocaleString("nl-NL")}</td>
                  <td>
                    <select aria-label={`Selectie voor ${column.header}`} onChange={(event) => setMapping((current) => ({ ...current, [key]: event.target.value }))} value={mapping[key] ?? ""}>
                      <option value="">Overslaan</option>
                      {preview.selections.map((selection) => <option key={selection.id} value={selection.id}>{selection.name}{selection.enabled ? "" : " (niet gevolgd)"}</option>)}
                    </select>
                  </td>
                </tr>;
              })}
            </tbody>
          </table>
        </div>

        {duplicateTargets.length ? <p className="form-error" role="alert">Twee kolommen zijn aan dezelfde selectie gekoppeld. Kies per selectie één kolom.</p> : null}
        {overwriteCount ? <p className="history-note">{overwriteCount.toLocaleString("nl-NL")} bestaande metingen op dezelfde datums worden overschreven met de waarden uit dit bestand.</p> : null}
        {unfollowed ? <label className="history-follow"><input checked={follow} onChange={(event) => setFollow(event.target.checked)} type="checkbox" /> {unfollowed} gekoppelde {unfollowed === 1 ? "selectie wordt" : "selecties worden"} nog niet gevolgd. Ook volgen op het klantdashboard.</label> : null}

        <div className="customer-dialog-actions">
          <button className="button button-secondary" disabled={isPending} onClick={reset} type="button">Annuleren</button>
          <button className="button button-primary" disabled={isPending || !snapshotCount || duplicateTargets.length > 0} onClick={runImport} type="button"><Upload size={15} /> {isPending ? "Bezig met importeren…" : `${snapshotCount.toLocaleString("nl-NL")} metingen importeren`}</button>
        </div>
      </>}
    </div>
  );
}
