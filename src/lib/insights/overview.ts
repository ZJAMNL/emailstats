import { Prisma } from "@/generated/prisma/client";
import { getPrismaClient } from "../prisma";
import type { PredictionRunSummary } from "../predict/run";
import { summarizeInsights, type InsightGroup } from "./summary";
import type { InsightWriteSummary } from "./writer";

/** What a profile needs to count as having a prediction (same rule as the Klantinzichten writer). */
const hasPrediction = Prisma.sql`("purchaseProbability" IS NOT NULL OR cardinality(recommendations) > 0 OR "favoriteCategory" IS NOT NULL)`;

/**
 * The figures behind the Klantinzichten page: the same RFM values and predictions that go into the
 * Copernica collection, aggregated. RFM counts when the model is on, predictions when theirs is.
 */
export async function loadInsightsOverview(tenantId: string) {
  const prisma = getPrismaClient();
  const [rfmConfig, predictionConfig] = await Promise.all([
    prisma.rfmConfig.findUnique({ where: { tenantId }, select: { enabled: true, lastRunAt: true, insightsWriteAt: true, insightsWriteSummary: true } }),
    prisma.predictionConfig.findUnique({ where: { tenantId }, select: { enabled: true, lastRunAt: true, lastRunSummary: true } }),
  ]);
  const rfm = Boolean(rfmConfig?.enabled);
  const ai = Boolean(predictionConfig?.enabled && predictionConfig.lastRunSummary);
  if (!rfm && !ai) return null;

  const rfmRows = rfm ? Prisma.sql`SELECT "copernicaProfileId", segment, "predictedClv" FROM "RfmProfileScore" WHERE "tenantId" = ${tenantId}` : Prisma.sql`SELECT NULL::text AS "copernicaProfileId", NULL::text AS segment, NULL::numeric AS "predictedClv" WHERE false`;
  const aiRows = ai ? Prisma.sql`SELECT "copernicaProfileId", "isBuyer", "intentBand", "purchaseProbability" FROM "ProfilePrediction" WHERE "tenantId" = ${tenantId} AND ${hasPrediction}` : Prisma.sql`SELECT NULL::text AS "copernicaProfileId", NULL::boolean AS "isBuyer", NULL::text AS "intentBand", NULL::float8 AS "purchaseProbability" WHERE false`;

  const [groups, favorite, next, recommended] = await Promise.all([
    prisma.$queryRaw<{ segment: string | null; isBuyer: boolean | null; intentBand: string | null; profiles: number; clv: number; expected: number }[]>`
      SELECT r.segment, p."isBuyer", p."intentBand", count(*)::int AS profiles,
             coalesce(sum(r."predictedClv"), 0)::float8 AS clv, coalesce(sum(p."purchaseProbability"), 0)::float8 AS expected
      FROM (${rfmRows}) r FULL OUTER JOIN (${aiRows}) p ON r."copernicaProfileId" = p."copernicaProfileId"
      GROUP BY 1, 2, 3`,
    ai ? prisma.$queryRaw<{ category: string; profiles: number }[]>`
      SELECT "favoriteCategory" AS category, count(*)::int AS profiles FROM "ProfilePrediction"
      WHERE "tenantId" = ${tenantId} AND "favoriteCategory" IS NOT NULL GROUP BY 1 ORDER BY 2 DESC LIMIT 8` : [],
    ai ? prisma.$queryRaw<{ category: string; profiles: number }[]>`
      SELECT "nextCategory" AS category, count(*)::int AS profiles FROM "ProfilePrediction"
      WHERE "tenantId" = ${tenantId} AND "nextCategory" IS NOT NULL GROUP BY 1 ORDER BY 2 DESC LIMIT 8` : [],
    ai ? prisma.$queryRaw<{ id: string; name: string | null; profiles: number; first: number }[]>`
      SELECT rec.id, max(rec.name) AS name, count(*)::int AS profiles, count(*) FILTER (WHERE rec.position = 1)::int AS first
      FROM "ProfilePrediction" p, unnest(p.recommendations, p."recommendationNames") WITH ORDINALITY AS rec(id, name, position)
      WHERE p."tenantId" = ${tenantId} AND rec.id IS NOT NULL GROUP BY rec.id ORDER BY 3 DESC LIMIT 10` : [],
  ]);

  const report = predictionConfig?.lastRunSummary as unknown as PredictionRunSummary | null;
  const passed = (part: PredictionRunSummary["buyers"] | undefined) => Boolean(ai && part?.status === "ok" && part.usable);
  const available = { rfm, ai, buyers: passed(report?.buyers), prospects: passed(report?.prospects) };
  const summary = summarizeInsights(groups.map((group): InsightGroup => ({ segment: group.segment, isBuyer: group.isBuyer, intentBand: group.intentBand, profiles: group.profiles, clv: group.clv, expectedPurchases: group.expected })), available);
  return {
    ...summary,
    available,
    favoriteCategories: favorite,
    nextCategories: next,
    recommendedProducts: recommended,
    models: {
      rfmAt: rfm ? rfmConfig?.lastRunAt ?? null : null,
      predictionsAt: ai ? predictionConfig?.lastRunAt ?? null : null,
      buyersVerdict: available.buyers && report?.buyers.status === "ok" ? report.buyers.verdict : null,
      prospectsVerdict: available.prospects && report?.prospects.status === "ok" ? report.prospects.verdict : null,
    },
    copernica: { writtenAt: rfmConfig?.insightsWriteAt ?? null, lastWrite: rfmConfig?.insightsWriteSummary as unknown as InsightWriteSummary | null },
  };
}

export type InsightsOverview = NonNullable<Awaited<ReturnType<typeof loadInsightsOverview>>>;
