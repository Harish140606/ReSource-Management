import { Router } from 'express';
import prisma from '../utils/prisma.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { createVendorPickupSchema } from '../schemas/vendorPickup.schema.js';
import { generateVendorInvoiceReport } from '../services/excel.service.js';
import { logAudit } from '../services/audit.service.js';
import { ok } from '../utils/response.js';

const router = Router();
router.use(authenticate);

router.get('/export/invoice', async (req, res, next) => {
  try {
    const dateFrom = req.query.date_from || null;
    const dateTo   = req.query.date_to   || null;
    const buffer   = await generateVendorInvoiceReport(dateFrom, dateTo);
    const filename = 'ReSource_Vendor_Invoice_Sheet.xlsx';

    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch (err) { next(err); }
});

router.post('/', validate(createVendorPickupSchema), async (req, res, next) => {
  try {
    const pickup = await prisma.vendorPickup.create({
      data: { ...req.body, date: new Date(req.body.date), created_by: req.user.id },
      include: { creator: { select: { name: true, emp_no: true } } },
    });
    await logAudit({
      userId: req.user.id,
      action: 'VENDOR_PICKUP_CREATED',
      entity: 'vendor_pickups',
      entityId: pickup.id,
      newValue: { vendor_name: pickup.vendor_name, category: pickup.category },
      ipAddress: req.ip,
    });
    ok(res, pickup, 201);
  } catch (err) { next(err); }
});

router.get('/', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 20);

    const where = {};
    if (req.query.date_from) where.date = { ...where.date, gte: new Date(req.query.date_from) };
    if (req.query.date_to) where.date = { ...where.date, lte: new Date(req.query.date_to + 'T23:59:59Z') };

    const [items, total] = await Promise.all([
      prisma.vendorPickup.findMany({
        where,
        include: { creator: { select: { name: true, emp_no: true } } },
        orderBy: { date: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.vendorPickup.count({ where }),
    ]);

    ok(res, { items, total, page, limit, pages: Math.ceil(total / limit) });
  } catch (err) { next(err); }
});

export default router;
