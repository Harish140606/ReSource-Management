-- AlterTable
ALTER TABLE "disposal_invoices" ADD COLUMN     "gross_weight_kg" DECIMAL(12,3),
ADD COLUMN     "net_weight_kg" DECIMAL(12,3),
ADD COLUMN     "tare_weight_kg" DECIMAL(12,3),
ADD COLUMN     "vehicle_no" TEXT,
ADD COLUMN     "weighment_serial_no" TEXT;
