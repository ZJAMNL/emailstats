import { headers } from "next/headers";

/** Base URL for links in emails. Production never trusts request headers, so a spoofed Host cannot end up in a mail. */
export async function getAppUrl() {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  if (process.env.VERCEL_ENV === "production") return "https://dashboard.enzo.email";
  const headerStore = await headers();
  const host = headerStore.get("x-forwarded-host") ?? headerStore.get("host") ?? "dashboard.enzo.email";
  const protocol = headerStore.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${protocol}://${host}`;
}
