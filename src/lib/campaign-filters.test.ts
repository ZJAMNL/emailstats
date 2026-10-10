import { describe, expect, it } from "vitest";
import { campaignFilterQuery, campaignOrderBy, campaignWhere, parseCampaignFilters } from "./campaign-filters";

describe("campaign filters", () => {
  it("reads the URL and falls back to safe defaults", () => {
    expect(parseCampaignFilters({})).toEqual({ q: "", status: "alle", periode: "alle", sort: "nieuwste", pagina: 1 });
    expect(parseCampaignFilters({ q: "  test ", status: "verborgen", periode: "3m", sort: "naam", pagina: "4" })).toEqual({ q: "test", status: "verborgen", periode: "3m", sort: "naam", pagina: 4 });
    expect(parseCampaignFilters({ status: "drop table", sort: "x", pagina: "-2" })).toMatchObject({ status: "alle", sort: "nieuwste", pagina: 1 });
  });

  it("writes only non-default filters back to the URL", () => {
    const filters = parseCampaignFilters({ q: "nieuwsbrief", status: "getoond" });
    expect(campaignFilterQuery(filters)).toBe("?q=nieuwsbrief&status=getoond");
    expect(campaignFilterQuery(filters, { pagina: 2 })).toBe("?q=nieuwsbrief&status=getoond&pagina=2");
    expect(campaignFilterQuery(parseCampaignFilters({}))).toBe("");
  });

  it("builds the database filter from the same choices the customer sees", () => {
    const now = new Date("2026-10-10T12:00:00Z");
    expect(campaignWhere("t1", { q: "test", status: "verborgen", periode: "alle" }, now)).toEqual({ tenantId: "t1", name: { contains: "test", mode: "insensitive" }, included: false });
    expect(campaignWhere("t1", { q: "", status: "alle", periode: "3m" }, now)).toEqual({ tenantId: "t1", sentAt: { gte: new Date("2026-07-10T12:00:00Z") } });
    // Campaigns without a send date count as old, so they can still be found.
    expect(campaignWhere("t1", { q: "", status: "alle", periode: "ouder" }, now)).toEqual({ tenantId: "t1", OR: [{ sentAt: { lt: new Date("2025-10-10T12:00:00Z") } }, { sentAt: null }] });
  });

  it("sorts with a stable tie-breaker so pages never overlap", () => {
    for (const sort of ["nieuwste", "oudste", "naam", "ontvangers"] as const) expect(campaignOrderBy(sort).at(-1)).toEqual({ id: "asc" });
  });
});
