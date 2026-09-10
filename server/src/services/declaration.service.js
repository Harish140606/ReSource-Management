import dayjs from 'dayjs';
import prisma from '../utils/prisma.js';
import { AppError } from '../utils/AppError.js';
import { logAudit } from './audit.service.js';
import { notifySubmitted, notifyDeptApproved, notifyIrepAuthorized, notifyCompleted } from './email.service.js';
import { triggerExport } from './excel.service.js';

async function generateDeclarationNo() {
  const today = dayjs().format('YYYYMMDD');
  const prefix = `DCL-${today}-`;
  const last = await prisma.scrapDeclaration.findFirst({
    where: { declaration_no: { startsWith: prefix } },
    orderBy: { declaration_no: 'desc' },
  });
  const seq = last ? parseInt(last.declaration_no.split('-')[2]) + 1 : 1;
  return `${prefix}${String(seq).padStart(4, '0')}`;
}

// Reference number — "<SOURCE>-NNN", numbered per source (e.g. BAT-001, SOFT-001)
export async function generateReferenceNo(source = 'BAT') {
  const count = await prisma.scrapDeclaration.count({ where: { source } });
  return `${source}-${String(count + 1).padStart(3, '0')}`;
}

const STATUS_FLOW = {
  DRAFT: 'SUBMITTED',
  SUBMITTED: 'DEPT_APPROVED',
  DEPT_APPROVED: 'IREP_AUTHORIZED',
  IREP_AUTHORIZED: 'COMPLETED',
};

const APPROVER_ROLE_FOR_STATUS = {
  SUBMITTED:          ['DEPT_HEAD', 'IREP', 'SECURITY', 'FACILITY_MANAGER', 'ADMIN'],
  DEPT_APPROVED:      ['IREP', 'FACILITY_MANAGER', 'ADMIN'],
  IREP_AUTHORIZED:    ['SECURITY', 'FACILITY_MANAGER', 'ADMIN'],
};

function sourceFromFunction(fn) {
  return ['SMT', 'MFT'].includes(fn) ? 'BAT' : 'SOFT';
}

export async function createDeclaration(body, user) {
  const declaration_no = await generateDeclarationNo();
  const source = body.source || sourceFromFunction(body.production_function);
  const reference_no = await generateReferenceNo(source);

  const decl = await prisma.scrapDeclaration.create({
    data: {
      declaration_no,
      employee_id: user.id,
      date: new Date(body.date),
      shift: body.shift,
      time: body.time,
      zone: body.zone,
      production_function: body.production_function,
      source,
      reference_no,
      disposal_route: body.disposal_route,
      status: 'DRAFT',
      line_items: {
        create: body.line_items.map(li => ({
          waste_type: li.waste_type,
          category: li.category,
          pallet_qty: li.pallet_qty ?? null,
          weight_kg: li.weight_kg ?? null,
          remarks: li.remarks ?? null,
          bat_id: li.bat_id ?? null,
        })),
      },
    },
    include: { line_items: true },
  });

  await logAudit({
    userId: user.id,
    action: 'DECLARATION_CREATED',
    entity: 'scrap_declarations',
    entityId: decl.id,
    newValue: { declaration_no, status: 'DRAFT' },
  });

  return decl;
}

export async function updateDeclaration(id, body, user) {
  const decl = await prisma.scrapDeclaration.findUnique({ where: { id } });
  if (!decl) throw new AppError('Declaration not found', 404, 'NOT_FOUND');
  if (decl.status !== 'DRAFT') throw new AppError('Only DRAFT declarations can be edited', 409, 'CONFLICT');
  if (decl.employee_id !== user.id && user.role !== 'ADMIN') {
    throw new AppError('Cannot edit another user\'s declaration', 403, 'FORBIDDEN');
  }

  const source = body.source || sourceFromFunction(body.production_function);

  // Replace all line items and update header atomically
  await prisma.declarationLineItem.deleteMany({ where: { declaration_id: id } });

  const updated = await prisma.scrapDeclaration.update({
    where: { id },
    data: {
      date: new Date(body.date),
      shift: body.shift,
      time: body.time,
      zone: body.zone,
      production_function: body.production_function,
      source,
      disposal_route: body.disposal_route,
      line_items: {
        create: body.line_items.map(li => ({
          waste_type: li.waste_type,
          category: li.category,
          pallet_qty: li.pallet_qty ?? null,
          weight_kg: li.weight_kg ?? null,
          remarks: li.remarks ?? null,
          bat_id: li.bat_id ?? null,
        })),
      },
    },
    include: { line_items: true },
  });

  await logAudit({
    userId: user.id,
    action: 'DECLARATION_UPDATED',
    entity: 'scrap_declarations',
    entityId: id,
    newValue: { status: 'DRAFT' },
  });

  return updated;
}

