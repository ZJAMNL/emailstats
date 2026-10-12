"use client";

import { useState, type ReactNode } from "react";
import { LayoutToggle, rememberLayout } from "@/components/layout-toggle";
import { CLIENTS_LAYOUT_COOKIE, type ViewLayout } from "@/lib/view-layout";

/** The client overview as a grid of widgets or as a compact list; the choice is remembered in a cookie. */
export function ClientsView({ initialLayout, search, actions, children }: { initialLayout: ViewLayout; search: ReactNode; actions: ReactNode; children: ReactNode }) {
  const [layout, setLayout] = useState(initialLayout);

  function choose(next: ViewLayout) {
    setLayout(next);
    rememberLayout(CLIENTS_LAYOUT_COOKIE, "/dashboard/admin", next);
  }

  return (
    <>
      <section className="toolbar">
        {search}
        <div className="toolbar-actions">
          <LayoutToggle layout={layout} onChange={choose} />
          {actions}
        </div>
      </section>
      <section className={`client-grid${layout === "list" ? " is-list" : ""}`} aria-label="Klanten">{children}</section>
    </>
  );
}
