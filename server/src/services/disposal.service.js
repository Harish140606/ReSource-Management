import prisma from '../utils/prisma.js';
import { AppError } from '../utils/AppError.js';
import { logAudit } from './audit.service.js';
import { getWasteTypeMap } from './referenceData.service.js';
import { parseDisposalInvoice } from './disposalParser.service.js';
import { matchCategory } from './disposalMatch.service.js';
import { createWeighmentRecordTx } from './weighment.service.js';

export const DISPOSAL_ROLES = ['SECURITY', 'IREP', 'ADMIN'];

const isoDay = (d) => new Date(d).toISOString().slice(0, 10);

/**
 * Choose the source (BAT/SOFT) whose latest entry holds the most stock — the
 * same source a disposal will be booked against. Defaults to BAT.
 */
async function pickSource(client, category, waste_type) {
  const rows = await client.generationDisposalLedger.findMany({
    where: { category, waste_type },
    orderBy: [{ date: 'asc' }, { created_at: 'asc' }],
  });
  if (!rows.length) return 'BAT';
  const latestBySource = {};
  for (const r of rows) latestBySource[r.source] = r; // ascending → last wins
  return Object.values(latestBySource)
    .sort((a, b) => Number(b.closing_stock) - Number(a.closing_stock))[0].source;
}

/**
 * Current available stock for a category = the closing balance of the most
 * recent ledger entry, on the source (BAT/SOFT) holding the most stock.
 * This is what is physically on hand now (all generation minus all disposals),
 * regardless of the invoice date. Returns { source, available }.
 */
async function getAvailableStock(client, category, waste_type) {
  const source = await pickSource(client, category, waste_type);
  const latest = await client.generationDisposalLedger.findFirst({
    where: { category, waste_type, source },
    orderBy: [{ date: 'desc' }, { created_at: 'desc' }],
  });
  return { source, available: latest ? Number(latest.closing_stock) : 0 };
}

/**
 * Public: current available stock for a category — used for live preview lookups.
 * waste_type is always resolved from the live, admin-managed reference data (not
 * a hardcoded list), so this matches whatever the declaration/Excel pipeline uses.
 */
export async function getStockFor(category) {
  const map = await getWasteTypeMap();
  const waste_type = map.get(category) ?? null;
  if (!waste_type) return { available: null, source: null, waste_type: null };
  const stock = await getAvailableStock(prisma, category, waste_type);
  return { ...stock, waste_type };
}

/** Parse a PDF buffer, attach a best-guess category and current available stock to each item. */
export async function parseInvoiceBuffer(buffer) {
  const { header, items } = await parseDisposalInvoice(buffer);
  const map = await getWasteTypeMap();
  const enriched = await Promise.all(items.map(async it => {
    const m = matchCategory(it.material_description);
    // matchCategory only fuzzy-matches the category name — always resolve the
    // actual waste_type from reference data, since the matcher's own list can
    // drift from admin edits.
    const waste_type = m.category ? (map.get(m.category) ?? null) : null;
    const stock = m.category && waste_type
      ? await getAvailableStock(prisma, m.category, waste_type)
      : { source: null, available: null };
    return {
      ...it,
      category: m.category,
      waste_type,
      match_confidence: m.confidence,
      available_stock: stock.available,
      stock_source: stock.source,
    };
  }));
  return { header, items: enriched };
}

/**
 * Subtract `qty` kg of disposal for a category on `date`, then recompute the
 * running opening/closing balances forward through every later ledger entry of
 * the same (category, waste_type, source) group. Runs inside the given tx.
 * Returns the ledger entry the disposal was booked against + the chosen source.
 */
async function applyDisposalTx(tx, { category, waste_type, date, qty }) {
  const allRows = await tx.generationDisposalLedger.findMany({
    where: { category, waste_type },
    orderBy: [{ date: 'asc' }, { created_at: 'asc' }],
  });

  // Target the source (BAT/SOFT) whose latest entry holds the most stock.
  const source = await pickSource(tx, category, waste_type);

  const target = new Date(date);
  const group = allRows.filter(r => r.source === source);

  // Find (or create) the ledger row for the disposal date.
  let dayRow = group.find(r => isoDay(r.date) === isoDay(target));
  if (!dayRow) {
    const before = [...group].reverse().find(r => new Date(r.date) < target);
    const opening = before ? Number(before.closing_stock) : 0;
    dayRow = await tx.generationDisposalLedger.create({
      data: {
        date: target, category, waste_type, source,
        opening_stock: opening, waste_for_day: 0, disposal: 0, closing_stock: opening,
        declaration_id: null,
      },
    });
  }

  // Book the disposal onto that row.
  const newDisposal = Number(dayRow.disposal) + qty;
  await tx.generationDisposalLedger.update({
    where: { id: dayRow.id },
    data: {
      disposal: newDisposal,
      closing_stock: Number(dayRow.opening_stock) + Number(dayRow.waste_for_day) - newDisposal,
    },
  });

  // Cascade running balance forward through the whole group.
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

  return { ledger_entry_id: dayRow.id, source };
}

