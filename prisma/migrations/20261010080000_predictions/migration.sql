-- CreateTable
CREATE TABLE "PredictionConfig" (
    "tenantId" TEXT NOT NULL,
    "lineCollectionId" TEXT NOT NULL,
    "lineCollectionName" TEXT NOT NULL,
    "lineOrderField" TEXT NOT NULL,
    "orderKeyField" TEXT NOT NULL DEFAULT '',
    "lineProductField" TEXT NOT NULL,
    "lineNameField" TEXT,
    "lineCategoryField" TEXT,
    "webCollectionId" TEXT,
    "webCollectionName" TEXT,
    "webDateField" TEXT,
    "webProductField" TEXT,
    "webCategoryField" TEXT,
    "webEventField" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "writeBackEnabled" BOOLEAN NOT NULL DEFAULT false,
    "lastRunAt" TIMESTAMP(3),
    "lastRunStatus" TEXT,
    "lastRunSummary" JSONB,
    "lastWriteAt" TIMESTAMP(3),
    "lastWriteSummary" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PredictionConfig_pkey" PRIMARY KEY ("tenantId")
);

-- CreateTable
CREATE TABLE "ProfilePrediction" (
    "tenantId" TEXT NOT NULL,
    "copernicaProfileId" TEXT NOT NULL,
    "isBuyer" BOOLEAN NOT NULL,
    "purchaseProbability" DOUBLE PRECISION,
    "intentBand" TEXT,
    "favoriteCategory" TEXT,
    "nextCategory" TEXT,
    "recommendations" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProfilePrediction_pkey" PRIMARY KEY ("tenantId","copernicaProfileId")
);

-- CreateTable
CREATE TABLE "PredictionWriteBack" (
    "tenantId" TEXT NOT NULL,
    "copernicaProfileId" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "writtenAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PredictionWriteBack_pkey" PRIMARY KEY ("tenantId","copernicaProfileId")
);

-- CreateIndex
CREATE INDEX "ProfilePrediction_tenantId_intentBand_idx" ON "ProfilePrediction"("tenantId", "intentBand");

-- AddForeignKey
ALTER TABLE "PredictionConfig" ADD CONSTRAINT "PredictionConfig_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfilePrediction" ADD CONSTRAINT "ProfilePrediction_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PredictionWriteBack" ADD CONSTRAINT "PredictionWriteBack_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

