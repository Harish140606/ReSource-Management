import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import prisma from '../utils/prisma.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const EXPORTS_DIR = path.resolve(__dirname, '../../exports');
export const REPORT_PATH = path.join(EXPORTS_DIR, 'ReSource_Scrap_Report.xlsx');

// Ensure exports directory exists
if (!fs.existsSync(EXPORTS_DIR)) fs.mkdirSync(EXPORTS_DIR, { recursive: true });

export async function saveReportLocally(buffer, declarationId = null, triggeredBy = 'MANUAL_DOWNLOAD') {
  try {
    fs.writeFileSync(REPORT_PATH, buffer);
    console.log(`[Export] Saved report to ${REPORT_PATH}`);

    await prisma.excelExportLog.create({
      data: {
        triggered_by: triggeredBy,
        declaration_id: declarationId,
        filename: 'ReSource_Scrap_Report.xlsx',
        status: 'SUCCESS',
      },
    });

    return { saved: true, path: REPORT_PATH };
  } catch (err) {
    console.error('[Export] Failed to save report locally:', err.message);

    await prisma.excelExportLog.create({
      data: {
        triggered_by: triggeredBy,
        declaration_id: declarationId,
        filename: 'ReSource_Scrap_Report.xlsx',
        status: 'FAILED',
        error_message: err.message,
      },
    });

    throw err;
  }
}

export function getReportFileInfo() {
  if (!fs.existsSync(REPORT_PATH)) return null;
  const stat = fs.statSync(REPORT_PATH);
  return { exists: true, size: stat.size, lastModified: stat.mtime };
}
