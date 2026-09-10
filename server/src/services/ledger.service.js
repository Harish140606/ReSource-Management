import prisma from '../utils/prisma.js';

export async function getLedger(query) {
  const where = {};
  if (query.date_from) where.date = { ...where.date, gte: new Date(query.date_from) };
  if (query.date_to) where.date = { ...where.date, lte: new Date(query.date_to + 'T23:59:59Z') };
  if (query.source) where.source = query.source;
  if (query.waste_type) where.waste_type = query.waste_type;

  return prisma.generationDisposalLedger.findMany({
    where,
    orderBy: [{ date: 'desc' }, { category: 'asc' }],
  });
}

export async function updateDisposal(id, disposal, userId) {
  const entry = await prisma.generationDisposalLedger.findUnique({ where: { id } });
  if (!entry) throw new Error('Ledger entry not found');

  const closing = Number(entry.opening_stock) + Number(entry.waste_for_day) - disposal;
  return prisma.generationDisposalLedger.update({
    where: { id },
    data: { disposal, closing_stock: closing },
  });
}
