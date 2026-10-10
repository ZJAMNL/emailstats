"use client";

import { Search } from "lucide-react";
import { campaignPeriods, campaignSorts, type CampaignFilters } from "@/lib/campaign-filters";

/** Search, period and sort. Selects apply at once; the search applies on Enter. Plain GET, so the URL holds the view. */
export function CampaignFiltersForm({ filters }: { filters: CampaignFilters }) {
  const submit = (event: React.ChangeEvent<HTMLSelectElement>) => event.currentTarget.form?.requestSubmit();
  return (
    <form action="/dashboard/customer/data/campagnes" className="campaign-filters" role="search">
      <input name="status" type="hidden" value={filters.status} />
      <label className="search-box campaign-search"><Search size={16} /><input aria-label="Zoek op campagnenaam" defaultValue={filters.q} name="q" placeholder="Zoek op naam, bijv. ‘test’ of ‘nieuwsbrief’" type="search" /></label>
      <select aria-label="Periode" defaultValue={filters.periode} name="periode" onChange={submit}>
        {Object.entries(campaignPeriods).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
      <select aria-label="Sorteren" defaultValue={filters.sort} name="sort" onChange={submit}>
        {Object.entries(campaignSorts).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
      <button className="button button-secondary" type="submit">Zoeken</button>
    </form>
  );
}
