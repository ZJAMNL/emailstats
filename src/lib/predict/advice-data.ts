import { Prisma } from "@/generated/prisma/client";
import { getPrismaClient } from "../prisma";
import { buildAudiences, intentTable, type AdviceGroup } from "./advice";
import type { PredictionRunSummary } from "./run";

/**
 * Everything the "Voorspellen en advies" page shows: the latest prediction report and the target
 * groups counted from the RFM segments and the purchase intent per profile.
 */
export async function loadForecastOverview(tenantId: string) {
  const prisma = getPrismaClient();
  const [rfmConfig, config] = await Promise.all([
    prisma.rfmConfig.findUnique({ where: { tenantId }, select: { enabled: true, writeBackEnabled: true } }),
    prisma.predictionConfig.findUnique({ where: { tenantId } }),
  ]);
  const report = config?.enabled && config.lastRunSummary ? config.lastRunSummary as unknown as PredictionRunSummary : null;
  if (!report) return null;

  const rfm = Boolean(rfmConfig?.enabled);
  const passed = (part: PredictionRunSummary["buyers"]) => part.status === "ok" && part.usable;
  const available = { rfm, buyers: passed(report.buyers), prospects: passed(report.prospects) };
  const rfmRows = rfm ? Prisma.sql`SELECT "copernicaProfileId", segment FROM "RfmProfileScore" WHERE "tenantId" = ${tenantId}` : Prisma.sql`SELECT NULL::text AS "copernicaProfileId", NULL::text AS segment WHERE false`;

  const [groups, repeat] = await Promise.all([
    prisma.$queryRaw<{ segment: string | null; isBuyer: boolean | null; intentBand: string | null; profiles: number; chance: number }[]>`
      SELECT r.segment, p."isBuyer", p."intentBand", count(*)::int AS profiles, coalesce(sum(p."orderChance"), 0)::float8 AS chance
      FROM (${rfmRows}) r
      FULL OUTER JOIN (SELECT "copernicaProfileId", "isBuyer", "intentBand", "orderChance" FROM "ProfilePrediction" WHERE "tenantId" = ${tenantId}) p ON r."copernicaProfileId" = p."copernicaProfileId"
      GROUP BY 1, 2, 3`,
    prisma.$queryRaw<{ profiles: number }[]>`
      SELECT count(*)::int AS profiles FROM "ProfilePrediction" p
      WHERE p."tenantId" = ${tenantId} AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(p."predictedOrders") AS item(value)
        WHERE item.value->>'source' = 'herhaalaankoop' AND (item.value->>'date')::timestamptz <= now() + interval '30 days')`,
  ]);
  const adviceGroups: AdviceGroup[] = groups.map((group) => ({ segment: group.segment, isBuyer: group.isBuyer, intentBand: group.intentBand, profiles: group.profiles, chance: group.chance }));
  const target = { rfmProfileFields: Boolean(rfmConfig?.writeBackEnabled), collection: config?.writeBackEnabled ? config.forecastCollectionName : null, dateField: config?.writeBackEnabled ? config.forecastDateField : null };
  return {
    report,
    available,
    intent: intentTable(adviceGroups, available),
    audiences: buildAudiences(adviceGroups, available, target, report.forecast ? repeat[0]?.profiles ?? 0 : null),
    config,
  };
}

export type ForecastOverview = NonNullable<Awaited<ReturnType<typeof loadForecastOverview>>>;
