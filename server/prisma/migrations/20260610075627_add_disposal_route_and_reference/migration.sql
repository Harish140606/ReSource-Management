-- CreateEnum
CREATE TYPE "DisposalRoute" AS ENUM ('CIRCULARITY', 'AUTHORIZED_AGENCY');

-- AlterTable
ALTER TABLE "scrap_declarations" ADD COLUMN     "disposal_route" "DisposalRoute" NOT NULL DEFAULT 'CIRCULARITY';
