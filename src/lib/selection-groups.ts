/** Groups of selections: pure helpers, safe to use in the browser as well. */

/** A named set of followed selections, shown under its own heading on the dashboard. */
export type SelectionGroup = { id: string; name: string; selectionIds: string[] };

const maxGroups = 30;

export function readSelectionGroups(value: unknown): SelectionGroup[] {
  const groups = asRecord(value).selectionGroups;
  if (!Array.isArray(groups)) return [];
  return groups.flatMap((group) => {
    const record = asRecord(group);
    const ids = Array.isArray(record.selectionIds) ? record.selectionIds.filter((id): id is string => typeof id === "string") : [];
    return typeof record.id === "string" && typeof record.name === "string" ? [{ id: record.id, name: record.name, selectionIds: ids }] : [];
  });
}

/**
 * Cleans groups before saving: a name, only this customer's selections, each selection in one group
 * at most (the first group wins), and no empty groups.
 */
export function normalizeSelectionGroups(groups: SelectionGroup[], ownedIds: Set<string>): SelectionGroup[] {
  const used = new Set<string>();
  const result: SelectionGroup[] = [];
  for (const group of Array.isArray(groups) ? groups.slice(0, maxGroups) : []) {
    const name = String(group?.name ?? "").trim().slice(0, 60);
    const id = /^[a-z0-9-]{1,40}$/i.test(String(group?.id ?? "")) ? String(group.id) : crypto.randomUUID();
    const selectionIds = (Array.isArray(group?.selectionIds) ? group.selectionIds : []).filter((selectionId) => typeof selectionId === "string" && ownedIds.has(selectionId) && !used.has(selectionId));
    if (!name || !selectionIds.length) continue;
    selectionIds.forEach((selectionId) => used.add(selectionId));
    result.push({ id, name, selectionIds });
  }
  return result;
}

/**
 * Widgets per group, in the groups' order; widgets outside any group come last. Groups without a widget in
 * view (for instance in another webshop) are left out, so a group shows only where its selections do.
 */
export function groupWidgets<T extends { id: string }>(widgets: T[], groups: SelectionGroup[]) {
  if (!groups.length) return [{ group: null, items: widgets }];
  const groupOf = new Map(groups.flatMap((group) => group.selectionIds.map((id) => [id, group.id] as const)));
  const sections = groups.map((group) => ({ group: group as SelectionGroup | null, items: widgets.filter((widget) => groupOf.get(widget.id) === group.id) }));
  sections.push({ group: null, items: widgets.filter((widget) => !groupOf.has(widget.id)) });
  return sections.filter((section) => section.items.length);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
