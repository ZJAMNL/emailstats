-- AlterTable
ALTER TABLE "PredictionConfig" ADD COLUMN     "forecastCategoryField" TEXT,
ADD COLUMN     "forecastChanceField" TEXT,
ADD COLUMN     "forecastCollectionId" TEXT,
ADD COLUMN     "forecastCollectionName" TEXT,
ADD COLUMN     "forecastDateField" TEXT,
ADD COLUMN     "forecastNameField" TEXT,
ADD COLUMN     "forecastRecords" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "forecastScope" TEXT NOT NULL DEFAULT 'top40',
ADD COLUMN     "forecastSkuField" TEXT,
ADD COLUMN     "forecastWriteAt" TIMESTAMP(3),
ADD COLUMN     "forecastWriteSummary" JSONB;

-- AlterTable
ALTER TABLE "ProfilePrediction" ADD COLUMN     "expectedRevenue30" DOUBLE PRECISION,
ADD COLUMN     "expectedRevenue90" DOUBLE PRECISION,
ADD COLUMN     "nextOrderAt" TIMESTAMP(3),
ADD COLUMN     "orderChance" DOUBLE PRECISION,
ADD COLUMN     "predictedOrders" JSONB NOT NULL DEFAULT '[]';


-- The RFM page and the Klantinzichten page become "Inzicht" and "Voorspellen en advies".
-- Customers who saw either keep seeing the matching new part.
UPDATE "Tenant" t
SET settings = jsonb_set(
  COALESCE(t.settings, '{}'::jsonb),
  '{dashboardModules}',
  COALESCE(t.settings->'dashboardModules', '{}'::jsonb)
    || CASE WHEN EXISTS (SELECT 1 FROM "RfmConfig" r WHERE r."tenantId" = t.id AND r.enabled AND r."customerVisible") OR (t.settings->'dashboardModules'->>'insights') = 'true' THEN '{"insight": true}'::jsonb ELSE '{}'::jsonb END
    || CASE WHEN (t.settings->'dashboardModules'->>'insights') = 'true' THEN '{"forecast": true}'::jsonb ELSE '{}'::jsonb END
)
WHERE EXISTS (SELECT 1 FROM "RfmConfig" r WHERE r."tenantId" = t.id AND r.enabled AND r."customerVisible") OR (t.settings->'dashboardModules'->>'insights') = 'true';
