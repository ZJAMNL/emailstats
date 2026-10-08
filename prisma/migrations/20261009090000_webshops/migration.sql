-- DropIndex
DROP INDEX "SelectionSnapshot_selectionId_measuredAt_idx";

-- DropIndex
DROP INDEX "SelectionSnapshot_selectionId_measuredAt_key";

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "allWebshops" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "SelectionSnapshot" ADD COLUMN     "scope" TEXT NOT NULL DEFAULT 'all';

-- CreateTable
CREATE TABLE "Webshop" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "profileField" TEXT NOT NULL,
    "fieldValues" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "campaignTerms" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Webshop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserWebshop" (
    "userId" TEXT NOT NULL,
    "webshopId" TEXT NOT NULL,

    CONSTRAINT "UserWebshop_pkey" PRIMARY KEY ("userId","webshopId")
);

-- CreateIndex
CREATE INDEX "Webshop_tenantId_idx" ON "Webshop"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Webshop_tenantId_name_key" ON "Webshop"("tenantId", "name");

-- CreateIndex
CREATE INDEX "UserWebshop_webshopId_idx" ON "UserWebshop"("webshopId");

-- CreateIndex
CREATE INDEX "SelectionSnapshot_selectionId_scope_measuredAt_idx" ON "SelectionSnapshot"("selectionId", "scope", "measuredAt");

-- CreateIndex
CREATE UNIQUE INDEX "SelectionSnapshot_selectionId_scope_measuredAt_key" ON "SelectionSnapshot"("selectionId", "scope", "measuredAt");

-- AddForeignKey
ALTER TABLE "Webshop" ADD CONSTRAINT "Webshop_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserWebshop" ADD CONSTRAINT "UserWebshop_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserWebshop" ADD CONSTRAINT "UserWebshop_webshopId_fkey" FOREIGN KEY ("webshopId") REFERENCES "Webshop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

