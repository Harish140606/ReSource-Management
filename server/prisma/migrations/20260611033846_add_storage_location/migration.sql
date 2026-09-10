-- CreateEnum
CREATE TYPE "StorageLocation" AS ENUM ('GENERAL_SCRAP_YARD', 'HAZARDOUS_WASTE_STORAGE', 'EWASTE_STORAGE', 'PLASTICS_STORAGE', 'METALS_STORAGE');

-- AlterTable
ALTER TABLE "declaration_line_items" ADD COLUMN     "storage_location" "StorageLocation";
