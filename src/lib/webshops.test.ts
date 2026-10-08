import { describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("./prisma", () => ({ getPrismaClient: vi.fn() }));

const { ALL_SCOPE, campaignMatchesWebshop, computeAllowedScopes, filterCampaigns, resolveScope } = await import("./webshops");

const shopA = { id: "a", name: "Tuinmanieren", profileField: "Webshop", fieldValues: ["TM"], campaignTerms: ["TM", "Tuinmanieren"] };
const shopB = { id: "b", name: "Bloemenhuis", profileField: "Webshop", fieldValues: ["BH"], campaignTerms: ["Bloemen"] };

describe("computeAllowedScopes", () => {
  it("offers only the whole database when there are no webshops", () => {
    expect(computeAllowedScopes([], { allWebshops: false, webshopIds: [] }).map((option) => option.id)).toEqual([ALL_SCOPE]);
  });

  it("gives full-access users the combined view plus every webshop", () => {
    expect(computeAllowedScopes([shopA, shopB], { allWebshops: true, webshopIds: [] }).map((option) => option.id)).toEqual([ALL_SCOPE, "a", "b"]);
  });

  it("limits restricted users to their own webshops, without the combined view", () => {
    expect(computeAllowedScopes([shopA, shopB], { allWebshops: false, webshopIds: ["b"] }).map((option) => option.id)).toEqual(["b"]);
    expect(computeAllowedScopes([shopA, shopB], { allWebshops: false, webshopIds: [] })).toEqual([]);
  });
});

describe("resolveScope", () => {
  it("falls back to the first allowed scope for unknown or forbidden choices", () => {
    const allowed = computeAllowedScopes([shopA, shopB], { allWebshops: false, webshopIds: ["b"] });
    expect(resolveScope(allowed, "a")?.id).toBe("b");
    expect(resolveScope(allowed, ALL_SCOPE)?.id).toBe("b");
    expect(resolveScope(allowed, undefined)?.id).toBe("b");
    expect(resolveScope([], "a")).toBeNull();
  });
});

describe("campaign matching", () => {
  it("matches campaign names on the webshop's terms, ignoring case", () => {
    expect(campaignMatchesWebshop({ name: "Nieuwsbrief tuinmanieren week 12" }, shopA)).toBe(true);
    expect(campaignMatchesWebshop({ name: "BLOEMEN actie" }, shopA)).toBe(false);
    expect(campaignMatchesWebshop({ name: "Anything" }, null)).toBe(true);
    expect(filterCampaigns([{ name: "TM voorjaar" }, { name: "Bloemen" }], shopB).map((campaign) => campaign.name)).toEqual(["Bloemen"]);
  });
});