/** Persist a parsed/confirmed disposal invoice and subtract its quantities from the ledger. */
export async function createDisposalInvoice(payload, user) {
  if (!DISPOSAL_ROLES.includes(user.role)) {
    throw new AppError('Only Security, IREP or Admin can record disposals', 403, 'FORBIDDEN');
  }

  // Manual disposals may arrive without an invoice number or vendor — generate a
  // unique reference and fall back to a generic vendor so the ledger stays consistent.
  const pad = (n) => String(n).padStart(2, '0');
  const now = new Date();
  const invoice_no = payload.invoice_no?.trim()
    || `MAN-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}-${Math.floor(Math.random() * 1000)}`;
  const vendor_name = payload.vendor_name?.trim() || 'Manual Disposal';
  payload = { ...payload, invoice_no, vendor_name };

  const existing = await prisma.disposalInvoice.findUnique({ where: { invoice_no: payload.invoice_no } });
  if (existing) throw new AppError('This invoice has already been recorded', 409, 'DUPLICATE_INVOICE');

  const wasteTypeMap = await getWasteTypeMap();

  // Every line must resolve to a known category before we touch the ledger.
  const unmatched = payload.items.filter(it => !it.category || !wasteTypeMap.get(it.category));
  if (unmatched.length) {
    throw new AppError(
      `Unrecognised material(s): ${unmatched.map(i => i.material_description).join(', ')}`,
      422, 'UNMATCHED_CATEGORY',
    );
  }

  // Stock guard (hard block): a disposal can never exceed the current stock on hand.
  const fmt = (n) => Number(Number(n).toFixed(3));
  const byCat = new Map();
  for (const it of payload.items) byCat.set(it.category, (byCat.get(it.category) || 0) + it.qty_kg);
  const shortfalls = [];
  for (const [category, qty] of byCat) {
    const { available } = await getAvailableStock(prisma, category, wasteTypeMap.get(category));
    if (qty > available) shortfalls.push({ category, qty, available });
  }
  if (shortfalls.length) {
    const detail = shortfalls
      .map(s => `${s.category}: tried ${fmt(s.qty)} kg but only ${fmt(s.available)} kg in stock`)
      .join('; ');
    throw new AppError(`Disposal not possible — exceeds available stock. ${detail}`, 422, 'INSUFFICIENT_STOCK');
  }

  const invoice = await prisma.$transaction(async (tx) => {
    const inv = await tx.disposalInvoice.create({
      data: {
        invoice_no: payload.invoice_no,
        invoice_date: new Date(payload.invoice_date),
        vendor_name: payload.vendor_name,
        vendor_gstin: payload.vendor_gstin ?? null,
        total_net_amount: payload.total_net_amount ?? null,
        total_tax: payload.total_tax ?? null,
        total_amount: payload.total_amount ?? null,
        source_file: payload.source_file ?? null,
        vehicle_no: payload.vehicle_no ?? null,
        weighment_serial_no: payload.weighment_serial_no ?? null,
        gross_weight_kg: payload.gross_weight_kg ?? null,
        tare_weight_kg: payload.tare_weight_kg ?? null,
        net_weight_kg: payload.net_weight_kg ?? null,
        created_by: user.id,
      },
    });

    await createWeighmentRecordTx(tx, { disposal_invoice_id: inv.id, payload, user });

    for (const it of payload.items) {
      const waste_type = wasteTypeMap.get(it.category);
      const { ledger_entry_id, source } = await applyDisposalTx(tx, {
        category: it.category, waste_type, date: payload.invoice_date, qty: it.qty_kg,
      });
      await tx.disposalInvoiceItem.create({
        data: {
          disposal_invoice_id: inv.id,
          material_description: it.material_description,
          category: it.category,
          waste_type,
          source,
          qty_kg: it.qty_kg,
          unit_price: it.unit_price ?? null,
          ledger_entry_id,
        },
      });
    }
    return inv;
  });

  await logAudit({
    userId: user.id,
    action: 'DISPOSAL_INVOICE_RECORDED',
    entity: 'disposal_invoices',
    entityId: invoice.id,
    newValue: { invoice_no: invoice.invoice_no, vendor_name: invoice.vendor_name, items: payload.items.length },
  });

  return getDisposalInvoiceById(invoice.id);
}

