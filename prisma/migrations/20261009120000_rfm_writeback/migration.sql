-- AlterTable
ALTER TABLE "RfmConfig" ADD COLUMN     "lastWriteAt" TIMESTAMP(3),
ADD COLUMN     "lastWriteSummary" JSONB;

-- CreateTable
CREATE TABLE "RfmWriteBack" (
    "tenantId" TEXT NOT NULL,
    "copernicaProfileId" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "writtenAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RfmWriteBack_pkey" PRIMARY KEY ("tenantId","copernicaProfileId")
);

-- AddForeignKey
ALTER TABLE "RfmWriteBack" ADD CONSTRAINT "RfmWriteBack_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

