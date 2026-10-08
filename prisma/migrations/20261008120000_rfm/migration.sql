-- CreateTable
CREATE TABLE "RfmConfig" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "collectionName" TEXT NOT NULL,
    "dateField" TEXT NOT NULL,
    "amountField" TEXT NOT NULL,
    "statusField" TEXT,
    "excludedStatuses" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "windowMonths" INTEGER NOT NULL DEFAULT 24,
    "frequencyThresholds" INTEGER[] DEFAULT ARRAY[1, 2, 3, 4, 5]::INTEGER[],
    "marginPercent" INTEGER NOT NULL DEFAULT 100,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "customerVisible" BOOLEAN NOT NULL DEFAULT false,
    "writeBackEnabled" BOOLEAN NOT NULL DEFAULT false,
    "lastRunAt" TIMESTAMP(3),
    "lastRunStatus" TEXT,
    "lastRunSummary" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RfmConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RfmProfileScore" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "copernicaProfileId" TEXT NOT NULL,
    "lastOrderAt" TIMESTAMP(3) NOT NULL,
    "orderCount" INTEGER NOT NULL,
    "revenue" DECIMAL(18,2) NOT NULL,
    "r" INTEGER NOT NULL,
    "f" INTEGER NOT NULL,
    "m" INTEGER NOT NULL,
    "segment" TEXT NOT NULL,
    "previousSegment" TEXT,
    "monthStartSegment" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RfmProfileScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RfmSegmentSnapshot" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "measuredAt" TIMESTAMP(3) NOT NULL,
    "segment" TEXT NOT NULL,
    "customers" INTEGER NOT NULL,
    "orders" INTEGER NOT NULL,
    "revenue" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "RfmSegmentSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RfmConfig_tenantId_key" ON "RfmConfig"("tenantId");

-- CreateIndex
CREATE INDEX "RfmProfileScore_tenantId_segment_idx" ON "RfmProfileScore"("tenantId", "segment");

-- CreateIndex
CREATE UNIQUE INDEX "RfmProfileScore_tenantId_copernicaProfileId_key" ON "RfmProfileScore"("tenantId", "copernicaProfileId");

-- CreateIndex
CREATE INDEX "RfmSegmentSnapshot_tenantId_measuredAt_idx" ON "RfmSegmentSnapshot"("tenantId", "measuredAt");

-- CreateIndex
CREATE UNIQUE INDEX "RfmSegmentSnapshot_tenantId_measuredAt_segment_key" ON "RfmSegmentSnapshot"("tenantId", "measuredAt", "segment");

-- AddForeignKey
ALTER TABLE "RfmConfig" ADD CONSTRAINT "RfmConfig_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RfmProfileScore" ADD CONSTRAINT "RfmProfileScore_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RfmSegmentSnapshot" ADD CONSTRAINT "RfmSegmentSnapshot_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

