"use client";

import { useState, type ReactNode } from "react";
import { Check, LayoutGrid, List } from "lucide-react";
import { CLIENTS_LAYOUT_COOKIE, type ClientsLayout } from "@/lib/clients-layout";

function rememberLayout(layout: ClientsLayout) {
  document.cookie = `${CLIENTS_LAYOUT_COOKIE}=${layout}; path=/dashboard/admin; max-age=31536000; samesite=lax`;
}

/** The client overview as a grid of widgets or as a compact list; the choice is remembered in a cookie. */
export function ClientsView({ initialLayout, search, actions, children }: { initialLayout: ClientsLayout; search: ReactNode; actions: ReactNode; children: ReactNode }) {
  const [layout, setLayout] = useState(initialLayout);

  function choose(next: ClientsLayout) {
    setLayout(next);
    rememberLayout(next);
  }

  return (
    <>
      <section className="toolbar">
        {search}
        <div className="toolbar-actions">
          <div aria-label="Weergave" className="layout-toggle" role="group">
            {([["list", List, "Lijst"], ["grid", LayoutGrid, "Raster"]] as const).map(([value, Icon, label]) => (
              <button aria-label={`${label}weergave`} aria-pressed={layout === value} key={value} onClick={() => choose(value)} title={`${label}weergave`} type="button">
                {layout === value ? <Check size={15} /> : null}<Icon size={17} />
              </button>
            ))}
          </div>
          {actions}
        </div>
      </section>
      <section className={`client-grid${layout === "list" ? " is-list" : ""}`} aria-label="Klanten">{children}</section>
    </>
  );
}
