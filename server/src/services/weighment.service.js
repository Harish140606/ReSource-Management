import prisma from '../utils/prisma.js';
import { AppError } from '../utils/AppError.js';
import { logAudit } from './audit.service.js';

function computeNetKg(emptyKg, loadedGrossKg, loadedNetKg) {
  if (loadedNetKg != null) return Number(loadedNetKg);
  if (loadedGrossKg != null && emptyKg != null) return Number((Number(loadedGrossKg) - Number(emptyKg)).toFixed(3));
  return null;
}

/** Recompute the lightweight summary fields shown on the disposal invoice's list row. */
function summaryFromRecord(rec) {
  if (!rec) return { vehicle_no: null, weighment_serial_no: null, gross_weight_kg: null, tare_weight_kg: null, net_weight_kg: null };
  const empty_kg = rec.empty_weight_kg != null ? Number(rec.empty_weight_kg) : null;
  const gross_kg = rec.loaded_gross_weight_kg != null ? Number(rec.loaded_gross_weight_kg) : null;
  const net_kg = rec.loaded_net_weight_kg != null ? Number(rec.loaded_net_weight_kg) : computeNetKg(empty_kg, gross_kg, null);
  return {
    vehicle_no: rec.loaded_vehicle_no || rec.empty_vehicle_no || rec.vehicle_no || null,
    weighment_serial_no: rec.loaded_serial_no || rec.empty_serial_no || null,
    gross_weight_kg: gross_kg,
    tare_weight_kg: empty_kg,
    net_weight_kg: net_kg,
  };
}

/**
 * Create a WeighmentRecord for a disposal invoice, inside the caller's
 * transaction, and sync the invoice's display-only summary fields. Returns
 * null if no weighment data was actually supplied (entirely optional).
 */
export async function createWeighmentRecordTx(tx, { disposal_invoice_id, payload, user }) {
  const hasEmpty = payload.empty_serial_no || payload.empty_vehicle_no || payload.empty_weight_kg != null;
  const hasLoaded = payload.loaded_serial_no || payload.loaded_vehicle_no || payload.loaded_gross_weight_kg != null || payload.loaded_net_weight_kg != null;
  if (!hasEmpty && !hasLoaded) return null;

  const data = {
    disposal_invoice_id,
    vehicle_no: payload.vehicle_no ?? payload.loaded_vehicle_no ?? payload.empty_vehicle_no ?? null,
    empty_serial_no: payload.empty_serial_no ?? null,
    empty_vehicle_no: payload.empty_vehicle_no ?? null,
    empty_weighed_date: payload.empty_weighed_date ?? null,
    empty_weighed_time: payload.empty_weighed_time ?? null,
    empty_weight_kg: payload.empty_weight_kg ?? null,
    loaded_serial_no: payload.loaded_serial_no ?? null,
    loaded_vehicle_no: payload.loaded_vehicle_no ?? null,
    loaded_weighed_date: payload.loaded_weighed_date ?? null,
    loaded_weighed_time: payload.loaded_weighed_time ?? null,
    loaded_material: payload.loaded_material ?? null,
    loaded_gross_weight_kg: payload.loaded_gross_weight_kg ?? null,
    loaded_tare_weight_kg: payload.loaded_tare_weight_kg ?? null,
    loaded_net_weight_kg: payload.loaded_net_weight_kg ?? null,
    created_by: user.id,
  };

  const rec = await tx.weighmentRecord.create({ data });

  await tx.disposalInvoice.update({
    where: { id: disposal_invoice_id },
    data: summaryFromRecord(rec),
  });

  return rec;
}

/**
 * Save a weighment on its own, with no disposal invoice attached yet — e.g. a
 * vehicle has been weighed but the disposal items aren't finalized. Shows up
 * in the Recorded Weighments list immediately and can be edited/deleted there.
 */
export async function createStandaloneWeighmentRecord(payload, user) {
  if (!['SECURITY', 'IREP', 'ADMIN'].includes(user.role)) {
    throw new AppError('Only Security, IREP or Admin can record a weighment', 403, 'FORBIDDEN');
  }

  const hasEmpty = payload.empty_serial_no || payload.empty_vehicle_no || payload.empty_weight_kg != null;
  const hasLoaded = payload.loaded_serial_no || payload.loaded_vehicle_no || payload.loaded_gross_weight_kg != null || payload.loaded_net_weight_kg != null;
  if (!hasEmpty && !hasLoaded) {
    throw new AppError('Enter at least one weighment field before saving', 422, 'EMPTY_WEIGHMENT');
  }

  const data = {
    disposal_invoice_id: null,
    vehicle_no: payload.loaded_vehicle_no || payload.empty_vehicle_no || null,
    empty_serial_no: payload.empty_serial_no ?? null,
    empty_vehicle_no: payload.empty_vehicle_no ?? null,
    empty_weighed_date: payload.empty_weighed_date ?? null,
    empty_weighed_time: payload.empty_weighed_time ?? null,
    empty_weight_kg: payload.empty_weight_kg ?? null,
    loaded_serial_no: payload.loaded_serial_no ?? null,
    loaded_vehicle_no: payload.loaded_vehicle_no ?? null,
    loaded_weighed_date: payload.loaded_weighed_date ?? null,
    loaded_weighed_time: payload.loaded_weighed_time ?? null,
    loaded_material: payload.loaded_material ?? null,
    loaded_gross_weight_kg: payload.loaded_gross_weight_kg ?? null,
    loaded_tare_weight_kg: payload.loaded_tare_weight_kg ?? null,
    loaded_net_weight_kg: payload.loaded_net_weight_kg ?? null,
    created_by: user.id,
  };

  const rec = await prisma.weighmentRecord.create({ data });

  await logAudit({
    userId: user.id,
    action: 'WEIGHMENT_RECORD_CREATED',
    entity: 'weighment_records',
    entityId: rec.id,
    newValue: { vehicle_no: rec.vehicle_no, empty_weight_kg: rec.empty_weight_kg, loaded_gross_weight_kg: rec.loaded_gross_weight_kg },
  });

  return rec;
}

