-- CreateTable
CREATE TABLE "PredictionOutcome" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "copernicaProfileId" TEXT NOT NULL,
    "predictedAt" TIMESTAMP(3) NOT NULL,
    "rank" INTEGER NOT NULL,
    "expectedAt" TIMESTAMP(3) NOT NULL,
    "productId" TEXT,
    "productName" TEXT,
    "category" TEXT,
    "source" TEXT NOT NULL,
    "orderChance" DOUBLE PRECISION,
    "sentToCopernica" BOOLEAN NOT NULL DEFAULT false,
    "baselineProductId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "orderedAt" TIMESTAMP(3),
    "productHit" BOOLEAN,
    "categoryHit" BOOLEAN,
    "baselineHit" BOOLEAN,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "PredictionOutcome_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PredictionOutcome_tenantId_status_idx" ON "PredictionOutcome"("tenantId", "status");

-- CreateIndex
CREATE INDEX "PredictionOutcome_tenantId_predictedAt_idx" ON "PredictionOutcome"("tenantId", "predictedAt");

-- AddForeignKey
ALTER TABLE "PredictionOutcome" ADD CONSTRAINT "PredictionOutcome_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