// Subtracts `weight_kg` from the existing day's waste_for_day for this
// (category, waste_type, source), then cascades the running balance forward
// through the whole group — the inverse of createLedgerEntries' accumulation.
// Since a single ledger row can now hold contributions from multiple
// declarations (after the same-day-merge fix), this never deletes a row —
// only adjusts the amount, so other declarations sharing that row are unaffected.
async function reverseLedgerContribution(tx, { category, waste_type, source, date, weight_kg }) {
  if (!weight_kg || Number(weight_kg) <= 0) return;
  const group = await tx.generationDisposalLedger.findMany({
    where: { category, waste_type, source },
    orderBy: [{ date: 'asc' }, { created_at: 'asc' }],
  });
  const dayRow = group.find(r => isoDay(r.date) === isoDay(date));
  if (!dayRow) return;

  await tx.generationDisposalLedger.update({
    where: { id: dayRow.id },
    data: { waste_for_day: Math.max(0, Number(dayRow.waste_for_day) - Number(weight_kg)) },
  });

  const fresh = await tx.generationDisposalLedger.findMany({
    where: { category, waste_type, source },
    orderBy: [{ date: 'asc' }, { created_at: 'asc' }],
  });
  let prevClosing = null;
  for (const r of fresh) {
    const opening = prevClosing === null ? Number(r.opening_stock) : prevClosing;
    const closing = opening + Number(r.waste_for_day) - Number(r.disposal);
    if (opening !== Number(r.opening_stock) || closing !== Number(r.closing_stock)) {
      await tx.generationDisposalLedger.update({
        where: { id: r.id },
        data: { opening_stock: opening, closing_stock: closing },
      });
    }
    prevClosing = closing;
  }
}

export async function deleteDeclaration(id, user) {
  const decl = await prisma.scrapDeclaration.findUnique({ where: { id }, include: { line_items: true } });
  if (!decl) throw new AppError('Declaration not found', 404, 'NOT_FOUND');
  if (decl.employee_id !== user.id && user.role !== 'ADMIN') {
    throw new AppError('Cannot delete another user\'s declaration', 403, 'FORBIDDEN');
  }

  await prisma.$transaction(async (tx) => {
    if (decl.status === 'COMPLETED') {
      for (const li of decl.line_items) {
        await reverseLedgerContribution(tx, {
          category: li.category, waste_type: li.waste_type, source: decl.source,
          date: decl.date, weight_kg: li.weight_kg,
        });
      }
    }
    // Ledger rows may be shared with other declarations now — detach this
    // declaration's reference rather than deleting the rows themselves.
    await tx.generationDisposalLedger.updateMany({ where: { declaration_id: id }, data: { declaration_id: null } });
    await tx.excelExportLog.deleteMany({ where: { declaration_id: id } });
    await tx.scrapDeclaration.delete({ where: { id } }); // line_items cascade-delete
  });

  await logAudit({
    userId: user.id,
    action: 'DECLARATION_DELETED',
    entity: 'scrap_declarations',
    entityId: id,
    oldValue: { declaration_no: decl.declaration_no, status: decl.status },
  });
}

/** Remove a single line item from a declaration without touching the others — Admin only. */
export async function deleteLineItem(declarationId, lineItemId, user) {
  if (user.role !== 'ADMIN') {
    throw new AppError('Only an Admin can remove a single line item', 403, 'FORBIDDEN');
  }

  const decl = await prisma.scrapDeclaration.findUnique({ where: { id: declarationId }, include: { line_items: true } });
  if (!decl) throw new AppError('Declaration not found', 404, 'NOT_FOUND');

  const li = decl.line_items.find(x => x.id === lineItemId);
  if (!li) throw new AppError('Line item not found on this declaration', 404, 'NOT_FOUND');

  await prisma.$transaction(async (tx) => {
    if (decl.status === 'COMPLETED') {
      await reverseLedgerContribution(tx, {
        category: li.category, waste_type: li.waste_type, source: decl.source,
        date: decl.date, weight_kg: li.weight_kg,
      });
    }
    await tx.declarationLineItem.delete({ where: { id: lineItemId } });
  });

  await logAudit({
    userId: user.id,
    action: 'LINE_ITEM_DELETED',
    entity: 'scrap_declarations',
    entityId: declarationId,
    oldValue: { category: li.category, weight_kg: li.weight_kg, waste_type: li.waste_type },
  });

  return getDeclarationById(declarationId, user);
}

