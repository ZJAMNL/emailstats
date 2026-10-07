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

export function SelectionTrendChart({ data, selections }: { data: SelectionPoint[]; selections: SelectionSeries[] }) {
  if (selections.length === 0) return <p>Selecteer een of meer Copernica-selecties om de trend te bekijken.</p>;
  if (data.length === 0) return <p>Er zijn nog geen metingen. Start een synchronisatie om het eerste meetpunt vast te leggen.</p>;

  return (
    <div className="selection-chart" role="img" aria-label="Ontwikkeling van profielaantallen per selectie">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 12, right: 12, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="date" tickLine={false} axisLine={false} />
          <YAxis tickLine={false} axisLine={false} width={56} />
          <Tooltip />
          <Legend />
          {selections.map((selection) => (
            <Line key={selection.id} type="monotone" dataKey={selection.id} name={selection.name} stroke={selection.color} strokeWidth={2} dot={false} connectNulls />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
