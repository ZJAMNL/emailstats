-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'CUSTOMER');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'CUSTOMER',
    "tenantId" TEXT,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "logoDataUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "settings" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "sentCount" INTEGER NOT NULL,
    "openCount" INTEGER NOT NULL,
    "clickCount" INTEGER NOT NULL,
    "revenue" DECIMAL(18,2) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "copernicaId" TEXT NOT NULL,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CopernicaConnection" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "databaseId" TEXT NOT NULL,
    "encryptedApiToken" TEXT NOT NULL,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSyncedAt" TIMESTAMP(3),

    CONSTRAINT "CopernicaConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CopernicaSelection" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "copernicaId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CopernicaSelection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SelectionSnapshot" (
    "id" TEXT NOT NULL,
    "selectionId" TEXT NOT NULL,
    "measuredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "profileCount" INTEGER NOT NULL,

    CONSTRAINT "SelectionSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_tenantId_idx" ON "User"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");

-- CreateIndex
CREATE INDEX "Campaign_tenantId_createdAt_idx" ON "Campaign"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Campaign_tenantId_copernicaId_key" ON "Campaign"("tenantId", "copernicaId");

-- CreateIndex
CREATE UNIQUE INDEX "CopernicaConnection_tenantId_key" ON "CopernicaConnection"("tenantId");

-- CreateIndex
CREATE INDEX "CopernicaSelection_tenantId_enabled_idx" ON "CopernicaSelection"("tenantId", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "CopernicaSelection_tenantId_copernicaId_key" ON "CopernicaSelection"("tenantId", "copernicaId");

-- CreateIndex
CREATE INDEX "SelectionSnapshot_selectionId_measuredAt_idx" ON "SelectionSnapshot"("selectionId", "measuredAt");

-- CreateIndex
CREATE UNIQUE INDEX "SelectionSnapshot_selectionId_measuredAt_key" ON "SelectionSnapshot"("selectionId", "measuredAt");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CopernicaConnection" ADD CONSTRAINT "CopernicaConnection_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CopernicaSelection" ADD CONSTRAINT "CopernicaSelection_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SelectionSnapshot" ADD CONSTRAINT "SelectionSnapshot_selectionId_fkey" FOREIGN KEY ("selectionId") REFERENCES "CopernicaSelection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
