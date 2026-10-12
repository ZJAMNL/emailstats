export type ClientsLayout = "grid" | "list";
/** Remembers whether the admin views the client overview as a grid or as a list. */
export const CLIENTS_LAYOUT_COOKIE = "clients-layout";

export function readClientsLayout(value: string | undefined): ClientsLayout {
  return value === "list" ? "list" : "grid";
}
