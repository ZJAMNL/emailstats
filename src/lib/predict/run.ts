import { getTenantCopernica } from "../copernica";
import { getPrismaClient } from "../prisma";
import { fetchAllOrders, fetchSubprofiles } from "../rfm/copernica-orders";
import { assemblePredictData, WEB_LOOKBACK_DAYS, type DataQuality, type PredictMapping } from "./data";
import { buildPredictions, type PredictionReport } from "./model";

const dayMs = 24 * 60 * 60 * 1000;
/** Upper limits per run; beyond these the run would not fit in one function call. */
const MAX_LINES = 1_000_000;
const MAX_EVENTS = 1_500_000;

export type PredictionRunSummary = PredictionReport & { quality: DataQuality };

type Config = NonNullable<Awaited<ReturnType<typeof loadConfigs>>>;

async function loadConfigs(tenantId: string) {
  const prisma = getPrismaClient();
  const [rfm, config] = await Promise.all([prisma.rfmConfig.findUnique({ where: { tenantId } }), prisma.predictionConfig.findUnique({ where: { tenantId } })]);
  return rfm && config ? { rfm, config } : null;
}

export function mappingFromConfig(config: Config["config"]): PredictMapping {
  return {
    lineOrderField: config.lineOrderField,
    lineProductField: config.lineProductField,
    lineNameField: config.lineNameField,
    lineCategoryField: config.lineCategoryField,
    webDateField: config.webCollectionId ? config.webDateField : null,
    webProductField: config.webProductField,
    webCategoryField: config.webCategoryField,
    webEventField: config.webEventField,
  };
}

/** Fetches orders, order lines and web tracking from Copernica and runs the models. Nothing is stored. */
export async function calculatePredictions(tenantId: string, now = new Date()): Promise<{ summary: PredictionRunSummary; predictions: ReturnType<typeof buildPredictions>["predictions"] }> {
  const configs = await loadConfigs(tenantId);
  if (!configs) throw new Error("Stel eerst het RFM-model (orders) en de koppeling voor orderregels in.");
  const { rfm, config } = configs;
  const connected = await getTenantCopernica(tenantId);
  if (!connected) throw new Error("Deze klant heeft nog geen Copernica-koppeling.");

  const mapping = mappingFromConfig(config);
  const [orders, lines, events] = await Promise.all([
    fetchAllOrders(connected.jwt, rfm.collectionId, { dateField: rfm.dateField, amountField: rfm.amountField, statusField: rfm.statusField, keyField: config.orderKeyField || null }),
    fetchSubprofiles(connected.jwt, config.lineCollectionId, { maxRows: MAX_LINES }),
    config.webCollectionId && config.webDateField
      ? fetchSubprofiles(connected.jwt, config.webCollectionId, { since: { field: config.webDateField, date: new Date(now.getTime() - WEB_LOOKBACK_DAYS * dayMs) }, maxRows: MAX_EVENTS })
      : Promise.resolve({ rows: [], total: 0, truncated: false }),
  ]);

  const { data, quality } = assemblePredictData(orders.orders, lines.rows, events.rows, mapping, { now, excludedStatuses: rfm.excludedStatuses });
  const { report, predictions } = buildPredictions(data, now);
  report.data.truncated = [...(lines.truncated ? [`orderregels (${lines.total.toLocaleString("nl-NL")}, gebruikt ${MAX_LINES.toLocaleString("nl-NL")})`] : []), ...(events.truncated ? [`webtracking (${events.total.toLocaleString("nl-NL")}, gebruikt ${MAX_EVENTS.toLocaleString("nl-NL")})`] : [])];
  return { summary: { ...report, quality }, predictions };
}

/** Runs the models with the saved configuration, stores a prediction per profile and the report. */
export async function runPredictions(tenantId: string) {
  const prisma = getPrismaClient();
  try {
    const { summary, predictions } = await calculatePredictions(tenantId);
    const rows = predictions.map((prediction) => ({
      tenantId,
      copernicaProfileId: prediction.profileId,
      isBuyer: prediction.isBuyer,
      purchaseProbability: prediction.probability,
      intentBand: prediction.band,
      favoriteCategory: prediction.favoriteCategory,
      nextCategory: prediction.nextCategory,
      recommendations: prediction.recommendations,
      recommendationNames: prediction.recommendationNames,
      recommendationCategories: prediction.recommendationCategories.map((category) => category ?? ""),
      lastVisitAt: prediction.lastVisitAt,
    }));
    await prisma.$transaction(async (transaction) => {
      await transaction.profilePrediction.deleteMany({ where: { tenantId } });
      for (let index = 0; index < rows.length; index += 5000) await transaction.profilePrediction.createMany({ data: rows.slice(index, index + 5000) });
      await transaction.predictionConfig.update({ where: { tenantId }, data: { lastRunAt: new Date(summary.ranAt), lastRunStatus: "ok", lastRunSummary: summary } });
    }, { timeout: 120_000, maxWait: 20_000 });
    return summary;
  } catch (error) {
    await prisma.predictionConfig.update({ where: { tenantId }, data: { lastRunAt: new Date(), lastRunStatus: error instanceof Error ? error.message.slice(0, 300) : "Onbekende fout" } }).catch(() => undefined);
    throw error;
  }
}
