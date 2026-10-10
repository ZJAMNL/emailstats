"use server";

import { refresh } from "next/cache";
import { adminForTenant } from "@/lib/admin-access";
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
