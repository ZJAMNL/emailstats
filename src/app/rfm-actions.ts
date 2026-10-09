"use server";

import { refresh } from "next/cache";
import { getTenantCopernica } from "@/lib/copernica";
import { getPrismaClient } from "@/lib/prisma";
import { listCollectionFields, listCollections, sampleOrders } from "@/lib/rfm/copernica-orders";
import { calculateRfm, runRfm, type RfmModelSettings, type RfmRunSummary } from "@/lib/rfm/run";
import { adminForTenant } from "@/lib/admin-access";
import { CopernicaError } from "@/lib/copernica";
import { ensureRfmFields, writeRfmToCopernica, type WriteBackSummary } from "@/lib/rfm/writeback";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

const noAccess = { ok: false as const, error: "Je hebt geen toegang tot deze klant." };

async function withCopernica<T>(tenantId: string, callback: (jwt: string, databaseId: string) => Promise<T>): Promise<Result<T>> {
  if (!(await adminForTenant(tenantId))) return noAccess;
  try {
    const connected = await getTenantCopernica(tenantId);
    if (!connected) return { ok: false, error: "Deze klant heeft nog geen Copernica-koppeling." };
    return { ok: true, data: await callback(connected.jwt, connected.connection.databaseId) };
  } catch {
    return { ok: false, error: "Copernica gaf een fout. Controleer de koppeling en probeer het opnieuw." };
  }
}

export async function rfmCollectionsAction(tenantId: string) {
  return withCopernica(tenantId, (jwt, databaseId) => listCollections(jwt, databaseId));
}

export async function rfmCollectionDetailsAction(tenantId: string, collectionId: string) {
  return withCopernica(tenantId, async (jwt) => {
    const [fields, sample] = await Promise.all([listCollectionFields(jwt, collectionId), sampleOrders(jwt, collectionId)]);
    return { fields, sample };
  });
}

export async function rfmPreviewAction(tenantId: string, input: RfmModelSettings): Promise<Result<RfmRunSummary>> {
  if (!(await adminForTenant(tenantId))) return noAccess;
  const settings = validateSettings(input);
  if (!settings) return { ok: false, error: "Kies een collectie, een datumveld en een bedragveld." };
  try {
    const { summary } = await calculateRfm(tenantId, settings);
    return { ok: true, data: summary };
  } catch {
    return { ok: false, error: "De proefberekening is mislukt. Controleer de gekozen velden en de Copernica-koppeling." };
  }
}

export async function rfmSaveAction(tenantId: string, input: RfmModelSettings & { collectionName: string; customerVisible: boolean }): Promise<Result<null>> {
  if (!(await adminForTenant(tenantId))) return noAccess;
  const settings = validateSettings(input);
  if (!settings) return { ok: false, error: "Kies een collectie, een datumveld en een bedragveld." };
  const data = { ...settings, collectionName: String(input.collectionName ?? "").slice(0, 200), customerVisible: input.customerVisible === true, enabled: true };

  try {
    await getPrismaClient().rfmConfig.upsert({ where: { tenantId }, create: { tenantId, ...data }, update: data });
    await runRfm(tenantId);
  } catch {
    refresh();
    return { ok: false, error: "Het model is opgeslagen, maar de berekening is mislukt. Probeer ‘Nu berekenen’ opnieuw." };
  }
  refresh();
  return { ok: true, data: null };
}

export async function rfmRunAction(tenantId: string): Promise<Result<null>> {
  if (!(await adminForTenant(tenantId))) return noAccess;
  try {
    await runRfm(tenantId);
  } catch {
    refresh();
    return { ok: false, error: "De berekening is mislukt. Controleer de Copernica-koppeling en de gekozen velden." };
  }
  refresh();
  return { ok: true, data: null };
}

export async function rfmVisibilityAction(tenantId: string, customerVisible: boolean): Promise<Result<null>> {
  if (!(await adminForTenant(tenantId))) return noAccess;
  await getPrismaClient().rfmConfig.update({ where: { tenantId }, data: { customerVisible: customerVisible === true } });
  refresh();
  return { ok: true, data: null };
}

export async function rfmDisableAction(tenantId: string): Promise<Result<null>> {
  if (!(await adminForTenant(tenantId))) return noAccess;
  const prisma = getPrismaClient();
  // Profile-level scores are removed when the model is switched off; aggregated history stays.
  await prisma.$transaction([
    prisma.rfmProfileScore.deleteMany({ where: { tenantId } }),
    prisma.rfmConfig.update({ where: { tenantId }, data: { enabled: false, customerVisible: false } }),
  ]);
  refresh();
  return { ok: true, data: null };
}

function validateSettings(input: RfmModelSettings): RfmModelSettings | null {
  const text = (value: unknown, max = 200) => (typeof value === "string" ? value.trim().slice(0, max) : "");
  const collectionId = text(input?.collectionId, 40);
  const dateField = text(input?.dateField);
  const amountField = text(input?.amountField);
  if (!collectionId || !dateField || !amountField) return null;

  const thresholds = Array.isArray(input.frequencyThresholds) ? input.frequencyThresholds.map(Number).filter((value) => Number.isInteger(value) && value > 0) : [];
  const ascending = thresholds.length === 5 && thresholds.every((value, index) => index === 0 || value > thresholds[index - 1]);
  return {
    collectionId,
    dateField,
    amountField,
    statusField: text(input.statusField) || null,
    excludedStatuses: Array.isArray(input.excludedStatuses) ? input.excludedStatuses.map((status) => text(status, 80)).filter(Boolean).slice(0, 20) : [],
    windowMonths: [12, 24, 36].includes(Number(input.windowMonths)) ? Number(input.windowMonths) : 24,
    frequencyThresholds: ascending ? thresholds : [1, 2, 3, 4, 5],
    marginPercent: Math.min(100, Math.max(1, Math.round(Number(input.marginPercent) || 100))),
  };
}

// ---------------------------------------------------------------- write-back to Copernica

export async function rfmEnsureFieldsAction(tenantId: string): Promise<Result<{ created: string[]; existing: string[] }>> {
  if (!(await adminForTenant(tenantId))) return noAccess;
  try {
    const result = await ensureRfmFields(tenantId);
    refresh();
    return { ok: true, data: result };
  } catch (error) {
    if (error instanceof CopernicaError && (error.status === 401 || error.status === 403)) return { ok: false, error: "Copernica weigert het aanmaken: het API-token van deze klant heeft geen schrijfrechten." };
    return { ok: false, error: "De velden konden niet worden aangemaakt. Controleer de Copernica-koppeling." };
  }
}

export async function rfmWriteBackSettingAction(tenantId: string, enabled: boolean): Promise<Result<null>> {
  if (!(await adminForTenant(tenantId))) return noAccess;
  await getPrismaClient().rfmConfig.update({ where: { tenantId }, data: { writeBackEnabled: enabled === true } });
  refresh();
  return { ok: true, data: null };
}

export async function rfmWriteBackNowAction(tenantId: string): Promise<Result<WriteBackSummary>> {
  if (!(await adminForTenant(tenantId))) return noAccess;
  try {
    // Leave headroom under the page's 300-second limit; the rest follows on the next run.
    const summary = await writeRfmToCopernica(tenantId, Date.now() + 240_000);
    refresh();
    return summary.error ? { ok: false, error: summary.error } : { ok: true, data: summary };
  } catch {
    return { ok: false, error: "Terugschrijven is mislukt. Controleer de Copernica-koppeling." };
  }
}
