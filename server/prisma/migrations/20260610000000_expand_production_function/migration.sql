-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ProductionFunction" ADD VALUE 'IE';
ALTER TYPE "ProductionFunction" ADD VALUE 'TE';
ALTER TYPE "ProductionFunction" ADD VALUE 'SMT_ENGINEERING';
ALTER TYPE "ProductionFunction" ADD VALUE 'MES';
ALTER TYPE "ProductionFunction" ADD VALUE 'WAREHOUSE';
ALTER TYPE "ProductionFunction" ADD VALUE 'MATERIAL_CONTROL';
ALTER TYPE "ProductionFunction" ADD VALUE 'PDM';
ALTER TYPE "ProductionFunction" ADD VALUE 'OIP';
ALTER TYPE "ProductionFunction" ADD VALUE 'PME';
ALTER TYPE "ProductionFunction" ADD VALUE 'SQA';
ALTER TYPE "ProductionFunction" ADD VALUE 'IREP';
ALTER TYPE "ProductionFunction" ADD VALUE 'GLOBAL_IT';
