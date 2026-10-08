"use client";

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

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

export function SelectionTrendChart({ data, selections }: { data: SelectionPoint[]; selections: SelectionSeries[] }) {
  if (selections.length === 0) return <p>Selecteer een of meer Copernica-selecties om de trend te bekijken.</p>;
  if (data.length === 0) return <p>Er zijn nog geen metingen. Start een synchronisatie om het eerste meetpunt vast te leggen.</p>;

  return (
    <div className="selection-chart" role="img" aria-label="Ontwikkeling van profielaantallen per selectie">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 12, right: 12, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="date" tickLine={false} axisLine={false} tickFormatter={(value: string) => formatDate(value, { day: "numeric", month: "short" })} minTickGap={24} />
          <YAxis tickLine={false} axisLine={false} width={56} tickFormatter={(value: number) => compactFormat.format(value)} />
          <Tooltip labelFormatter={(value) => formatDate(String(value), { weekday: "short", day: "numeric", month: "long", year: "numeric" })} formatter={(value) => numberFormat.format(Number(value))} />
          <Legend />
          {selections.map((selection) => (
            <Line key={selection.id} type="monotone" dataKey={selection.id} name={selection.name} stroke={selection.color} strokeWidth={2} dot={data.length < 8 ? { r: 3 } : false} connectNulls />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
