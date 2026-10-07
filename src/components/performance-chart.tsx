"use client";

import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const data = [
  { name: "Jan", delivered: 42000, opens: 18000 },
  { name: "Feb", delivered: 52000, opens: 22200 },
  { name: "Mrt", delivered: 61000, opens: 27400 },
  { name: "Apr", delivered: 69000, opens: 31100 },
  { name: "Mei", delivered: 82000, opens: 35800 },
  { name: "Jun", delivered: 98000, opens: 44100 },
];

export function PerformanceChart() {
  return (
    <section className="panel chart-panel">
      <div className="panel-heading">
        <div><p className="eyebrow">Prestatie</p><h2>Verzonden en geopend</h2></div>
        <span className="tab">Laatste 6 maanden</span>
      </div>
      <div className="chart-wrap">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 20, right: 12, left: -20, bottom: 0 }}>
            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: "#8a8f9c", fontSize: 12 }} />
            <YAxis axisLine={false} tickLine={false} tick={{ fill: "#8a8f9c", fontSize: 12 }} />
            <Tooltip contentStyle={{ borderRadius: 14, border: "1px solid #e5e7eb", background: "#0b1020", color: "white" }} />
            <Line type="monotone" dataKey="delivered" stroke="#7c6df2" strokeWidth={3} dot={false} />
            <Line type="monotone" dataKey="opens" stroke="#4cc9a7" strokeWidth={3} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
