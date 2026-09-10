-- Reassign data off the values that are being removed (must run before enum/column changes)

-- Zone Managers become Dept Heads
UPDATE "employees" SET "role" = 'DEPT_HEAD' WHERE "role" = 'ZONE_MANAGER';

-- Zone-approved declarations collapse into the dept-approved stage
UPDATE "scrap_declarations" SET "status" = 'DEPT_APPROVED' WHERE "status" = 'ZONE_APPROVED';

-- Security-authorized declarations are now considered completed
UPDATE "scrap_declarations"
  SET "completed_at" = COALESCE("completed_at", "security_authorized_at", NOW())
  WHERE "status" = 'SECURITY_AUTHORIZED';
UPDATE "scrap_declarations" SET "status" = 'COMPLETED' WHERE "status" = 'SECURITY_AUTHORIZED';

-- Drop the zone-manager column + FK
ALTER TABLE "scrap_declarations" DROP CONSTRAINT IF EXISTS "scrap_declarations_zone_manager_id_fkey";
ALTER TABLE "scrap_declarations" DROP COLUMN "zone_manager_id";
ALTER TABLE "scrap_declarations" DROP COLUMN "zone_approved_at";

-- AlterEnum: Role (remove ZONE_MANAGER)
BEGIN;
CREATE TYPE "Role_new" AS ENUM ('EMPLOYEE', 'DEPT_HEAD', 'IREP', 'SECURITY', 'FACILITY_MANAGER', 'ADMIN');
ALTER TABLE "employees" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "employees" ALTER COLUMN "role" TYPE "Role_new" USING ("role"::text::"Role_new");
ALTER TYPE "Role" RENAME TO "Role_old";
ALTER TYPE "Role_new" RENAME TO "Role";
DROP TYPE "Role_old";
ALTER TABLE "employees" ALTER COLUMN "role" SET DEFAULT 'EMPLOYEE';
COMMIT;

-- AlterEnum: DeclarationStatus (remove ZONE_APPROVED, SECURITY_AUTHORIZED)
BEGIN;
CREATE TYPE "DeclarationStatus_new" AS ENUM ('DRAFT', 'SUBMITTED', 'DEPT_APPROVED', 'IREP_AUTHORIZED', 'COMPLETED');
ALTER TABLE "scrap_declarations" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "scrap_declarations" ALTER COLUMN "status" TYPE "DeclarationStatus_new" USING ("status"::text::"DeclarationStatus_new");
ALTER TYPE "DeclarationStatus" RENAME TO "DeclarationStatus_old";
ALTER TYPE "DeclarationStatus_new" RENAME TO "DeclarationStatus";
DROP TYPE "DeclarationStatus_old";
ALTER TABLE "scrap_declarations" ALTER COLUMN "status" SET DEFAULT 'DRAFT';
COMMIT;
