-- AlterTable
ALTER TABLE "disposal_invoices" ADD COLUMN     "empty_serial_no" TEXT,
ADD COLUMN     "empty_vehicle_no" TEXT,
ADD COLUMN     "empty_weighed_date" TEXT,
ADD COLUMN     "empty_weighed_time" TEXT,
ADD COLUMN     "empty_weight_kg" DECIMAL(12,3),
ADD COLUMN     "loaded_gross_weight_kg" DECIMAL(12,3),
ADD COLUMN     "loaded_material" TEXT,
ADD COLUMN     "loaded_net_weight_kg" DECIMAL(12,3),
ADD COLUMN     "loaded_serial_no" TEXT,
ADD COLUMN     "loaded_tare_weight_kg" DECIMAL(12,3),
ADD COLUMN     "loaded_vehicle_no" TEXT,
ADD COLUMN     "loaded_weighed_date" TEXT,
ADD COLUMN     "loaded_weighed_time" TEXT;