/**
 * Reverse a single disposal line: add `qty` back by reducing the booked row's
 * disposal, then recompute running balances forward through the whole
 * (category, waste_type, source) group. Mirror of applyDisposalTx.
 */
async function reverseDisposalTx(tx, { ledger_entry_id, category, waste_type, source, qty }) {
  const row = ledger_entry_id
    ? await tx.generationDisposalLedger.findUnique({ where: { id: ledger_entry_id } })
    : null;
  if (row) {
    const newDisposal = Math.max(0, Number(row.disposal) - qty);
    await tx.generationDisposalLedger.update({
      where: { id: row.id },
      data: {
        disposal: newDisposal,
        closing_stock: Number(row.opening_stock) + Number(row.waste_for_day) - newDisposal,
      },
    });
  }

  const group = await tx.generationDisposalLedger.findMany({
    where: { category, waste_type, source },
    orderBy: [{ date: 'asc' }, { created_at: 'asc' }],
  });
  let prevClosing = null;
  for (const r of group) {
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

/** Delete a recorded disposal invoice (admin only) and add its quantities back to stock. */
export async function deleteDisposalInvoice(id, user) {
  if (user.role !== 'ADMIN') {
    throw new AppError('Only an Admin can delete a recorded disposal', 403, 'FORBIDDEN');
  }

  const invoice = await prisma.disposalInvoice.findUnique({ where: { id }, include: { items: true } });
  if (!invoice) throw new AppError('Disposal not found', 404, 'NOT_FOUND');

  await prisma.$transaction(async (tx) => {
    for (const it of invoice.items) {
      await reverseDisposalTx(tx, {
        ledger_entry_id: it.ledger_entry_id,
        category: it.category,
        waste_type: it.waste_type,
        source: it.source,
        qty: Number(it.qty_kg),
      });
    }
    await tx.disposalInvoice.delete({ where: { id } }); // items cascade-delete
  });

  await logAudit({
    userId: user.id,
    action: 'DISPOSAL_INVOICE_DELETED',
    entity: 'disposal_invoices',
    entityId: id,
    oldValue: { invoice_no: invoice.invoice_no, vendor_name: invoice.vendor_name, items: invoice.items.length },
  });

  return { id };
}

/** Remove a single item from a recorded disposal invoice (admin only) and add its quantity back to stock. */
export async function deleteDisposalItem(invoiceId, itemId, user) {
  if (user.role !== 'ADMIN') {
    throw new AppError('Only an Admin can edit a recorded disposal', 403, 'FORBIDDEN');
  }

  const invoice = await prisma.disposalInvoice.findUnique({ where: { id: invoiceId }, include: { items: true } });
  if (!invoice) throw new AppError('Disposal not found', 404, 'NOT_FOUND');
  const item = invoice.items.find(it => it.id === itemId);
  if (!item) throw new AppError('Item not found on this disposal', 404, 'NOT_FOUND');

  await prisma.$transaction(async (tx) => {
    await reverseDisposalTx(tx, {
      ledger_entry_id: item.ledger_entry_id,
      category: item.category,
      waste_type: item.waste_type,
      source: item.source,
      qty: Number(item.qty_kg),
    });
    await tx.disposalInvoiceItem.delete({ where: { id: itemId } });
  });

  await logAudit({
    userId: user.id,
    action: 'DISPOSAL_ITEM_DELETED',
    entity: 'disposal_invoices',
    entityId: invoiceId,
    oldValue: { category: item.category, qty_kg: item.qty_kg },
  });

  return getDisposalInvoiceById(invoiceId);
}

/**
 * Edit a single disposal invoice item (description/category/qty/price), admin only.
 * Reverses the old ledger contribution and reapplies the new one, with the same
 * stock guard used when first recording a disposal.
 */
export async function editDisposalItem(invoiceId, itemId, updates, user) {
  if (user.role !== 'ADMIN') {
    throw new AppError('Only an Admin can edit a recorded disposal', 403, 'FORBIDDEN');
  }

  const invoice = await prisma.disposalInvoice.findUnique({ where: { id: invoiceId }, include: { items: true } });
  if (!invoice) throw new AppError('Disposal not found', 404, 'NOT_FOUND');
  const item = invoice.items.find(it => it.id === itemId);
  if (!item) throw new AppError('Item not found on this disposal', 404, 'NOT_FOUND');

  const next = {
    material_description: updates.material_description ?? item.material_description,
    category: updates.category ?? item.category,
    qty_kg: updates.qty_kg !== undefined ? updates.qty_kg : Number(item.qty_kg),
    unit_price: updates.unit_price !== undefined ? updates.unit_price : item.unit_price,
  };

  const wasteTypeMap = await getWasteTypeMap();
  const waste_type = wasteTypeMap.get(next.category);
  if (!waste_type) throw new AppError(`Unrecognised category: ${next.category}`, 422, 'UNMATCHED_CATEGORY');

  await prisma.$transaction(async (tx) => {
    await reverseDisposalTx(tx, {
      ledger_entry_id: item.ledger_entry_id,
      category: item.category,
      waste_type: item.waste_type,
      source: item.source,
      qty: Number(item.qty_kg),
    });

    const { available } = await getAvailableStock(tx, next.category, waste_type);
    if (next.qty_kg > available) {
      throw new AppError(
        `Disposal not possible — exceeds available stock. ${next.category}: tried ${next.qty_kg} kg but only ${available} kg in stock`,
        422, 'INSUFFICIENT_STOCK',
      );
    }

    const { ledger_entry_id, source } = await applyDisposalTx(tx, {
      category: next.category, waste_type, date: invoice.invoice_date, qty: next.qty_kg,
    });

    await tx.disposalInvoiceItem.update({
      where: { id: itemId },
      data: {
        material_description: next.material_description,
        category: next.category,
        waste_type,
        source,
        qty_kg: next.qty_kg,
        unit_price: next.unit_price,
        ledger_entry_id,
      },
    });
  });

  await logAudit({
    userId: user.id,
    action: 'DISPOSAL_ITEM_UPDATED',
    entity: 'disposal_invoices',
    entityId: invoiceId,
    oldValue: { category: item.category, qty_kg: item.qty_kg },
    newValue: { category: next.category, qty_kg: next.qty_kg },
  });

  return getDisposalInvoiceById(invoiceId);
}

/**
 * Attach `remaining_stock_kg` to each invoice item — the closing stock of the
 * ledger row that disposal was booked against, i.e. what's left in the
 * factory for that category right after this disposal was applied.
 */
async function attachRemainingStock(invoices) {
  const list = Array.isArray(invoices) ? invoices : [invoices];
  const ids = [...new Set(list.flatMap(inv => inv.items.map(it => it.ledger_entry_id)).filter(Boolean))];
  if (ids.length) {
    const rows = await prisma.generationDisposalLedger.findMany({
      where: { id: { in: ids } },
      select: { id: true, closing_stock: true },
    });
    const map = new Map(rows.map(r => [r.id, Number(r.closing_stock)]));
    for (const inv of list) {
      for (const it of inv.items) {
        it.remaining_stock_kg = it.ledger_entry_id != null ? (map.get(it.ledger_entry_id) ?? null) : null;
      }
    }
  }
  return invoices;
}

export async function getDisposalInvoiceById(id) {
  const invoice = await prisma.disposalInvoice.findUnique({
    where: { id },
    include: { items: true, creator: { select: { name: true, emp_no: true } }, weighment: true },
  });
  if (!invoice) return invoice;
  return attachRemainingStock(invoice);
}

export async function getDisposalInvoices(query) {
  const page = Math.max(1, parseInt(query.page) || 1);
  const limit = Math.min(100, parseInt(query.limit) || 20);

  const where = {};
  if (query.date_from) where.invoice_date = { ...where.invoice_date, gte: new Date(query.date_from) };
  if (query.date_to) where.invoice_date = { ...where.invoice_date, lte: new Date(query.date_to + 'T23:59:59Z') };

  const [items, total] = await Promise.all([
    prisma.disposalInvoice.findMany({
      where,
      include: { items: true, creator: { select: { name: true, emp_no: true } }, weighment: true },
      orderBy: { created_at: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.disposalInvoice.count({ where }),
  ]);

  await attachRemainingStock(items);
  return { items, total, page, limit, pages: Math.ceil(total / limit) };
}
