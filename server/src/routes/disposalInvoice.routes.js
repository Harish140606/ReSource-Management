import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { requireRole } from '../middleware/rbac.middleware.js';
import { createDisposalInvoiceSchema, editDisposalItemSchema } from '../schemas/disposalInvoice.schema.js';
import { parseInvoiceBuffer, createDisposalInvoice, getDisposalInvoices, getStockFor, deleteDisposalInvoice, deleteDisposalItem, editDisposalItem, DISPOSAL_ROLES } from '../services/disposal.service.js';
import { parseWeighmentCertificate } from '../services/weighmentParser.service.js';
import { AppError } from '../utils/AppError.js';
import { ok } from '../utils/response.js';

const router = Router();
router.use(authenticate);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') cb(null, true);
    else cb(new AppError('Only PDF files are accepted', 422, 'INVALID_FILE_TYPE'));
  },
});

const uploadWeighment = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (req, file, cb) => {
    if (['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) cb(null, true);
    else cb(new AppError('Only PDF, JPEG, PNG, or WEBP files are accepted', 422, 'INVALID_FILE_TYPE'));
  },
});

// Parse an uploaded invoice PDF — returns extracted header + matched line items. Nothing saved.
router.post('/parse', requireRole(...DISPOSAL_ROLES), upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) throw new AppError('No PDF file uploaded', 422, 'NO_FILE');
    const result = await parseInvoiceBuffer(req.file.buffer);
    result.header.source_file = req.file.originalname;
    ok(res, result);
  } catch (err) { next(err); }
});

// OCR an uploaded weighbridge weighment certificate (photo/scan) — returns
// extracted vehicle/weight fields for the user to review. Nothing saved.
router.post('/parse-weighment', requireRole(...DISPOSAL_ROLES), uploadWeighment.single('file'), async (req, res, next) => {
  try {
    if (!req.file) throw new AppError('No file uploaded', 422, 'NO_FILE');
    const result = await parseWeighmentCertificate(req.file.buffer, req.file.mimetype);
    ok(res, result);
  } catch (err) { next(err); }
});

// Confirm a parsed invoice — persists it and subtracts quantities from the ledger.
router.post('/', requireRole(...DISPOSAL_ROLES), validate(createDisposalInvoiceSchema), async (req, res, next) => {
  try {
    const invoice = await createDisposalInvoice(req.body, req.user);
    ok(res, invoice, 201);
  } catch (err) { next(err); }
});

// Live stock lookup for a category — current stock on hand. Used by the review preview.
router.get('/stock', requireRole(...DISPOSAL_ROLES), async (req, res, next) => {
  try {
    if (!req.query.category) throw new AppError('category is required', 422, 'NO_CATEGORY');
    const stock = await getStockFor(req.query.category);
    ok(res, stock);
  } catch (err) { next(err); }
});

router.get('/', async (req, res, next) => {
  try {
    const result = await getDisposalInvoices(req.query);
    ok(res, result);
  } catch (err) { next(err); }
});

// Delete a recorded disposal (admin only) — adds its quantities back to stock.
router.delete('/:id', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const result = await deleteDisposalInvoice(req.params.id, req.user);
    ok(res, result);
  } catch (err) { next(err); }
});

// Remove a single item from a recorded disposal without touching the rest — Admin only.
router.delete('/:id/items/:itemId', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const result = await deleteDisposalItem(req.params.id, req.params.itemId, req.user);
    ok(res, result);
  } catch (err) { next(err); }
});

// Edit a single disposal invoice item's values without touching the rest — Admin only.
router.patch('/:id/items/:itemId', requireRole('ADMIN'), validate(editDisposalItemSchema), async (req, res, next) => {
  try {
    const result = await editDisposalItem(req.params.id, req.params.itemId, req.body, req.user);
    ok(res, result);
  } catch (err) { next(err); }
});

export default router;
