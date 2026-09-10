// Power Query-compatible live data endpoints
// Returns bare JSON arrays (no wrapper) for Excel Power Query compatibility
// All endpoints require Bearer token — include in Excel's Web connector header

import { Router } from 'express';
import dayjs from 'dayjs';
import prisma from '../utils/prisma.js';
import { optionalAuth } from '../middleware/auth.middleware.js';
import { AppError } from '../utils/AppError.js';

const router = Router();
router.use(optionalAuth);

// Add Power Query friendly header to all /live responses
router.use((req, res, next) => {
  res.setHeader('X-PowerQuery-Friendly', 'true');
  next();
});

// GET /live/ledger — full generation & disposal ledger, flat JSON array
router.get('/ledger', async (req, res, next) => {
  try {
    const where = {};
    if (req.query.date_from) where.date = { ...where.date, gte: new Date(req.query.date_from) };
    if (req.query.date_to) where.date = { ...where.date, lte: new Date(req.query.date_to + 'T23:59:59Z') };
    if (req.query.source) where.source = req.query.source;
    if (req.query.waste_type) where.waste_type = req.query.waste_type;

    const rows = await prisma.generationDisposalLedger.findMany({
      where,
      orderBy: [{ date: 'asc' }, { category: 'asc' }],
    });

    // Return bare array — Power Query reads this directly as a table
    res.json(rows.map(r => ({
      date: dayjs(r.date).format('YYYY-MM-DD'),
      category: r.category,
      waste_type: r.waste_type,
      source: r.source,
      opening_stock: Number(r.opening_stock),
      waste_for_day: Number(r.waste_for_day),
      disposal: Number(r.disposal),
      closing_stock: Number(r.closing_stock),
    })));
  } catch (err) { next(err); }
});

// GET /live/declarations — flat declaration list with totals
router.get('/declarations', async (req, res, next) => {
  try {
    const decls = await prisma.scrapDeclaration.findMany({
      include: {
        employee: { select: { name: true, emp_no: true } },
        line_items: { select: { weight_kg: true } },
      },
      orderBy: { date: 'desc' },
      take: 500,
    });

    res.json(decls.map(d => ({
      declaration_no: d.declaration_no,
      date: dayjs(d.date).format('YYYY-MM-DD'),
      zone: d.zone,
      function: d.production_function,
      source: d.source,
      total_weight_kg: d.line_items.reduce((s, li) => s + Number(li.weight_kg ?? 0), 0),
      status: d.status,
      declared_by: d.employee.name,
      emp_no: d.employee.emp_no,
    })));
  } catch (err) { next(err); }
});

// GET /live/summary — daily and weekly totals
router.get('/summary', async (req, res, next) => {
  try {
    const today = dayjs().startOf('day').toDate();
    const weekStart = dayjs().subtract(6, 'day').startOf('day').toDate();

    const [todayAgg, weekAgg, pendingCount, bySource, byFunction] = await Promise.all([
      prisma.generationDisposalLedger.aggregate({
        where: { date: { gte: today } },
        _sum: { waste_for_day: true },
      }),
      prisma.generationDisposalLedger.aggregate({
        where: { date: { gte: weekStart } },
        _sum: { waste_for_day: true },
      }),
      prisma.scrapDeclaration.count({
        where: { status: { notIn: ['DRAFT', 'COMPLETED'] } },
      }),
      prisma.generationDisposalLedger.groupBy({
        by: ['source'],
        where: { date: { gte: weekStart } },
        _sum: { waste_for_day: true },
      }),
      prisma.scrapDeclaration.groupBy({
        by: ['production_function'],
        where: { date: { gte: weekStart }, status: 'COMPLETED' },
        _count: { id: true },
      }),
    ]);

    const byCategory = await prisma.generationDisposalLedger.groupBy({
      by: ['category', 'waste_type'],
      where: { date: { gte: weekStart } },
      _sum: { waste_for_day: true },
    });

    res.json({
      today_total_kg: Number(todayAgg._sum.waste_for_day ?? 0),
      week_total_kg: Number(weekAgg._sum.waste_for_day ?? 0),
      pending_approvals: pendingCount,
      by_source: bySource.reduce((acc, s) => {
        acc[s.source] = Number(s._sum.waste_for_day);
        return acc;
      }, {}),
      by_function: byFunction.map(f => ({ function: f.production_function, count: f._count.id })),
      by_category: byCategory.map(c => ({
        category: c.category,
        waste_type: c.waste_type,
        total_kg: Number(c._sum.waste_for_day),
      })),
    });
  } catch (err) { next(err); }
});

// GET /live/vendor-pickups — vendor pickup log
router.get('/vendor-pickups', async (req, res, next) => {
  try {
    const pickups = await prisma.vendorPickup.findMany({
      include: { creator: { select: { name: true } } },
      orderBy: { date: 'desc' },
      take: 200,
    });

    res.json(pickups.map(p => ({
      date: dayjs(p.date).format('YYYY-MM-DD'),
      vendor_name: p.vendor_name,
      vehicle_entry_no: p.vehicle_entry_no,
      vehicle_out_no: p.vehicle_out_no,
      category: p.category,
      remarks: p.remarks,
      logged_by: p.creator.name,
    })));
  } catch (err) { next(err); }
});

export default router;
