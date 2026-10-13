import { describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("./prisma", () => ({ getPrismaClient: vi.fn() }));

const { ALL_SCOPE, campaignMatchesWebshop, computeAllowedScopes, filterCampaigns, resolveScope, selectionsInScope, snapshotScope } = await import("./webshops");
type Webshop = import("./webshops").WebshopDefinition;

const shopA: Webshop = { id: "a", name: "Tuinmanieren", kind: "field", profileField: "Webshop", fieldValues: ["TM"], selectionIds: [], campaignTerms: ["TM", "Tuinmanieren"] };
const shopB: Webshop = { id: "b", name: "Bloemenhuis", kind: "field", profileField: "Webshop", fieldValues: ["BH"], selectionIds: [], campaignTerms: ["Bloemen"] };
const shopC: Webshop = { id: "c", name: "Macropest", kind: "selections", profileField: "", fieldValues: [], selectionIds: ["s2", "s3"], campaignTerms: ["Macropest"] };

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

describe("webshops made of selections", () => {
  it("show only their own selections, with the counts of the whole database", () => {
    const selections = [{ id: "s1" }, { id: "s2" }, { id: "s3" }];
    expect(selectionsInScope(selections, shopC).map((selection) => selection.id)).toEqual(["s2", "s3"]);
    expect(selectionsInScope(selections, shopA)).toHaveLength(3);
    expect(selectionsInScope(selections, null)).toHaveLength(3);
    expect(snapshotScope(shopC)).toBe(ALL_SCOPE);
    expect(snapshotScope(shopA)).toBe("a");
    expect(snapshotScope(null)).toBe(ALL_SCOPE);
  });
});
