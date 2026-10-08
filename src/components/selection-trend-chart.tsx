"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type SelectionSeries = {
  id: string;
  name: string;
  color: string;
};

type SelectionPoint = {
  date: string;
  [selectionId: string]: number | string;
};

const numberFormat = new Intl.NumberFormat("nl-NL");
const compactFormat = new Intl.NumberFormat("nl-NL", { notation: "compact", maximumFractionDigits: 1 });
const formatDate = (value: string, options: Intl.DateTimeFormatOptions) => new Date(`${value}T12:00:00Z`).toLocaleDateString("nl-NL", options);
const storageEvent = "selection-chart-hidden";

function readStorage(key: string) {
  try {
    return window.localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(storageEvent, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(storageEvent, callback);
  };
}

function useHiddenSeries(storageKey: string | undefined) {
  const [localHidden, setLocalHidden] = useState("");
  const stored = useSyncExternalStore(subscribe, () => storageKey ? readStorage(storageKey) : "", () => "");
  const raw = storageKey ? stored : localHidden;
  const hidden = useMemo(() => new Set(raw ? raw.split("|") : []), [raw]);

  function setHidden(next: Set<string>) {
    const value = [...next].join("|");
    if (!storageKey) {
      setLocalHidden(value);
      return;
    }
    try {
      window.localStorage.setItem(storageKey, value);
    } catch {
      setLocalHidden(value);
    }
    window.dispatchEvent(new Event(storageEvent));
  }

  return [hidden, setHidden] as const;
}

export function SelectionTrendChart({ data, selections, storageKey }: { data: SelectionPoint[]; selections: SelectionSeries[]; storageKey?: string }) {
  const [hidden, setHidden] = useHiddenSeries(storageKey);

  if (selections.length === 0) return <p>Selecteer een of meer Copernica-selecties om de trend te bekijken.</p>;
  if (data.length === 0) return <p>Er zijn nog geen metingen. Start een synchronisatie om het eerste meetpunt vast te leggen.</p>;

  const visibleCount = selections.filter((selection) => !hidden.has(selection.id)).length;

  function toggle(id: string) {
    const next = new Set(hidden);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setHidden(next);
  }

  return (
    <>
      <div className="selection-chart" role="img" aria-label="Ontwikkeling van profielaantallen per selectie">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 12, right: 12, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="date" tickLine={false} axisLine={false} tickFormatter={(value: string) => formatDate(value, { day: "numeric", month: "short" })} minTickGap={24} />
            <YAxis tickLine={false} axisLine={false} width={56} tickFormatter={(value: number) => compactFormat.format(value)} />
            <Tooltip labelFormatter={(value) => formatDate(String(value), { weekday: "short", day: "numeric", month: "long", year: "numeric" })} formatter={(value) => numberFormat.format(Number(value))} />
            {selections.map((selection) => (
              <Line key={selection.id} type="monotone" dataKey={selection.id} name={selection.name} stroke={selection.color} strokeWidth={2} dot={data.length < 8 ? { r: 3 } : false} connectNulls hide={hidden.has(selection.id)} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      {selections.length > 1 ? <>
        <div className="chart-legend" role="group" aria-label="Lijnen in de grafiek tonen of verbergen">
          {selections.map((selection) => (
            <button aria-pressed={!hidden.has(selection.id)} className="chart-legend-item" key={selection.id} onClick={() => toggle(selection.id)} type="button">
              <span className="chart-legend-swatch" style={{ color: selection.color, background: selection.color }} />{selection.name}
            </button>
          ))}
        </div>
        <div className="chart-legend-actions">
          {visibleCount < selections.length ? <button onClick={() => setHidden(new Set())} type="button">Alles tonen</button> : null}
          {visibleCount > 0 ? <button onClick={() => setHidden(new Set(selections.map((selection) => selection.id)))} type="button">Alles verbergen</button> : null}
        </div>
      </> : null}
    </>
  );
}
