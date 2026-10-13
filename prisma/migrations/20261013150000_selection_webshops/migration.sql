-- AlterTable
ALTER TABLE "Webshop" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'field',
ADD COLUMN     "selectionIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

