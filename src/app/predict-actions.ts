"use server";

import { refresh } from "next/cache";
import { adminForTenant } from "@/lib/admin-access";
import { CopernicaError } from "@/lib/copernica";
import { forecastScopes } from "@/lib/predict/orders-plan";
import { createForecastCollection, writeForecastOrders, type ForecastWriteSummary } from "@/lib/predict/orders-writer";
import { getPrismaClient } from "@/lib/prisma";
import { runPredictions } from "@/lib/predict/run";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

const noAccess = { ok: false as const, error: "Je hebt geen toegang tot deze klant." };

export type PredictionSetupInput = {
  lineCollectionId: string;
  lineCollectionName: string;
  lineOrderField: string;
  orderKeyField: string;
  lineProductField: string;
  lineNameField: string;
  lineCategoryField: string;
  webCollectionId: string;
  webCollectionName: string;
  webDateField: string;
  webProductField: string;
  webCategoryField: string;
  webEventField: string;
};

function validate(input: PredictionSetupInput) {
  const text = (value: unknown, max = 200) => (typeof value === "string" ? value.trim().slice(0, max) : "");
  const optional = (value: unknown) => text(value) || null;
  const config = {
    lineCollectionId: text(input?.lineCollectionId, 40),
    lineCollectionName: text(input?.lineCollectionName),
    lineOrderField: text(input?.lineOrderField),
    orderKeyField: text(input?.orderKeyField),
    lineProductField: text(input?.lineProductField),
    lineNameField: optional(input?.lineNameField),
    lineCategoryField: optional(input?.lineCategoryField),
    webCollectionId: optional(text(input?.webCollectionId, 40)),
    webCollectionName: optional(input?.webCollectionName),
    webDateField: optional(input?.webDateField),
    webProductField: optional(input?.webProductField),
    webCategoryField: optional(input?.webCategoryField),
    webEventField: optional(input?.webEventField),
  };
  if (!config.lineCollectionId || !config.lineOrderField || !config.lineProductField) return null;
  if (config.webCollectionId && !config.webDateField) return null;
  return config;
}

/** Saves the mapping and runs the models straight away, so the report is there when the page reloads. */
export async function savePredictionConfigAction(tenantId: string, input: PredictionSetupInput): Promise<Result<null>> {
  if (!(await adminForTenant(tenantId))) return noAccess;
  const config = validate(input);
  if (!config) return { ok: false, error: "Kies de orderregels-collectie met order- en productveld, en bij webtracking ook het datumveld." };
  const prisma = getPrismaClient();
  if (!(await prisma.rfmConfig.findUnique({ where: { tenantId }, select: { tenantId: true } }))) return { ok: false, error: "Stel eerst het RFM-model in: daar staat de koppeling met de orders." };
  await prisma.predictionConfig.upsert({ where: { tenantId }, create: { tenantId, ...config, enabled: true }, update: { ...config, enabled: true } });
  return runAction(tenantId);
}

export async function runPredictionsAction(tenantId: string): Promise<Result<null>> {
  if (!(await adminForTenant(tenantId))) return noAccess;
  return runAction(tenantId);
}

async function runAction(tenantId: string): Promise<Result<null>> {
  try {
    await runPredictions(tenantId);
  } catch (error) {
    refresh();
    return { ok: false, error: error instanceof Error && error.message ? `De berekening is mislukt: ${error.message}` : "De berekening is mislukt. Controleer de koppeling en de gekozen velden." };
  }
  refresh();
  return { ok: true, data: null };
}

export async function disablePredictionsAction(tenantId: string): Promise<Result<null>> {
  if (!(await adminForTenant(tenantId))) return noAccess;
  const prisma = getPrismaClient();
  await prisma.$transaction([
    prisma.profilePrediction.deleteMany({ where: { tenantId } }),
    prisma.predictionConfig.update({ where: { tenantId }, data: { enabled: false, writeBackEnabled: false } }),
  ]);
  refresh();
  return { ok: true, data: null };
}


