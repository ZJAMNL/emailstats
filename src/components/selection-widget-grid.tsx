"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { ArrowLeft, ArrowRight, GripVertical, Pencil, X } from "lucide-react";
import { reorderSelectionWidgetsAction, updateSelectionWidgetAction } from "@/app/actions";

type Tone = "up" | "down" | "flat" | "empty";

export type SelectionWidgetData = {
  id: string;
  name: string;
  copernicaName: string;
  value: string;
  delta: { text: string; tone: Tone };
  ratio: null | {
    percent: string;
    baseName: string;
    periods: { key: string; label: string; text: string; tone: Tone; active: boolean }[];
  };
  lastMeasured: string;
  baseSelectionId: string | null;
  includeInTotal: boolean;
};

const toneClass: Record<Tone, string> = {
  up: "trend-up",
  down: "trend-down",
  flat: "trend-flat",
  empty: "selection-widget-delta-empty",
};

export function SelectionWidgetGrid({ widgets }: { widgets: SelectionWidgetData[] }) {
  const [orderIds, setOrderIds] = useState(() => widgets.map((widget) => widget.id));
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragHandleId, setDragHandleId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState(false);
  const [widgetError, setWidgetError] = useState(false);
  const [isSavingWidget, setIsSavingWidget] = useState(false);
  const [, startTransition] = useTransition();
  const dialogRef = useRef<HTMLDialogElement>(null);

  const byId = new Map(widgets.map((widget) => [widget.id, widget]));
  const order = [
    ...orderIds.flatMap((id) => byId.get(id) ?? []),
    ...widgets.filter((widget) => !orderIds.includes(widget.id)),
  ];
  useEffect(() => {
    if (editingId) dialogRef.current?.showModal();
  }, [editingId]);

  function persist(next: SelectionWidgetData[]) {
    const previous = orderIds;
    const nextIds = next.map((widget) => widget.id);
    setOrderIds(nextIds);
    setSaveError(false);
    startTransition(async () => {
      try {
        await reorderSelectionWidgetsAction(nextIds);
      } catch {
        setOrderIds(previous);
        setSaveError(true);
      }
    });
  }

  function moveTo(id: string, targetIndex: number) {
    const from = order.findIndex((widget) => widget.id === id);
    const to = Math.max(0, Math.min(order.length - 1, targetIndex));
    if (from === -1 || from === to) return;
    const next = [...order];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    persist(next);
  }

  function moveBy(id: string, offset: number) {
    moveTo(id, order.findIndex((widget) => widget.id === id) + offset);
  }

  const editing = order.find((widget) => widget.id === editingId) ?? null;
  const editingIndex = editing ? order.indexOf(editing) : -1;

  return (
    <>
      {saveError ? <p className="form-error" role="alert">De nieuwe volgorde is niet opgeslagen. Probeer het opnieuw.</p> : null}
      <section className="selection-widget-grid" aria-label="Profielaantallen per selectie">
        {order.map((widget, index) => (
          <article
            className={`panel selection-widget${draggingId === widget.id ? " is-dragging" : ""}`}
            draggable={dragHandleId === widget.id}
            key={widget.id}
            onDragEnd={() => { setDraggingId(null); setDragHandleId(null); }}
            onDragOver={(event) => { if (draggingId && draggingId !== widget.id) event.preventDefault(); }}
            onDragStart={(event) => { setDraggingId(widget.id); event.dataTransfer.effectAllowed = "move"; }}
            onDrop={(event) => { event.preventDefault(); if (draggingId) moveTo(draggingId, index); }}
          >
            <div className="selection-widget-top">
              <p className="eyebrow">Copernica-selectie</p>
              <div className="selection-widget-tools">
                <button aria-label={`${widget.name} aanpassen`} className="widget-tool" onClick={() => setEditingId(widget.id)} type="button"><Pencil size={14} /></button>
                <button
                  aria-label={`${widget.name} verplaatsen. Gebruik de pijltoetsen.`}
                  className="widget-tool widget-drag-handle"
                  onKeyDown={(event) => {
                    if (event.key === "ArrowLeft" || event.key === "ArrowUp") { event.preventDefault(); moveBy(widget.id, -1); }
                    if (event.key === "ArrowRight" || event.key === "ArrowDown") { event.preventDefault(); moveBy(widget.id, 1); }
                  }}
                  onPointerDown={() => setDragHandleId(widget.id)}
                  onPointerUp={() => setDragHandleId(null)}
                  type="button"
                ><GripVertical size={15} /></button>
              </div>
            </div>
            <h2 className="selection-widget-name">{widget.name}</h2>
            <strong className="selection-widget-value">{widget.value}</strong>
            <p className={`selection-widget-delta ${toneClass[widget.delta.tone]}`}>{widget.delta.text}</p>
            {widget.ratio ? <div className="ratio-block">
              <p className="ratio-headline"><strong>{widget.ratio.percent}</strong> van {widget.ratio.baseName}</p>
              <dl className="ratio-periods" aria-label={`Verschil in procentpunten ten opzichte van ${widget.ratio.baseName}`}>
                {widget.ratio.periods.map((item) => <div className={item.active ? "is-active" : undefined} key={item.key}><dt>{item.label}</dt><dd className={item.tone === "empty" ? "" : toneClass[item.tone]}>{item.text}</dd></div>)}
              </dl>
            </div> : null}
            <small className="selection-widget-date">{widget.lastMeasured}{widget.includeInTotal ? "" : " · niet in totaal"}</small>
          </article>
        ))}
      </section>

      <dialog aria-labelledby="edit-widget-title" className="customer-dialog widget-dialog" onClose={() => { setEditingId(null); setWidgetError(false); }} ref={dialogRef}>
        {editing ? <form action={async (formData) => {
          setIsSavingWidget(true);
          setWidgetError(false);
          const result = await updateSelectionWidgetAction(formData);
          setIsSavingWidget(false);
          if (result.ok) dialogRef.current?.close();
          else setWidgetError(true);
        }} className="widget-dialog-form" key={editing.id}>
          <div className="customer-dialog-header">
            <div><p className="eyebrow">Widget aanpassen</p><h2 id="edit-widget-title">{editing.name}</h2></div>
            <button aria-label="Venster sluiten" className="icon-button" onClick={() => dialogRef.current?.close()} type="button"><X size={19} /></button>
          </div>
          <input name="selectionId" type="hidden" value={editing.id} />
          <label>Naam
            <input defaultValue={editing.name === editing.copernicaName ? "" : editing.name} maxLength={80} name="label" placeholder={editing.copernicaName} />
            <small>Copernica-naam: {editing.copernicaName}. Laat leeg om die naam te gebruiken.</small>
          </label>
          <label>Vergelijk met andere selectie
            <select defaultValue={editing.baseSelectionId ?? ""} name="baseSelectionId">
              <option value="">Geen vergelijking</option>
              {order.filter((option) => option.id !== editing.id).map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
            </select>
            <small>Toont deze selectie als percentage van de gekozen selectie, met het verschil per dag, week, maand en jaar.</small>
          </label>
          <label className="widget-dialog-check">
            <input defaultChecked={editing.includeInTotal} name="includeInTotal" type="checkbox" />
            <span>Meetellen in het totaal<small>De aantallen van deze selectie tellen mee in het totaalgetal en de grote grafiek bovenaan.</small></span>
          </label>
          <div className="widget-dialog-position">
            <span>Positie {editingIndex + 1} van {order.length}</span>
            <div>
              <button className="button button-secondary" disabled={editingIndex <= 0} onClick={() => moveBy(editing.id, -1)} type="button"><ArrowLeft size={15} /> Naar voren</button>
              <button className="button button-secondary" disabled={editingIndex >= order.length - 1} onClick={() => moveBy(editing.id, 1)} type="button">Naar achteren <ArrowRight size={15} /></button>
            </div>
          </div>
          {widgetError ? <p className="form-error" role="alert">De widget is niet opgeslagen. Probeer het opnieuw.</p> : null}
          <div className="customer-dialog-actions">
            <button className="button button-secondary" onClick={() => dialogRef.current?.close()} type="button">Annuleren</button>
            <button className="button button-primary" disabled={isSavingWidget} type="submit">{isSavingWidget ? "Opslaan…" : "Opslaan"}</button>
          </div>
        </form> : null}
      </dialog>
    </>
  );
}