/**
 * Edit a single line item's category/weight/pallet_qty/remarks/bat_id without
 * touching any other line item — Admin only. If the declaration is COMPLETED,
 * reverses the old weight's ledger contribution and applies the new one
 * (covers a category change too, since the reversal/application target the
 * category recorded on each side).
 */
export async function editLineItem(declarationId, lineItemId, updates, user) {
  if (user.role !== 'ADMIN') {
    throw new AppError('Only an Admin can edit a single line item', 403, 'FORBIDDEN');
  }

  const decl = await prisma.scrapDeclaration.findUnique({ where: { id: declarationId }, include: { line_items: true } });
  if (!decl) throw new AppError('Declaration not found', 404, 'NOT_FOUND');

  const li = decl.line_items.find(x => x.id === lineItemId);
  if (!li) throw new AppError('Line item not found on this declaration', 404, 'NOT_FOUND');

  const next = {
    category: updates.category ?? li.category,
    waste_type: updates.waste_type ?? li.waste_type,
    weight_kg: updates.weight_kg !== undefined ? updates.weight_kg : li.weight_kg,
    pallet_qty: updates.pallet_qty !== undefined ? updates.pallet_qty : li.pallet_qty,
    remarks: updates.remarks !== undefined ? updates.remarks : li.remarks,
    bat_id: updates.bat_id !== undefined ? updates.bat_id : li.bat_id,
  };

  await prisma.$transaction(async (tx) => {
    if (decl.status === 'COMPLETED') {
      await reverseLedgerContribution(tx, {
        category: li.category, waste_type: li.waste_type, source: decl.source,
        date: decl.date, weight_kg: li.weight_kg,
      });
      await addLedgerContribution(tx, {
        category: next.category, waste_type: next.waste_type, source: decl.source,
        date: decl.date, weight_kg: next.weight_kg, declaration_id: declarationId,
      });
    }
    await tx.declarationLineItem.update({ where: { id: lineItemId }, data: next });
  });

  await logAudit({
    userId: user.id,
    action: 'LINE_ITEM_UPDATED',
    entity: 'scrap_declarations',
    entityId: declarationId,
    oldValue: { category: li.category, weight_kg: li.weight_kg },
    newValue: { category: next.category, weight_kg: next.weight_kg },
  });

  return getDeclarationById(declarationId, user);
}

export async function updateStorageLocations(id, items, user) {
  if (!['IREP', 'ADMIN'].includes(user.role)) {
    throw new AppError('Only IREP or Admin can set storage location', 403, 'FORBIDDEN');
  }

  const decl = await prisma.scrapDeclaration.findUnique({ where: { id }, include: { line_items: true } });
  if (!decl) throw new AppError('Declaration not found', 404, 'NOT_FOUND');

  const validIds = new Set(decl.line_items.map(li => li.id));
  for (const item of items) {
    if (!validIds.has(item.line_item_id)) {
      throw new AppError('Line item does not belong to this declaration', 422, 'VALIDATION_ERROR');
    }
  }

  await prisma.$transaction(
    items.map(item => prisma.declarationLineItem.update({
      where: { id: item.line_item_id },
      data: { storage_location: item.storage_location },
    }))
  );

  await logAudit({
    userId: user.id,
    action: 'STORAGE_LOCATION_UPDATED',
    entity: 'scrap_declarations',
    entityId: id,
    newValue: { items },
  });

  return getDeclarationById(id, user);
}

