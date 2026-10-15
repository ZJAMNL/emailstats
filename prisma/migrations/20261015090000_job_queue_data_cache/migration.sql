-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "steps" TEXT[],
    "stepIndex" INTEGER NOT NULL DEFAULT 0,
    "cursor" JSONB,
    "params" JSONB,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "progress" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "requestedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "heartbeatAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataCache" (
    "tenantId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "mappingHash" TEXT NOT NULL,
    "maxSubprofileId" BIGINT NOT NULL DEFAULT 0,
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "generation" INTEGER NOT NULL DEFAULT 0,
    "fullRefreshAt" TIMESTAMP(3),
    "incrementalAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DataCache_pkey" PRIMARY KEY ("tenantId","kind")
);

-- CreateTable
CREATE TABLE "CachedOrder" (
    "tenantId" TEXT NOT NULL,
    "subprofileId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "orderKey" TEXT,
    "date" TIMESTAMP(3),
    "amount" DOUBLE PRECISION,
    "status" TEXT,
    "generation" INTEGER NOT NULL,

    CONSTRAINT "CachedOrder_pkey" PRIMARY KEY ("tenantId","subprofileId")
);

-- CreateTable
CREATE TABLE "CachedLine" (
    "tenantId" TEXT NOT NULL,
    "subprofileId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "orderKey" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productName" TEXT,
    "category" TEXT,
    "generation" INTEGER NOT NULL,

    CONSTRAINT "CachedLine_pkey" PRIMARY KEY ("tenantId","subprofileId")
);

-- CreateTable
CREATE TABLE "CachedEvent" (
    "tenantId" TEXT NOT NULL,
    "subprofileId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "productId" TEXT,
    "category" TEXT,
    "eventType" TEXT,
    "generation" INTEGER NOT NULL,

    CONSTRAINT "CachedEvent_pkey" PRIMARY KEY ("tenantId","subprofileId")
);

-- CreateIndex
CREATE INDEX "Job_status_createdAt_idx" ON "Job"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Job_tenantId_createdAt_idx" ON "Job"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "CachedEvent_tenantId_date_idx" ON "CachedEvent"("tenantId", "date");

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataCache" ADD CONSTRAINT "DataCache_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CachedOrder" ADD CONSTRAINT "CachedOrder_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CachedLine" ADD CONSTRAINT "CachedLine_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CachedEvent" ADD CONSTRAINT "CachedEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

