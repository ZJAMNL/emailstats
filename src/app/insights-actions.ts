"use server";

import { refresh } from "next/cache";
import { adminForTenant } from "@/lib/admin-access";
import { CopernicaError } from "@/lib/copernica";
import { clearLegacyRfmProfileFields, ensureInsightsCollection, writeInsightsToCopernica, type InsightWriteSummary } from "@/lib/insights/writer";
import { getPrismaClient } from "@/lib/prisma";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

const noAccess = { ok: false as const, error: "Je hebt geen toegang tot deze klant." };

export async function ensureInsightsCollectionAction(tenantId: string): Promise<Result<{ createdCollection: boolean; createdFields: string[]; removedFields: string[] }>> {
  if (!(await adminForTenant(tenantId))) return noAccess;
  try {
    const result = await ensureInsightsCollection(tenantId);
    refresh();
    return { ok: true, data: result };
  } catch (error) {
    if (error instanceof CopernicaError && (error.status === 401 || error.status === 403)) return { ok: false, error: "Copernica weigert het aanmaken: het API-token van deze klant heeft geen schrijfrechten." };
    return { ok: false, error: "De collectie kon niet worden aangemaakt. Controleer de Copernica-koppeling." };
  }
}

export async function writeInsightsNowAction(tenantId: string): Promise<Result<InsightWriteSummary>> {
  if (!(await adminForTenant(tenantId))) return noAccess;
  try {
    // Leave headroom under the page's 300-second limit; the rest follows on the next run.
    const summary = await writeInsightsToCopernica(tenantId, Date.now() + 240_000);
    refresh();
    return summary.error ? { ok: false, error: summary.error } : { ok: true, data: summary };
  } catch (error) {
    return { ok: false, error: error instanceof Error && error.message ? error.message : "Terugschrijven is mislukt. Controleer de Copernica-koppeling." };
  }
}

/**
 * Switches the old RFM_ profile fields on or off. Switching off ends the transition: the fields are
 * emptied right away as far as time allows, and the nightly run finishes the rest.
 */
export async function rfmProfileFieldsAction(tenantId: string, enabled: boolean): Promise<Result<{ cleared: number; remaining: number }>> {
  if (!(await adminForTenant(tenantId))) return noAccess;
  await getPrismaClient().rfmConfig.update({ where: { tenantId }, data: { profileFieldsEnabled: enabled === true } });
  if (enabled === true) {
    refresh();
    return { ok: true, data: { cleared: 0, remaining: 0 } };
  }
  try {
    const result = await clearLegacyRfmProfileFields(tenantId, Date.now() + 240_000);
    refresh();
    return { ok: true, data: { cleared: result.cleared, remaining: result.remaining } };
  } catch {
    refresh();
    return { ok: false, error: "De oude profielvelden konden nog niet worden leeggemaakt; de nachtelijke run probeert het opnieuw." };
  }
}
