"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { updateCampaignSelectionAction } from "@/app/campaign-actions";
import type { CampaignFilters } from "@/lib/campaign-filters";

export type CampaignRow = { id: string; name: string; sentAt: string | null; sentCount: number; openRate: number | null; included: boolean };

const number = new Intl.NumberFormat("nl-NL");

/** The campaign list with selection and bulk actions; filters travel along so the page comes back the same. */
export function CampaignSelectionTable({ rows, filters, filteredCount }: { rows: CampaignRow[]; filters: CampaignFilters; filteredCount: number }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState<"show" | "hide" | null>(null);
  const allOnPage = rows.length > 0 && rows.every((row) => selected.has(row.id));
  const toggle = (id: string) => setSelected((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });

  return (
    <form action={updateCampaignSelectionAction} className="campaign-selection">
      {/* The current filters, so actions return to the same view and "all results" means exactly this list. */}
      <input name="q" type="hidden" value={filters.q} />
      <input name="status" type="hidden" value={filters.status} />
      <input name="periode" type="hidden" value={filters.periode} />
      <input name="sort" type="hidden" value={filters.sort} />
      <input name="pagina" type="hidden" value={String(filters.pagina)} />

      <div className="campaign-bulk" role="region" aria-label="Acties">
        {selected.size ? (
          <>
            <strong>{number.format(selected.size)} geselecteerd</strong>
            <button className="button button-secondary" name="action" type="submit" value="show:selected"><Eye size={15} /> Tonen</button>
            <button className="button button-secondary" name="action" type="submit" value="hide:selected"><EyeOff size={15} /> Verbergen</button>
            <button className="campaign-link-button" onClick={() => setSelected(new Set())} type="button">Selectie wissen</button>
          </>
        ) : confirm ? (
          <>
            <span>Alle <strong>{number.format(filteredCount)}</strong> campagnes in deze lijst {confirm === "hide" ? "verbergen" : "tonen"}, ook op de andere pagina’s?</span>
            <button className={`button ${confirm === "hide" ? "button-danger" : "button-primary"}`} name="action" type="submit" value={`${confirm}:filtered`}>Ja, {confirm === "hide" ? "verbergen" : "tonen"}</button>
            <button className="campaign-link-button" onClick={() => setConfirm(null)} type="button">Annuleren</button>
          </>
        ) : (
          <>
            <span className="rfm-hint">Selecteer campagnes, of pas iets toe op alle {number.format(filteredCount)} resultaten:</span>
            <button className="campaign-link-button" disabled={!filteredCount} onClick={() => setConfirm("show")} type="button">Alle tonen</button>
            <button className="campaign-link-button" disabled={!filteredCount} onClick={() => setConfirm("hide")} type="button">Alle verbergen</button>
          </>
        )}
      </div>

      <div className="table-wrap">
        <table className="campaign-table">
          <thead>
            <tr>
              <th className="campaign-check"><input aria-label="Alle campagnes op deze pagina selecteren" checked={allOnPage} onChange={() => setSelected(allOnPage ? new Set() : new Set(rows.map((row) => row.id)))} type="checkbox" /></th>
              <th>Campagne</th>
              <th>Verzonden</th>
              <th className="campaign-number">Ontvangers</th>
              <th className="campaign-number">Open rate</th>
              <th>In dashboard</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr className={row.included ? undefined : "is-hidden"} key={row.id}>
                <td className="campaign-check"><input aria-label={`${row.name} selecteren`} checked={selected.has(row.id)} name="campaignId" onChange={() => toggle(row.id)} type="checkbox" value={row.id} /></td>
                <td className="campaign-name">{row.name}</td>
                <td>{row.sentAt ? new Date(row.sentAt).toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" }) : "—"}</td>
                <td className="campaign-number">{number.format(row.sentCount)}</td>
                <td className="campaign-number">{row.openRate === null ? "—" : `${row.openRate.toLocaleString("nl-NL", { maximumFractionDigits: 1 })}%`}</td>
                <td>
                  <button aria-label={`${row.name} ${row.included ? "verbergen" : "tonen"}`} className={`campaign-status ${row.included ? "is-on" : "is-off"}`} name="action" title={row.included ? "Klik om te verbergen" : "Klik om te tonen"} type="submit" value={`${row.included ? "hide" : "show"}:${row.id}`}>
                    {row.included ? <><Eye size={13} /> Getoond</> : <><EyeOff size={13} /> Verborgen</>}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </form>
  );
}
