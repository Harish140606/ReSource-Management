import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { requireRole } from '../middleware/rbac.middleware.js';
import { getSetting, setSetting, SETTINGS } from '../services/appSettings.service.js';
import { logAudit } from '../services/audit.service.js';
import { AppError } from '../utils/AppError.js';
import { ok } from '../utils/response.js';

const router = Router();
router.use(authenticate);

const VALID_KEYS = new Set(Object.values(SETTINGS));

// Any authenticated user can read a setting (e.g. to decide whether to show
// the bulk-upload tab) — only ADMIN can change one.
router.get('/:key', async (req, res, next) => {
  try {
    if (!VALID_KEYS.has(req.params.key)) throw new AppError('Unknown setting', 404, 'NOT_FOUND');
    const value = await getSetting(req.params.key);
    ok(res, { key: req.params.key, value });
  } catch (err) { next(err); }
});

router.patch('/:key', requireRole('ADMIN'), async (req, res, next) => {
  try {
    if (!VALID_KEYS.has(req.params.key)) throw new AppError('Unknown setting', 404, 'NOT_FOUND');
    const value = await setSetting(req.params.key, req.body.value);
    await logAudit({
      userId: req.user.id,
      action: 'SETTING_UPDATED',
      entity: 'app_settings',
      entityId: req.params.key,
      newValue: { value },
    });
    ok(res, { key: req.params.key, value });
  } catch (err) { next(err); }
});

export default router;
