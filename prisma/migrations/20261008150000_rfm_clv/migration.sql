-- AlterTable
ALTER TABLE "RfmProfileScore" ADD COLUMN     "expectedOrders" DOUBLE PRECISION,
ADD COLUMN     "predictedClv" DECIMAL(18,2),
ADD COLUMN     "probabilityAlive" DOUBLE PRECISION;

