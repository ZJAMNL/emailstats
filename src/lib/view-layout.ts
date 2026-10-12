export type ViewLayout = "grid" | "list";
/** Remember per overview whether it is shown as a grid of widgets or as a compact list. */
export const CLIENTS_LAYOUT_COOKIE = "clients-layout";
export const SELECTIONS_LAYOUT_COOKIE = "selections-layout";

export function readViewLayout(value: string | undefined): ViewLayout {
  return value === "list" ? "list" : "grid";
}
