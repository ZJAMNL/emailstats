-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "bounceCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "complaintCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "unsubscribeCount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "AlertSettings" (
    "tenantId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "recipients" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "rules" JSONB NOT NULL DEFAULT '{}',
    "lastDigestAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AlertSettings_pkey" PRIMARY KEY ("tenantId")
);

-- CreateTable
CREATE TABLE "AlertEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ruleKey" TEXT NOT NULL,
    "subjectKey" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "value" DOUBLE PRECISION,
    "triggeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "AlertEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AlertEvent_tenantId_ruleKey_subjectKey_triggeredAt_idx" ON "AlertEvent"("tenantId", "ruleKey", "subjectKey", "triggeredAt");

-- CreateIndex
CREATE INDEX "AlertEvent_tenantId_triggeredAt_idx" ON "AlertEvent"("tenantId", "triggeredAt");

-- AddForeignKey
ALTER TABLE "AlertSettings" ADD CONSTRAINT "AlertSettings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertEvent" ADD CONSTRAINT "AlertEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

