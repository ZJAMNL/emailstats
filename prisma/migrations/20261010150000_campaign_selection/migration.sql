-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "included" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE INDEX "Campaign_tenantId_sentAt_idx" ON "Campaign"("tenantId", "sentAt");

-- CreateIndex
CREATE INDEX "Campaign_tenantId_included_sentAt_idx" ON "Campaign"("tenantId", "included", "sentAt");

