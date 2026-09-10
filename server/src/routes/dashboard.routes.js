import { Router } from 'express';
import dayjs from 'dayjs';
import prisma from '../utils/prisma.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { ok } from '../utils/response.js';
import { getWasteTypeMap } from '../services/referenceData.service.js';

const router = Router();
router.use(authenticate);

router.get('/summary', async (req, res, next) => {
  try {
    // Use UTC-midnight date boundaries to match how @db.Date values are stored
    // and how the ledger/charts filter — avoids a timezone off-by-one day.
    const today = new Date(dayjs().format('YYYY-MM-DD'));
    const weekStart = new Date(dayjs().subtract(6, 'day').format('YYYY-MM-DD'));

    const [todayLedger, weekLedger, pendingCount, completedCount, allLedger] = await Promise.all([
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
      prisma.scrapDeclaration.count({
        where: { status: 'COMPLETED' },
      }),
      prisma.generationDisposalLedger.findMany({
        orderBy: [{ date: 'desc' }, { created_at: 'desc' }],
        select: { category: true, waste_type: true, source: true, closing_stock: true },
      }),
    ]);

    // Stock currently on hand = latest closing_stock for every distinct
    // (category, waste_type, source) group, summed across the whole factory.
    // Only categories still active in Reference Data are counted — a deleted
    // category's old ledger rows must not keep inflating this total (mirrors
    // the same active-category filter already applied to the Excel export).
    const activeCategories = new Set((await getWasteTypeMap()).keys());
    const seen = new Set();
    let stockRemainingKg = 0;
    const stockByCategory = {};
    for (const r of allLedger) {
      if (!activeCategories.has(r.category)) continue;
      const key = `${r.category}|${r.waste_type}|${r.source}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const closing = Number(r.closing_stock);
      stockRemainingKg += closing;
      stockByCategory[r.category] = (stockByCategory[r.category] || 0) + closing;
    }

    ok(res, {
      today_total_kg: Number(todayLedger._sum.waste_for_day ?? 0),
      week_total_kg: Number(weekLedger._sum.waste_for_day ?? 0),
      pending_approvals: pendingCount,
      completed_declarations: completedCount,
      stock_remaining_kg: stockRemainingKg,
      stock_by_category: Object.entries(stockByCategory).map(([category, kg]) => ({ category, kg })),
    });
  } catch (err) { next(err); }
});

router.get('/ledger', async (req, res, next) => {
  try {
    const dateFrom = req.query.date_from || dayjs().subtract(29, 'day').format('YYYY-MM-DD');
    const dateTo = req.query.date_to || dayjs().format('YYYY-MM-DD');
    const source = req.query.source;

    const where = {
      date: { gte: new Date(dateFrom), lte: new Date(dateTo + 'T23:59:59Z') },
    };
    if (source && source !== 'ALL') where.source = source;

    const ledger = await prisma.generationDisposalLedger.findMany({
      where,
      orderBy: [{ date: 'asc' }, { category: 'asc' }],
    });

    // Group by category + source for bar chart
    const byCategory = {};
    ledger.forEach(l => {
      if (!byCategory[l.category]) byCategory[l.category] = { category: l.category, BAT: 0, SOFT: 0, COMBINED: 0 };
      byCategory[l.category][l.source] = (byCategory[l.category][l.source] || 0) + Number(l.waste_for_day);
    });

    ok(res, {
      raw: ledger,
      by_category: Object.values(byCategory),
    });
  } catch (err) { next(err); }
});

router.get('/trends', async (req, res, next) => {
  try {
    // Explicit date_from/date_to wins over the days preset when both are given.
    const { date_from, date_to } = req.query;
    const days = parseInt(req.query.days) || 30;
    const from = date_from ? new Date(date_from) : dayjs().subtract(days - 1, 'day').startOf('day').toDate();
    const to = date_to ? new Date(date_to + 'T23:59:59Z') : undefined;
    // Accept single ?category= OR repeated ?categories=a&categories=b (sub-group expansion)
    const cats = [].concat(req.query.categories || req.query.category || []).filter(Boolean);

    const where = { date: to ? { gte: from, lte: to } : { gte: from } };
    if (cats.length === 1) where.category = cats[0];
    else if (cats.length > 1) where.category = { in: cats };

    const ledger = await prisma.generationDisposalLedger.findMany({
      where,
      orderBy: { date: 'asc' },
    });

    // Aggregate by date + source. `leftover` sums closing_stock across every
    // matching row for that date — the stock still on hand at day's end.
    const byDate = {};
    ledger.forEach(l => {
      const d = dayjs(l.date).format('YYYY-MM-DD');
      if (!byDate[d]) byDate[d] = { date: d, BAT: 0, SOFT: 0, COMBINED: 0, leftover: 0 };
      byDate[d][l.source] = (byDate[d][l.source] || 0) + Number(l.waste_for_day);
      byDate[d].leftover += Number(l.closing_stock ?? 0);
    });

    ok(res, Object.values(byDate));
  } catch (err) { next(err); }
});

router.get('/circularity', async (req, res, next) => {
  try {
    const { date_from, date_to } = req.query;
    const from = date_from ? new Date(date_from) : dayjs().startOf('week').toDate();
    const to = date_to ? new Date(date_to + 'T23:59:59Z') : undefined;

    const ledger = await prisma.generationDisposalLedger.findMany({
      where: { date: to ? { gte: from, lte: to } : { gte: from } },
    });

    const matrix = {};
    ledger.forEach(l => {
      if (!matrix[l.category]) matrix[l.category] = { category: l.category, GENERAL: 0, HAZARDOUS: 0, EWASTE: 0 };
      matrix[l.category][l.waste_type] = (matrix[l.category][l.waste_type] || 0) + Number(l.waste_for_day);
    });

    // Leftover stock per category as of the latest date in range (sums
    // closing_stock across sources for that category's most recent date).
    const leftoverLatest = {};
    ledger.forEach(l => {
      const d = dayjs(l.date).format('YYYY-MM-DD');
      const entry = leftoverLatest[l.category];
      if (!entry || d > entry.maxDate) {
        leftoverLatest[l.category] = { maxDate: d, total: Number(l.closing_stock ?? 0) };
      } else if (d === entry.maxDate) {
        entry.total += Number(l.closing_stock ?? 0);
      }
    });
    Object.entries(leftoverLatest).forEach(([cat, v]) => {
      if (matrix[cat]) matrix[cat].leftover = v.total;
    });

    // Donut breakdown by waste_type
    const byType = { GENERAL: 0, HAZARDOUS: 0, EWASTE: 0 };
    ledger.forEach(l => { byType[l.waste_type] += Number(l.waste_for_day); });

    ok(res, { by_function: Object.values(matrix), by_type: byType });
  } catch (err) { next(err); }
});

export default router;
