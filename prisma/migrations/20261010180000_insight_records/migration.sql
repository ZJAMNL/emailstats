-- Klantinzichten becomes one record per insight instead of one row per profile.
-- Rows written in the old format get the key 'profiel'; the writer no longer wants that key,
-- so it deletes those subprofiles in Copernica on its next run.
ALTER TABLE "InsightWriteBack" DROP CONSTRAINT "InsightWriteBack_pkey",
ADD COLUMN     "insightKey" TEXT NOT NULL DEFAULT 'profiel';

ALTER TABLE "InsightWriteBack" ALTER COLUMN "insightKey" DROP DEFAULT;

ALTER TABLE "InsightWriteBack" ADD CONSTRAINT "InsightWriteBack_pkey" PRIMARY KEY ("tenantId", "copernicaProfileId", "insightKey");

-- Category of each recommended product, for the Productaanbeveling records.
ALTER TABLE "ProfilePrediction" ADD COLUMN     "recommendationCategories" TEXT[] DEFAULT ARRAY[]::TEXT[];
