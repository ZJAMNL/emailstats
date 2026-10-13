import { describe, expect, it, vi } from "vitest";

vi.mock("./prisma", () => ({ getPrismaClient: vi.fn() }));
const { groupWidgets, normalizeSelectionGroups, readSelectionGroups } = await import("./selection-groups");

describe("selection groups", () => {
  const owned = new Set(["s1", "s2", "s3", "s4"]);

  it("keeps a selection in one group, drops foreign selections and empty groups", () => {
    const groups = normalizeSelectionGroups([
      { id: "orders", name: " Orders ", selectionIds: ["s1", "s2", "other-tenant"] },
      { id: "dubbel", name: "Dubbel", selectionIds: ["s2"] },
      { id: "leeg", name: "  ", selectionIds: ["s3"] },
      { id: "shop", name: "Macropest", selectionIds: ["s3"] },
    ], owned);
    expect(groups).toEqual([{ id: "orders", name: "Orders", selectionIds: ["s1", "s2"] }, { id: "shop", name: "Macropest", selectionIds: ["s3"] }]);
  });

  it("reads only well-formed groups from the settings", () => {
    expect(readSelectionGroups({ selectionGroups: [{ id: "a", name: "A", selectionIds: ["s1", 3] }, { name: "zonder id" }] })).toEqual([{ id: "a", name: "A", selectionIds: ["s1"] }]);
    expect(readSelectionGroups(null)).toEqual([]);
  });

  it("orders widgets by group and leaves out groups with nothing in view", () => {
    const widgets = [{ id: "s4" }, { id: "s2" }, { id: "s1" }];
    const sections = groupWidgets(widgets, [{ id: "g1", name: "Orders", selectionIds: ["s1", "s2"] }, { id: "g2", name: "Andere shop", selectionIds: ["s3"] }]);
    expect(sections.map((section) => [section.group?.name ?? null, section.items.map((item) => item.id)])).toEqual([["Orders", ["s2", "s1"]], [null, ["s4"]]]);
    expect(groupWidgets(widgets, [])).toEqual([{ group: null, items: widgets }]);
  });
});