export async function getWeighmentRecords(query) {
  const page = Math.max(1, parseInt(query.page) || 1);
  const limit = Math.min(100, parseInt(query.limit) || 20);

  const [records, total] = await Promise.all([
    prisma.weighmentRecord.findMany({
      include: { creator: { select: { name: true, emp_no: true } }, invoice: { select: { invoice_no: true } } },
      orderBy: { created_at: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.weighmentRecord.count(),
  ]);

  return { items: records, total, page, limit, pages: Math.ceil(total / limit) };
}

/** Edit a weighment record (admin only) and keep the linked invoice's summary fields in sync. */
export async function editWeighmentRecord(id, updates, user) {
  if (user.role !== 'ADMIN') {
    throw new AppError('Only an Admin can edit a weighment record', 403, 'FORBIDDEN');
  }
  const existing = await prisma.weighmentRecord.findUnique({ where: { id } });
  if (!existing) throw new AppError('Weighment record not found', 404, 'NOT_FOUND');

  const next = {
    empty_serial_no: updates.empty_serial_no !== undefined ? updates.empty_serial_no : existing.empty_serial_no,
    empty_vehicle_no: updates.empty_vehicle_no !== undefined ? updates.empty_vehicle_no : existing.empty_vehicle_no,
    empty_weighed_date: updates.empty_weighed_date !== undefined ? updates.empty_weighed_date : existing.empty_weighed_date,
    empty_weighed_time: updates.empty_weighed_time !== undefined ? updates.empty_weighed_time : existing.empty_weighed_time,
    empty_weight_kg: updates.empty_weight_kg !== undefined ? updates.empty_weight_kg : existing.empty_weight_kg,
    loaded_serial_no: updates.loaded_serial_no !== undefined ? updates.loaded_serial_no : existing.loaded_serial_no,
    loaded_vehicle_no: updates.loaded_vehicle_no !== undefined ? updates.loaded_vehicle_no : existing.loaded_vehicle_no,
    loaded_weighed_date: updates.loaded_weighed_date !== undefined ? updates.loaded_weighed_date : existing.loaded_weighed_date,
    loaded_weighed_time: updates.loaded_weighed_time !== undefined ? updates.loaded_weighed_time : existing.loaded_weighed_time,
    loaded_material: updates.loaded_material !== undefined ? updates.loaded_material : existing.loaded_material,
    loaded_gross_weight_kg: updates.loaded_gross_weight_kg !== undefined ? updates.loaded_gross_weight_kg : existing.loaded_gross_weight_kg,
    loaded_tare_weight_kg: updates.loaded_tare_weight_kg !== undefined ? updates.loaded_tare_weight_kg : existing.loaded_tare_weight_kg,
    loaded_net_weight_kg: updates.loaded_net_weight_kg !== undefined ? updates.loaded_net_weight_kg : existing.loaded_net_weight_kg,
  };
  next.vehicle_no = next.loaded_vehicle_no || next.empty_vehicle_no || existing.vehicle_no;

  const updated = await prisma.$transaction(async (tx) => {
    const rec = await tx.weighmentRecord.update({ where: { id }, data: next });
    if (rec.disposal_invoice_id) {
      await tx.disposalInvoice.update({
        where: { id: rec.disposal_invoice_id },
        data: summaryFromRecord(rec),
      });
    }
    return rec;
  });

  await logAudit({
    userId: user.id,
    action: 'WEIGHMENT_RECORD_UPDATED',
    entity: 'weighment_records',
    entityId: id,
    oldValue: { empty_weight_kg: existing.empty_weight_kg, loaded_gross_weight_kg: existing.loaded_gross_weight_kg, loaded_net_weight_kg: existing.loaded_net_weight_kg },
    newValue: { empty_weight_kg: updated.empty_weight_kg, loaded_gross_weight_kg: updated.loaded_gross_weight_kg, loaded_net_weight_kg: updated.loaded_net_weight_kg },
  });

  return updated;
}

/** Delete a weighment record (admin only); clears the linked invoice's summary fields, doesn't touch its items/ledger. */
export async function deleteWeighmentRecord(id, user) {
  if (user.role !== 'ADMIN') {
    throw new AppError('Only an Admin can delete a weighment record', 403, 'FORBIDDEN');
  }
  const existing = await prisma.weighmentRecord.findUnique({ where: { id } });
  if (!existing) throw new AppError('Weighment record not found', 404, 'NOT_FOUND');

  await prisma.$transaction(async (tx) => {
    if (existing.disposal_invoice_id) {
      await tx.disposalInvoice.update({
        where: { id: existing.disposal_invoice_id },
        data: { vehicle_no: null, weighment_serial_no: null, gross_weight_kg: null, tare_weight_kg: null, net_weight_kg: null },
      });
    }
    await tx.weighmentRecord.delete({ where: { id } });
  });

  await logAudit({
    userId: user.id,
    action: 'WEIGHMENT_RECORD_DELETED',
    entity: 'weighment_records',
    entityId: id,
    oldValue: { vehicle_no: existing.vehicle_no },
  });

  return { id };
}
