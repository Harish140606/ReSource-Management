import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/auth.middleware.js';
import { uploadDocument, listDocuments, getDocumentFile, deleteDocument } from '../services/document.service.js';
import { AppError } from '../utils/AppError.js';
import { ok } from '../utils/response.js';

const router = Router();
router.use(authenticate);

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIME_TYPES.has(file.mimetype)) cb(null, true);
    else cb(new AppError('Only PDF, Word, Excel, PowerPoint, or text files are accepted', 422, 'INVALID_FILE_TYPE'));
  },
});

router.post('/', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) throw new AppError('No file uploaded', 422, 'NO_FILE');
    const doc = await uploadDocument({ title: req.body.title, category: req.body.category, file: req.file }, req.user);
    ok(res, doc, 201);
  } catch (err) { next(err); }
});

router.get('/', async (req, res, next) => {
  try {
    const result = await listDocuments(req.query);
    ok(res, result);
  } catch (err) { next(err); }
});

router.get('/:id/download', async (req, res, next) => {
  try {
    const doc = await getDocumentFile(req.params.id);
    res.setHeader('Content-Type', doc.mime_type);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(doc.filename)}"`);
    res.send(doc.file_data);
  } catch (err) { next(err); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const result = await deleteDocument(req.params.id, req.user);
    ok(res, result);
  } catch (err) { next(err); }
});

export default router;
