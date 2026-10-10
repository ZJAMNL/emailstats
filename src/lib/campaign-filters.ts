/** Filters for choosing campaigns (Beheer → E-mailcampagnes). Kept in the URL, so links and the back button work. */

export const CAMPAIGN_PAGE_SIZE = 50;

export const campaignStatuses = { alle: "Alle", getoond: "Getoond", verborgen: "Verborgen" } as const;
export const campaignPeriods = { alle: "Elke periode", "3m": "Laatste 3 maanden", "12m": "Laatste 12 maanden", ouder: "Ouder dan 12 maanden" } as const;
export const campaignSorts = { nieuwste: "Nieuwste eerst", oudste: "Oudste eerst", naam: "Naam (A–Z)", ontvangers: "Meeste ontvangers" } as const;

export type CampaignFilters = {
  q: string;
  status: keyof typeof campaignStatuses;
  periode: keyof typeof campaignPeriods;
  sort: keyof typeof campaignSorts;
  pagina: number;
};

const pick = <T extends Record<string, string>>(options: T, value: unknown, fallback: keyof T): keyof T => (typeof value === "string" && value in options ? value : fallback);

export function parseCampaignFilters(params: Record<string, string | string[] | undefined>): CampaignFilters {
  const first = (key: string) => { const value = params[key]; return Array.isArray(value) ? value[0] : value; };
  const page = Number(first("pagina"));
  return {
    q: (first("q") ?? "").trim().slice(0, 100),
    status: pick(campaignStatuses, first("status"), "alle"),
    periode: pick(campaignPeriods, first("periode"), "alle"),
    sort: pick(campaignSorts, first("sort"), "nieuwste"),
    pagina: Number.isInteger(page) && page > 0 ? Math.min(page, 10_000) : 1,
  };
}

/** Query string for these filters, leaving out defaults. */
export function campaignFilterQuery(filters: CampaignFilters, patch: Partial<CampaignFilters> = {}) {
  const next = { ...filters, ...patch };
  const params = new URLSearchParams();
  if (next.q) params.set("q", next.q);
  if (next.status !== "alle") params.set("status", next.status);
  if (next.periode !== "alle") params.set("periode", next.periode);
  if (next.sort !== "nieuwste") params.set("sort", next.sort);
  if (next.pagina > 1) params.set("pagina", String(next.pagina));
  return params.size ? `?${params}` : "";
}

const monthsAgo = (now: Date, months: number) => { const date = new Date(now); date.setUTCMonth(date.getUTCMonth() - months); return date; };

/** The Prisma where clause for a customer's campaigns under these filters (pagination aside). */
export function campaignWhere(tenantId: string, filters: Pick<CampaignFilters, "q" | "status" | "periode">, now = new Date()) {
  return {
    tenantId,
    ...(filters.q ? { name: { contains: filters.q, mode: "insensitive" as const } } : {}),
    ...(filters.status === "getoond" ? { included: true } : filters.status === "verborgen" ? { included: false } : {}),
    ...(filters.periode === "3m" ? { sentAt: { gte: monthsAgo(now, 3) } }
      : filters.periode === "12m" ? { sentAt: { gte: monthsAgo(now, 12) } }
        : filters.periode === "ouder" ? { OR: [{ sentAt: { lt: monthsAgo(now, 12) } }, { sentAt: null }] } : {}),
  };
}

export function campaignOrderBy(sort: CampaignFilters["sort"]) {
  switch (sort) {
    case "oudste": return [{ sentAt: { sort: "asc" as const, nulls: "last" as const } }, { id: "asc" as const }];
    case "naam": return [{ name: "asc" as const }, { id: "asc" as const }];
    case "ontvangers": return [{ sentCount: "desc" as const }, { id: "asc" as const }];
    default: return [{ sentAt: { sort: "desc" as const, nulls: "last" as const } }, { id: "asc" as const }];
  }
}
