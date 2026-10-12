"use client";

import { Check, LayoutGrid, List } from "lucide-react";
import type { ViewLayout } from "@/lib/view-layout";

export function rememberLayout(cookie: string, path: string, layout: ViewLayout) {
  document.cookie = `${cookie}=${layout}; path=${path}; max-age=31536000; samesite=lax`;
}

/** Switch between a list and a grid of widgets. */
export function LayoutToggle({ layout, onChange }: { layout: ViewLayout; onChange: (layout: ViewLayout) => void }) {
  return (
    <div aria-label="Weergave" className="layout-toggle" role="group">
      {([["list", List, "Lijst"], ["grid", LayoutGrid, "Raster"]] as const).map(([value, Icon, label]) => (
        <button aria-label={`${label}weergave`} aria-pressed={layout === value} key={value} onClick={() => onChange(value)} title={`${label}weergave`} type="button">
          {layout === value ? <Check size={15} /> : null}<Icon size={17} />
        </button>
      ))}
    </div>
  );
}