export async function submitDeclaration(id, user, ipAddress) {
  const decl = await prisma.scrapDeclaration.findUnique({ where: { id }, include: { line_items: true } });
  if (!decl) throw new AppError('Declaration not found', 404, 'NOT_FOUND');
  if (decl.employee_id !== user.id && user.role !== 'ADMIN') {
    throw new AppError('Cannot submit another user\'s declaration', 403, 'FORBIDDEN');
  }
  if (decl.status !== 'DRAFT') throw new AppError('Only DRAFT declarations can be submitted', 409, 'CONFLICT');

  const hasWeight = decl.line_items.some(li => li.weight_kg && Number(li.weight_kg) > 0);
  if (!hasWeight) throw new AppError('At least one line item must have weight > 0', 422, 'VALIDATION_ERROR');

  const updated = await prisma.scrapDeclaration.update({
    where: { id },
    data: { status: 'SUBMITTED' },
  });

  await logAudit({
    userId: user.id,
    action: 'DECLARATION_SUBMITTED',
    entity: 'scrap_declarations',
    entityId: id,
    oldValue: { status: 'DRAFT' },
    newValue: { status: 'SUBMITTED' },
    ipAddress,
  });

  // Notify dept heads — fire-and-forget so email outage never blocks submission.
  notifySubmitted({ ...decl, ...updated }).catch(err =>
    console.error('[Email] notifySubmitted failed:', err.message));

  return updated;
}

export async function approveDeclaration(id, user, ipAddress) {
  const decl = await prisma.scrapDeclaration.findUnique({ where: { id }, include: { line_items: true } });
  if (!decl) throw new AppError('Declaration not found', 404, 'NOT_FOUND');

  const allowedRoles = APPROVER_ROLE_FOR_STATUS[decl.status];
  if (!allowedRoles) throw new AppError('Declaration cannot be approved at this status', 409, 'CONFLICT');
  if (!allowedRoles.includes(user.role)) {
    throw new AppError('Your role cannot approve at this stage', 403, 'FORBIDDEN');
  }

  const newStatus = STATUS_FLOW[decl.status];
  const now = new Date();

  const updateData = { status: newStatus };
  if (decl.status === 'SUBMITTED') { updateData.dept_head_id = user.id; updateData.dept_approved_at = now; }
  if (decl.status === 'DEPT_APPROVED') { updateData.irep_auth_by = user.id; updateData.irep_authorized_at = now; }
  // Security authorization is the final step — it completes the declaration.
  if (decl.status === 'IREP_AUTHORIZED') {
    updateData.security_auth_by = user.id;
    updateData.security_authorized_at = now;
    updateData.completed_at = now;
  }

  const updated = await prisma.scrapDeclaration.update({ where: { id }, data: updateData });

  await logAudit({
    userId: user.id,
    action: 'DECLARATION_APPROVED',
    entity: 'scrap_declarations',
    entityId: id,
    oldValue: { status: decl.status },
    newValue: { status: newStatus },
    ipAddress,
  });

  // Notify next approver (or declarer on completion) — fire-and-forget.
  const declWithItems = { ...decl, ...updated };
  if (newStatus === 'DEPT_APPROVED')    notifyDeptApproved(declWithItems).catch(e => console.error('[Email] notifyDeptApproved:', e.message));
  if (newStatus === 'IREP_AUTHORIZED')  notifyIrepAuthorized(declWithItems).catch(e => console.error('[Email] notifyIrepAuthorized:', e.message));
  if (newStatus === 'COMPLETED')        notifyCompleted(declWithItems).catch(e => console.error('[Email] notifyCompleted:', e.message));

  // Post-completion: create ledger entries + trigger Excel export
  if (newStatus === 'COMPLETED') {
    await createLedgerEntries(decl);
    triggerExport(id, 'DECLARATION_COMPLETED').catch(err =>
      console.error('[ExcelExport] Auto-export failed:', err.message)
    );
  }

  return updated;
}

// isoDay/cascade pattern mirrors applyDisposalTx in disposal.service.js — keeps
// exactly one ledger row per (date, category, waste_type, source), updating it
// in place when one already exists for that day instead of inserting a new,
// disconnected row (which previously broke the running-balance chain and let
// stock go negative).
const isoDay = (d) => new Date(d).toISOString().slice(0, 10);

