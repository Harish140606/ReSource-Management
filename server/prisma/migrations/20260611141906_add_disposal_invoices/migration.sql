/*
  Warnings:

  - You are about to drop the column `storage_location` on the `scrap_declarations` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "declaration_line_items" ADD COLUMN     "storage_location" "StorageLocation";

-- AlterTable
ALTER TABLE "scrap_declarations" DROP COLUMN "storage_location";

-- CreateTable
CREATE TABLE "disposal_invoices" (
    "id" TEXT NOT NULL,
    "invoice_no" TEXT NOT NULL,
    "invoice_date" DATE NOT NULL,
    "vendor_name" TEXT NOT NULL,
    "vendor_gstin" TEXT,
    "total_net_amount" DECIMAL(14,2),
    "total_tax" DECIMAL(14,2),
    "total_amount" DECIMAL(14,2),
    "source_file" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "disposal_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "disposal_invoice_items" (
    "id" TEXT NOT NULL,
    "disposal_invoice_id" TEXT NOT NULL,
    "material_description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "waste_type" "WasteType" NOT NULL,
    "source" "WasteSource" NOT NULL,
    "qty_kg" DECIMAL(12,3) NOT NULL,
    "unit_price" DECIMAL(12,2),
    "ledger_entry_id" TEXT,

    CONSTRAINT "disposal_invoice_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "disposal_invoices_invoice_no_key" ON "disposal_invoices"("invoice_no");

-- AddForeignKey
ALTER TABLE "disposal_invoices" ADD CONSTRAINT "disposal_invoices_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disposal_invoice_items" ADD CONSTRAINT "disposal_invoice_items_disposal_invoice_id_fkey" FOREIGN KEY ("disposal_invoice_id") REFERENCES "disposal_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
