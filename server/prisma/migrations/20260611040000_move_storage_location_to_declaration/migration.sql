-- AlterTable
ALTER TABLE "declaration_line_items" DROP COLUMN "storage_location";

-- AlterTable
ALTER TABLE "scrap_declarations" ADD COLUMN     "storage_location" "StorageLocation";
