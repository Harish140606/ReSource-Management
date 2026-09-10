import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { requireMinRole } from '../middleware/rbac.middleware.js';
import { createDeclarationSchema, updateStorageLocationSchema, editLineItemSchema } from '../schemas/declaration.schema.js';
import {
  createDeclaration,
  updateDeclaration,
  deleteDeclaration,
  deleteLineItem,
  editLineItem,
  submitDeclaration,
  approveDeclaration,
  updateStorageLocations,
  getDeclarations,
  getDeclarationById,
  generateReferenceNo,
} from '../services/declaration.service.js';
import { generateReport } from '../services/excel.service.js';
import { ok } from '../utils/response.js';

const router = Router();
router.use(authenticate);

router.post('/', validate(createDeclarationSchema), async (req, res, next) => {
  try {
    const decl = await createDeclaration(req.body, req.user);
    ok(res, decl, 201);
  } catch (err) { next(err); }
});

router.get('/', async (req, res, next) => {
  try {
    const result = await getDeclarations(req.query, req.user);
    ok(res, result);
  } catch (err) { next(err); }
});

router.get('/next-reference', async (req, res, next) => {
  try {
    const reference_no = await generateReferenceNo(req.query.source || 'BAT');
    ok(res, { reference_no });
  } catch (err) { next(err); }
});

router.get('/export/excel', requireMinRole('DEPT_HEAD'), async (req, res, next) => {
  try {
    // If date range provided, scope to that range; otherwise export all historical data
    const dateFrom = req.query.date_from || null;
    const dateTo   = req.query.date_to   || null;
    const buffer   = await generateReport(dateFrom, dateTo);
    const filename = 'ReSource_Scrap_Report.xlsx';

    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const decl = await getDeclarationById(req.params.id, req.user);
    ok(res, decl);
  } catch (err) { next(err); }
});

router.patch('/:id', validate(createDeclarationSchema), async (req, res, next) => {
  try {
    const updated = await updateDeclaration(req.params.id, req.body, req.user);
    ok(res, updated);
  } catch (err) { next(err); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    await deleteDeclaration(req.params.id, req.user);
    ok(res, { deleted: true });
  } catch (err) { next(err); }
});

// Remove a single line item without touching the rest of the declaration — Admin only.
router.delete('/:id/line-items/:lineItemId', async (req, res, next) => {
  try {
    const updated = await deleteLineItem(req.params.id, req.params.lineItemId, req.user);
    ok(res, updated);
  } catch (err) { next(err); }
});

// Edit a single line item's values without touching the rest — Admin only.
router.patch('/:id/line-items/:lineItemId', validate(editLineItemSchema), async (req, res, next) => {
  try {
    const updated = await editLineItem(req.params.id, req.params.lineItemId, req.body, req.user);
    ok(res, updated);
  } catch (err) { next(err); }
});

router.patch('/:id/submit', async (req, res, next) => {
  try {
    const updated = await submitDeclaration(req.params.id, req.user, req.ip);
    ok(res, updated);
  } catch (err) { next(err); }
});

router.patch('/:id/storage-location', validate(updateStorageLocationSchema), async (req, res, next) => {
  try {
    const updated = await updateStorageLocations(req.params.id, req.body.items, req.user);
    ok(res, updated);
  } catch (err) { next(err); }
});

router.patch('/:id/approve', requireMinRole('DEPT_HEAD'), async (req, res, next) => {
  try {
    const updated = await approveDeclaration(req.params.id, req.user, req.ip);
    ok(res, updated);
  } catch (err) { next(err); }
});

export default router;
