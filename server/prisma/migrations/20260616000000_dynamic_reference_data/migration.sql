-- Convert enum columns to TEXT using explicit casts (preserves all existing data)

-- employees.production_function: ProductionFunction? → TEXT
ALTER TABLE "employees"
  ALTER COLUMN "production_function" TYPE TEXT USING "production_function"::text;

-- scrap_declarations.production_function: ProductionFunction → TEXT
ALTER TABLE "scrap_declarations"
  ALTER COLUMN "production_function" TYPE TEXT USING "production_function"::text;

-- scrap_declarations.shift: Shift → TEXT
ALTER TABLE "scrap_declarations"
  ALTER COLUMN "shift" TYPE TEXT USING "shift"::text;

-- scrap_declarations.disposal_route: DisposalRoute → TEXT (keep default)
ALTER TABLE "scrap_declarations"
  ALTER COLUMN "disposal_route" TYPE TEXT USING "disposal_route"::text,
  ALTER COLUMN "disposal_route" SET DEFAULT 'CIRCULARITY';

-- declaration_line_items.storage_location: StorageLocation? → TEXT
ALTER TABLE "declaration_line_items"
  ALTER COLUMN "storage_location" TYPE TEXT USING "storage_location"::text;

-- Drop old enum types (no longer needed)
DROP TYPE IF EXISTS "ProductionFunction";
DROP TYPE IF EXISTS "Shift";
DROP TYPE IF EXISTS "DisposalRoute";
DROP TYPE IF EXISTS "StorageLocation";

-- Create reference_data table
CREATE TABLE "reference_data" (
    "id"         TEXT NOT NULL,
    "type"       TEXT NOT NULL,
    "code"       TEXT NOT NULL,
    "label"      TEXT NOT NULL,
    "group"      TEXT,
    "metadata"   JSONB,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active"  BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reference_data_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "reference_data_type_code_key" ON "reference_data"("type", "code");
