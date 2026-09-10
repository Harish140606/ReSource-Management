-- CreateEnum
CREATE TYPE "Role" AS ENUM ('EMPLOYEE', 'ZONE_MANAGER', 'DEPT_HEAD', 'FACILITY_MANAGER', 'ADMIN');

-- CreateEnum
CREATE TYPE "ProductionFunction" AS ENUM ('SMT', 'MFT', 'REPAIR', 'RFM', 'FILTER', 'SQ');

-- CreateEnum
CREATE TYPE "Shift" AS ENUM ('A', 'B', 'C', 'G');

-- CreateEnum
CREATE TYPE "DeclarationStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'ZONE_APPROVED', 'DEPT_APPROVED', 'IREP_AUTHORIZED', 'SECURITY_AUTHORIZED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "WasteSource" AS ENUM ('BAT', 'SOFT');

-- CreateEnum
CREATE TYPE "WasteType" AS ENUM ('GENERAL', 'HAZARDOUS', 'EWASTE');

-- CreateEnum
CREATE TYPE "LedgerSource" AS ENUM ('BAT', 'SOFT', 'COMBINED');

-- CreateEnum
CREATE TYPE "ExportTrigger" AS ENUM ('DECLARATION_COMPLETED', 'CRON_NIGHTLY', 'MANUAL_DOWNLOAD');

-- CreateEnum
CREATE TYPE "ExportStatus" AS ENUM ('SUCCESS', 'FAILED');

-- CreateTable
CREATE TABLE "employees" (
    "id" TEXT NOT NULL,
    "emp_no" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'EMPLOYEE',
    "production_function" "ProductionFunction",
    "zone" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scrap_declarations" (
    "id" TEXT NOT NULL,
    "declaration_no" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "shift" "Shift" NOT NULL,
    "time" TEXT NOT NULL,
    "zone" TEXT NOT NULL,
    "production_function" "ProductionFunction" NOT NULL,
    "source" "WasteSource" NOT NULL,
    "description" TEXT,
    "reference_no" TEXT,
    "status" "DeclarationStatus" NOT NULL DEFAULT 'DRAFT',
    "zone_manager_id" TEXT,
    "dept_head_id" TEXT,
    "irep_auth_by" TEXT,
    "security_auth_by" TEXT,
    "zone_approved_at" TIMESTAMP(3),
    "dept_approved_at" TIMESTAMP(3),
    "irep_authorized_at" TIMESTAMP(3),
    "security_authorized_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scrap_declarations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "declaration_line_items" (
    "id" TEXT NOT NULL,
    "declaration_id" TEXT NOT NULL,
    "waste_type" "WasteType" NOT NULL,
    "category" TEXT NOT NULL,
    "pallet_qty" DECIMAL(10,3),
    "weight_kg" DECIMAL(10,3),
    "remarks" TEXT,

    CONSTRAINT "declaration_line_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "generation_disposal_ledger" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "category" TEXT NOT NULL,
    "waste_type" "WasteType" NOT NULL,
    "opening_stock" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "waste_for_day" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "disposal" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "closing_stock" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "source" "LedgerSource" NOT NULL,
    "declaration_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "generation_disposal_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_pickups" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "vendor_name" TEXT NOT NULL,
    "vehicle_entry_no" TEXT NOT NULL,
    "vehicle_out_no" TEXT,
    "vehicle_holding_time" TEXT,
    "invoice_raise_time" TEXT,
    "invoice_received_time" TEXT,
    "category" TEXT NOT NULL,
    "remarks" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendor_pickups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "excel_export_log" (
    "id" TEXT NOT NULL,
    "triggered_by" "ExportTrigger" NOT NULL,
    "declaration_id" TEXT,
    "onedrive_file_id" TEXT,
    "onedrive_url" TEXT,
    "filename" TEXT,
    "status" "ExportStatus" NOT NULL,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "excel_export_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "old_value" JSONB,
    "new_value" JSONB,
    "ip_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "employees_emp_no_key" ON "employees"("emp_no");

-- CreateIndex
CREATE UNIQUE INDEX "employees_email_key" ON "employees"("email");

-- CreateIndex
CREATE UNIQUE INDEX "scrap_declarations_declaration_no_key" ON "scrap_declarations"("declaration_no");

-- AddForeignKey
ALTER TABLE "scrap_declarations" ADD CONSTRAINT "scrap_declarations_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scrap_declarations" ADD CONSTRAINT "scrap_declarations_zone_manager_id_fkey" FOREIGN KEY ("zone_manager_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scrap_declarations" ADD CONSTRAINT "scrap_declarations_dept_head_id_fkey" FOREIGN KEY ("dept_head_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scrap_declarations" ADD CONSTRAINT "scrap_declarations_irep_auth_by_fkey" FOREIGN KEY ("irep_auth_by") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scrap_declarations" ADD CONSTRAINT "scrap_declarations_security_auth_by_fkey" FOREIGN KEY ("security_auth_by") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "declaration_line_items" ADD CONSTRAINT "declaration_line_items_declaration_id_fkey" FOREIGN KEY ("declaration_id") REFERENCES "scrap_declarations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generation_disposal_ledger" ADD CONSTRAINT "generation_disposal_ledger_declaration_id_fkey" FOREIGN KEY ("declaration_id") REFERENCES "scrap_declarations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_pickups" ADD CONSTRAINT "vendor_pickups_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "excel_export_log" ADD CONSTRAINT "excel_export_log_declaration_id_fkey" FOREIGN KEY ("declaration_id") REFERENCES "scrap_declarations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
