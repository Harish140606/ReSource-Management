import cron from 'node-cron';
import { triggerExport } from '../services/excel.service.js';

export function registerNightlyExportJob() {
  cron.schedule('55 23 * * *', async () => {
    console.log('[Cron] Nightly export starting — full history snapshot…');
    try {
      const result = await triggerExport(null, 'CRON_NIGHTLY');
      console.log('[Cron] Nightly export complete:', result.shareUrl ?? 'no URL (OneDrive not configured)');
    } catch (err) {
      console.error('[Cron] Nightly export failed:', err.message);
    }
  });

  console.log('[Cron] Nightly export job registered (23:55 daily)');
}
