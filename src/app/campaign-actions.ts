"use server";

import { redirect } from "next/navigation";
import { campaignFilterQuery, campaignWhere, parseCampaignFilters } from "@/lib/campaign-filters";
import { getPrismaClient } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { saveCampaignAutoInclude } from "@/lib/tenant-settings";
import { requireTenantManager } from "@/lib/webshops";

const page = "/dashboard/customer/data/campagnes";

async function requireManager() {
  const session = await requireRole("customer");
  if (!(await requireTenantManager(session))) redirect("/dashboard/customer/data?error=not-allowed");
  return session;
}

/** Back to the same filtered list, with a short confirmation. */
function back(formData: FormData, notice: Record<string, string>) {
  const filters = parseCampaignFilters(Object.fromEntries([...formData.entries()].filter(([, value]) => typeof value === "string")) as Record<string, string>);
  const query = new URLSearchParams(campaignFilterQuery(filters).slice(1));
  for (const [key, value] of Object.entries(notice)) query.set(key, value);
  redirect(`${page}?${query}`);
}

/**
 * One form, several buttons: the pressed button's value says what to do. Selected campaigns, every
 * campaign matching the current filters (also beyond this page), or a single row.
 */
export async function updateCampaignSelectionAction(formData: FormData) {
  const session = await requireManager();
  const action = String(formData.get("action") ?? "");
  const prisma = getPrismaClient();
  const [verb, target] = action.split(":");
  const included = verb === "show";
  if (verb !== "show" && verb !== "hide") back(formData, {});

  let where;
  if (target === "filtered") {
    where = campaignWhere(session.tenantId, parseCampaignFilters(Object.fromEntries([...formData.entries()].filter(([, value]) => typeof value === "string")) as Record<string, string>));
  } else if (target === "selected") {
    const ids = formData.getAll("campaignId").filter((value): value is string => typeof value === "string").slice(0, 1000);
    if (!ids.length) back(formData, { melding: "niets-geselecteerd" });
    where = { tenantId: session.tenantId, id: { in: ids } };
  } else {
    where = { tenantId: session.tenantId, id: target ?? "" };
  }

  // Only rows that actually change are counted, so the message matches what the customer sees.
  const result = await prisma.campaign.updateMany({ where: { ...where, included: !included }, data: { included } });
  back(formData, { melding: included ? "getoond" : "verborgen", aantal: String(result.count) });
}

export async function campaignAutoIncludeAction(formData: FormData) {
  const session = await requireManager();
  await saveCampaignAutoInclude(session.tenantId, formData.get("autoInclude") === "on");
  back(formData, { melding: "instelling-opgeslagen" });
}