export async function predictionWriteBackSettingAction(tenantId: string, enabled: boolean): Promise<Result<null>> {
  if (!(await adminForTenant(tenantId))) return noAccess;
  await getPrismaClient().predictionConfig.update({ where: { tenantId }, data: { writeBackEnabled: enabled === true } });
  refresh();
  return { ok: true, data: null };
}

// ---------------------------------------------------------------- expected orders → Copernica

export type ForecastMappingInput = { collectionId: string; collectionName: string; dateField: string; skuField: string; nameField: string; categoryField: string; chanceField: string; records: number; scope: string };

/** Creates the suggested collection Verwachte_bestellingen (or completes it) and maps its fields. */
export async function createForecastCollectionAction(tenantId: string): Promise<Result<ForecastMappingInput>> {
  if (!(await adminForTenant(tenantId))) return noAccess;
  try {
    const mapping = await createForecastCollection(tenantId);
    const prisma = getPrismaClient();
    const current = await prisma.predictionConfig.findUnique({ where: { tenantId }, select: { forecastRecords: true, forecastScope: true } });
    if (!current) return { ok: false, error: "Stel eerst de voorspellingen in." };
    await prisma.predictionConfig.update({ where: { tenantId }, data: { forecastCollectionId: mapping.collectionId, forecastCollectionName: mapping.collectionName, forecastDateField: mapping.dateField, forecastSkuField: mapping.skuField, forecastNameField: mapping.nameField, forecastCategoryField: mapping.categoryField, forecastChanceField: mapping.chanceField } });
    refresh();
    return { ok: true, data: { ...mapping, records: current.forecastRecords, scope: current.forecastScope } };
  } catch (error) {
    if (error instanceof CopernicaError && (error.status === 401 || error.status === 403)) return { ok: false, error: "Copernica weigert het aanmaken: het API-token van deze klant heeft geen schrijfrechten." };
    return { ok: false, error: "De collectie kon niet worden aangemaakt. Controleer de Copernica-koppeling." };
  }
}

export async function saveForecastMappingAction(tenantId: string, input: ForecastMappingInput): Promise<Result<null>> {
  if (!(await adminForTenant(tenantId))) return noAccess;
  const text = (value: unknown, max = 200) => (typeof value === "string" ? value.trim().slice(0, max) : "");
  const collectionId = text(input?.collectionId, 40);
  const dateField = text(input?.dateField);
  const skuField = text(input?.skuField);
  if (!collectionId || !dateField || !skuField) return { ok: false, error: "Kies een collectie en de velden voor datum en SKU." };
  const optional = (value: unknown) => text(value) || null;
  const fields = [dateField, skuField, optional(input.nameField), optional(input.categoryField), optional(input.chanceField)].filter(Boolean);
  if (new Set(fields).size !== fields.length) return { ok: false, error: "Gebruik elk veld maar één keer." };
  const records = Math.min(3, Math.max(1, Math.round(Number(input.records) || 1)));
  const scope = input.scope in forecastScopes ? input.scope : "top40";
  await getPrismaClient().predictionConfig.update({
    where: { tenantId },
    data: { forecastCollectionId: collectionId, forecastCollectionName: text(input.collectionName), forecastDateField: dateField, forecastSkuField: skuField, forecastNameField: optional(input.nameField), forecastCategoryField: optional(input.categoryField), forecastChanceField: optional(input.chanceField), forecastRecords: records, forecastScope: scope },
  });
  refresh();
  return { ok: true, data: null };
}

export async function writeForecastNowAction(tenantId: string): Promise<Result<ForecastWriteSummary>> {
  if (!(await adminForTenant(tenantId))) return noAccess;
  try {
    // Leave headroom under the page's 300-second limit; the rest follows on the next run.
    const summary = await writeForecastOrders(tenantId, Date.now() + 240_000);
    refresh();
    return summary.error ? { ok: false, error: summary.error } : { ok: true, data: summary };
  } catch (error) {
    return { ok: false, error: error instanceof Error && error.message ? error.message : "Wegschrijven is mislukt. Controleer de Copernica-koppeling." };
  }
}
