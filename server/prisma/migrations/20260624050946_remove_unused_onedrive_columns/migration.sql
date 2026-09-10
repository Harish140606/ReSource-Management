/*
  Warnings:

  - You are about to drop the column `onedrive_file_id` on the `excel_export_log` table. All the data in the column will be lost.
  - You are about to drop the column `onedrive_url` on the `excel_export_log` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "excel_export_log" DROP COLUMN "onedrive_file_id",
DROP COLUMN "onedrive_url";
