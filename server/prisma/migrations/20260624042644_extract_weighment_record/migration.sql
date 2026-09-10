/*
  Warnings:

  - You are about to drop the column `empty_serial_no` on the `disposal_invoices` table. All the data in the column will be lost.
  - You are about to drop the column `empty_vehicle_no` on the `disposal_invoices` table. All the data in the column will be lost.
  - You are about to drop the column `empty_weighed_date` on the `disposal_invoices` table. All the data in the column will be lost.
  - You are about to drop the column `empty_weighed_time` on the `disposal_invoices` table. All the data in the column will be lost.
  - You are about to drop the column `empty_weight_kg` on the `disposal_invoices` table. All the data in the column will be lost.
  - You are about to drop the column `loaded_gross_weight_kg` on the `disposal_invoices` table. All the data in the column will be lost.
  - You are about to drop the column `loaded_material` on the `disposal_invoices` table. All the data in the column will be lost.
  - You are about to drop the column `loaded_net_weight_kg` on the `disposal_invoices` table. All the data in the column will be lost.
  - You are about to drop the column `loaded_serial_no` on the `disposal_invoices` table. All the data in the column will be lost.
  - You are about to drop the column `loaded_tare_weight_kg` on the `disposal_invoices` table. All the data in the column will be lost.
  - You are about to drop the column `loaded_vehicle_no` on the `disposal_invoices` table. All the data in the column will be lost.
  - You are about to drop the column `loaded_weighed_date` on the `disposal_invoices` table. All the data in the column will be lost.
  - You are about to drop the column `loaded_weighed_time` on the `disposal_invoices` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "disposal_invoices" DROP COLUMN "empty_serial_no",
DROP COLUMN "empty_vehicle_no",
DROP COLUMN "empty_weighed_date",
DROP COLUMN "empty_weighed_time",
DROP COLUMN "empty_weight_kg",
DROP COLUMN "loaded_gross_weight_kg",
DROP COLUMN "loaded_material",
DROP COLUMN "loaded_net_weight_kg",
DROP COLUMN "loaded_serial_no",
DROP COLUMN "loaded_tare_weight_kg",
DROP COLUMN "loaded_vehicle_no",
DROP COLUMN "loaded_weighed_date",
DROP COLUMN "loaded_weighed_time";

-- CreateTable
CREATE TABLE "weighment_records" (
    "id" TEXT NOT NULL,
    "disposal_invoice_id" TEXT,
    "vehicle_no" TEXT,
    "empty_serial_no" TEXT,
    "empty_vehicle_no" TEXT,
    "empty_weighed_date" TEXT,
    "empty_weighed_time" TEXT,
    "empty_weight_kg" DECIMAL(12,3),
    "loaded_serial_no" TEXT,
    "loaded_vehicle_no" TEXT,
    "loaded_weighed_date" TEXT,
    "loaded_weighed_time" TEXT,
    "loaded_material" TEXT,
    "loaded_gross_weight_kg" DECIMAL(12,3),
    "loaded_tare_weight_kg" DECIMAL(12,3),
    "loaded_net_weight_kg" DECIMAL(12,3),
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "weighment_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "weighment_records_disposal_invoice_id_key" ON "weighment_records"("disposal_invoice_id");

-- AddForeignKey
ALTER TABLE "weighment_records" ADD CONSTRAINT "weighment_records_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weighment_records" ADD CONSTRAINT "weighment_records_disposal_invoice_id_fkey" FOREIGN KEY ("disposal_invoice_id") REFERENCES "disposal_invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
