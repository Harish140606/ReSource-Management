import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { requireRole } from '../middleware/rbac.middleware.js';
import { createWeighmentRecordSchema, editWeighmentRecordSchema } from '../schemas/weighment.schema.js';
import { getWeighmentRecords, createStandaloneWeighmentRecord, editWeighmentRecord, deleteWeighmentRecord } from '../services/weighment.service.js';
import { ok } from '../utils/response.js';

const router = Router();
router.use(authenticate);

router.get('/', async (req, res, next) => {
  try {
    const result = await getWeighmentRecords(req.query);
    ok(res, result);
  } catch (err) { next(err); }
});

// Save a weighment on its own, without attaching it to a disposal invoice yet.
router.post('/', requireRole('SECURITY', 'IREP', 'ADMIN'), validate(createWeighmentRecordSchema), async (req, res, next) => {
  try {
    const created = await createStandaloneWeighmentRecord(req.body, req.user);
    ok(res, created, 201);
  } catch (err) { next(err); }
});

router.patch('/:id', requireRole('ADMIN'), validate(editWeighmentRecordSchema), async (req, res, next) => {
  try {
    const updated = await editWeighmentRecord(req.params.id, req.body, req.user);
    ok(res, updated);
  } catch (err) { next(err); }
});

router.delete('/:id', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const result = await deleteWeighmentRecord(req.params.id, req.user);
    ok(res, result);
  } catch (err) { next(err); }
});

export default router;
