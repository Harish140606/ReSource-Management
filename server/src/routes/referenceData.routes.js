import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { requireRole } from '../middleware/rbac.middleware.js';
import { ok } from '../utils/response.js';
import * as svc from '../services/referenceData.service.js';

const router = Router();
router.use(authenticate);

// Any authenticated user — used by dropdowns everywhere
// ?include_inactive=true is admin-only (non-admins silently get active only)
router.get('/', async (req, res, next) => {
  try {
    const { type, include_inactive } = req.query;
    const isAdmin = req.user?.role === 'ADMIN';
    const showAll = include_inactive === 'true' && isAdmin;
    ok(res, type ? await svc.getByType(type, showAll) : await svc.getAll());
  } catch (err) { next(err); }
});

// Admin-only CRUD
router.post('/', requireRole('ADMIN'), async (req, res, next) => {
  try {
    ok(res, await svc.create(req.body), 201);
  } catch (err) { next(err); }
});

router.patch('/:id', requireRole('ADMIN'), async (req, res, next) => {
  try {
    ok(res, await svc.update(req.params.id, req.body));
  } catch (err) { next(err); }
});

// Soft-delete (deactivate)
router.delete('/:id', requireRole('ADMIN'), async (req, res, next) => {
  try {
    ok(res, await svc.remove(req.params.id));
  } catch (err) { next(err); }
});

// Hard delete — permanent, use only when item has no historical references
router.delete('/:id/hard', requireRole('ADMIN'), async (req, res, next) => {
  try {
    ok(res, await svc.hardRemove(req.params.id));
  } catch (err) { next(err); }
});

export default router;