// Adds `weight_kg` to the day's waste_for_day for this (category, waste_type,
// source) — finding or creating the day's row — then cascades the running
// balance forward through the whole group. Inverse of reverseLedgerContribution.
async function addLedgerContribution(tx, { category, waste_type, source, date, weight_kg, declaration_id = null }) {
  if (!weight_kg || Number(weight_kg) <= 0) return;
  const waste = Number(weight_kg);

  const group = await tx.generationDisposalLedger.findMany({
    where: { category, waste_type, source },
    orderBy: [{ date: 'asc' }, { created_at: 'asc' }],
  });

  const dayRow = group.find(r => isoDay(r.date) === isoDay(date));
  if (dayRow) {
    await tx.generationDisposalLedger.update({
      where: { id: dayRow.id },
      data: { waste_for_day: Number(dayRow.waste_for_day) + waste },
    });
  } else {
    const before = [...group].reverse().find(r => new Date(r.date) < new Date(date));
    const opening = before ? Number(before.closing_stock) : 0;
    await tx.generationDisposalLedger.create({
      data: {
        date, category, waste_type, source,
        opening_stock: opening, waste_for_day: waste, disposal: 0, closing_stock: opening + waste,
        declaration_id,
      },
    });
  }

  // Cascade the running balance forward through the whole group.
  const fresh = await tx.generationDisposalLedger.findMany({
    where: { category, waste_type, source },
    orderBy: [{ date: 'asc' }, { created_at: 'asc' }],
  });
  let prevClosing = null;
  for (const r of fresh) {
    const opening = prevClosing === null ? Number(r.opening_stock) : prevClosing;
    const closing = opening + Number(r.waste_for_day) - Number(r.disposal);
    if (opening !== Number(r.opening_stock) || closing !== Number(r.closing_stock)) {
      await tx.generationDisposalLedger.update({
        where: { id: r.id },
        data: { opening_stock: opening, closing_stock: closing },
      });
    }
    prevClosing = closing;
  }
}

async function createLedgerEntries(decl) {
  const date = decl.date;
  for (const li of decl.line_items) {
    if (!li.weight_kg || Number(li.weight_kg) <= 0) continue;
    await prisma.$transaction(async (tx) => {
      await addLedgerContribution(tx, {
        category: li.category, waste_type: li.waste_type, source: decl.source,
        date, weight_kg: li.weight_kg, declaration_id: decl.id,
      });
    });
  }
}

export async function getDeclarations(query, user) {
  const where = {};

  // Non-admin/manager only see their own
  if (user.role === 'EMPLOYEE') where.employee_id = user.id;

  if (query.date_from) where.date = { ...where.date, gte: new Date(query.date_from) };
  if (query.date_to) where.date = { ...where.date, lte: new Date(query.date_to + 'T23:59:59Z') };
  if (query.status) where.status = query.status;
  if (query.source) where.source = query.source;
  if (query.function) where.production_function = query.function;
  if (query.zone) where.zone = query.zone;

  const page = Math.max(1, parseInt(query.page) || 1);
  const limit = Math.min(100, parseInt(query.limit) || 20);

  // Sort the whole matching result set, not just the current page.
  const SORTABLE_FIELDS = {
    declaration_no: 'declaration_no',
    date: 'date',
    zone: 'zone',
    function: 'production_function',
    source: 'source',
    disposal_route: 'disposal_route',
    status: 'status',
  };
  const sortField = SORTABLE_FIELDS[query.sort_by];
  const sortDir = query.sort_dir === 'desc' ? 'desc' : 'asc';
  const orderBy = sortField ? { [sortField]: sortDir } : { created_at: 'desc' };

  const [items, total] = await Promise.all([
    prisma.scrapDeclaration.findMany({
      where,
      include: {
        employee: { select: { name: true, emp_no: true } },
        line_items: true,
      },
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.scrapDeclaration.count({ where }),
  ]);

  return { items, total, page, limit, pages: Math.ceil(total / limit) };
}

export async function getDeclarationById(id, user) {
  const decl = await prisma.scrapDeclaration.findUnique({
    where: { id },
    include: {
      employee: { select: { name: true, emp_no: true, zone: true, production_function: true } },
      dept_head: { select: { name: true, emp_no: true } },
      irep_authorizer: { select: { name: true, emp_no: true } },
      security_authorizer: { select: { name: true, emp_no: true } },
      line_items: true,
    },
  });

  if (!decl) throw new AppError('Declaration not found', 404, 'NOT_FOUND');
  if (user.role === 'EMPLOYEE' && decl.employee_id !== user.id) {
    throw new AppError('Access denied', 403, 'FORBIDDEN');
  }
  return decl;
}
