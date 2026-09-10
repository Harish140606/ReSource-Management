import prisma from '../utils/prisma.js';
import { AppError } from '../utils/AppError.js';

export const VALID_TYPES = [
  'PRODUCTION_FUNCTION',
  'ZONE',
  'SHIFT',
  'DISPOSAL_ROUTE',
  'STORAGE_LOCATION',
  'WASTE_CATEGORY',
];

export async function getByType(type, includeInactive = false) {
  return prisma.referenceData.findMany({
    where: { type, ...(includeInactive ? {} : { is_active: true }) },
    orderBy: [{ sort_order: 'asc' }, { label: 'asc' }],
  });
}

// category code -> waste_type, sourced from the admin-managed reference data
// (not a hardcoded list) so disposal/stock lookups always match what
// declarations and Excel reports actually use for that category right now.
export async function getWasteTypeMap() {
  const rows = await prisma.referenceData.findMany({
    where: { type: 'WASTE_CATEGORY', is_active: true },
    select: { code: true, metadata: true },
  });
  const map = new Map();
  rows.forEach(r => map.set(r.code, r.metadata?.waste_type ?? null));
  return map;
}

export async function getAll() {
  return prisma.referenceData.findMany({
    orderBy: [{ type: 'asc' }, { sort_order: 'asc' }, { label: 'asc' }],
  });
}

export async function create({ type, code, label, group, metadata, sort_order }) {
  if (!VALID_TYPES.includes(type)) throw new AppError(`Invalid type. Must be one of: ${VALID_TYPES.join(', ')}`, 422, 'VALIDATION_ERROR');
  if (!code?.trim())  throw new AppError('code is required', 422, 'VALIDATION_ERROR');
  if (!label?.trim()) throw new AppError('label is required', 422, 'VALIDATION_ERROR');

  const existing = await prisma.referenceData.findUnique({ where: { type_code: { type, code: code.trim() } } });
  if (existing) throw new AppError(`A ${type} with code "${code}" already exists`, 409, 'CONFLICT');

  return prisma.referenceData.create({
    data: {
      type,
      code:       code.trim(),
      label:      label.trim(),
      group:      group?.trim() || null,
      metadata:   metadata || null,
      sort_order: sort_order ?? 0,
    },
  });
}

export async function update(id, { label, group, metadata, sort_order, is_active }) {
  const item = await prisma.referenceData.findUnique({ where: { id } });
  if (!item) throw new AppError('Reference data item not found', 404, 'NOT_FOUND');

  return prisma.referenceData.update({
    where: { id },
    data: {
      ...(label      !== undefined && { label: label.trim() }),
      ...(group      !== undefined && { group: group?.trim() || null }),
      ...(metadata   !== undefined && { metadata }),
      ...(sort_order !== undefined && { sort_order }),
      ...(is_active  !== undefined && { is_active }),
    },
  });
}

export async function remove(id) {
  const item = await prisma.referenceData.findUnique({ where: { id } });
  if (!item) throw new AppError('Reference data item not found', 404, 'NOT_FOUND');

  // Soft-delete: deactivate so historical data that uses this code still renders
  return prisma.referenceData.update({ where: { id }, data: { is_active: false } });
}

export async function hardRemove(id) {
  const item = await prisma.referenceData.findUnique({ where: { id } });
  if (!item) throw new AppError('Reference data item not found', 404, 'NOT_FOUND');

  await prisma.referenceData.delete({ where: { id } });
  return { deleted: true, id };
}
