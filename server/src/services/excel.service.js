import ExcelJS from 'exceljs';
import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat.js';
import prisma from '../utils/prisma.js';
import { saveReportLocally } from './localExport.service.js';

dayjs.extend(customParseFormat);

// Category lists are loaded from the database at report-generation time so
// that admin additions/removals are reflected without a code deploy.
async function loadCategoryLists() {
  const rows = await prisma.referenceData.findMany({
    where: { type: 'WASTE_CATEGORY', is_active: true },
    orderBy: [{ sort_order: 'asc' }],
  });
  const filter = (source, wt) => rows.filter(r => r.metadata?.source === source && r.metadata?.waste_type === wt).map(r => r.code);
  return {
    GENERAL_CATEGORIES:      filter('SOFT', 'GENERAL'),
    HAZARDOUS_CATEGORIES:    filter('SOFT', 'HAZARDOUS'),
    EWASTE_CATEGORIES:       filter('SOFT', 'EWASTE'),
    BAT_GENERAL_CATEGORIES:  filter('BAT',  'GENERAL'),
    BAT_HAZARDOUS_CATEGORIES:filter('BAT',  'HAZARDOUS'),
    BAT_EWASTE_CATEGORIES:   filter('BAT',  'EWASTE'),
  };
}

// ── Colour palette ────────────────────────────────────────────────────────────
const BRAND_PRIMARY  = 'FF00838F';
const BRAND_DARK  = 'FF10262A';

// Alternating group header colours (two shades so adjacent categories are distinct)
const GROUP_FILLS  = ['FFE07070', 'FFFFC000'];   // salmon / amber
const GROUP_LIGHT  = ['FFFFC8C8', 'FFFFFF99'];   // light salmon / light yellow
const ALT_ROW_FILL = 'FFF5F7FF';

// When a report is restricted to a date range, the pivot must not start
// every category's running stock at zero on day one of the range — it has
// to carry forward whatever was actually on hand right before the range
// started. This returns { category -> closing_stock } as of the last
// ledger entry strictly before `dateFrom`, for one (source, waste_type) group.
async function getOpeningBalances(dateFrom, source, waste_type) {
  if (!dateFrom) return {};
  const rows = await prisma.generationDisposalLedger.findMany({
    where: { source, waste_type, date: { lt: new Date(dateFrom) } },
    orderBy: [{ date: 'desc' }, { created_at: 'desc' }],
  });
  const seen = new Set();
  const balances = {};
  for (const r of rows) {
    if (seen.has(r.category)) continue;
    seen.add(r.category);
    balances[r.category] = Number(r.closing_stock);
  }
  return balances;
}

// ── Pivot sheet builder ───────────────────────────────────────────────────────
// `orderedCategories` is the live, currently-active list from Reference Data
// (loadCategoryLists). Ledger rows for a category that's since been removed
// from Reference Data are intentionally left out of the pivot entirely —
// deleting a category from the app should make it disappear from the report
// too, not linger as a column sourced from old ledger rows.
function addPivotSheet(wb, title, ledgerRows, orderedCategories, openingSeed = {}) {

  // Step 1: aggregate waste+disposal per (date, category) across all sources
  const agg = new Map(); // 'YYYY-MM-DD' → Map(category → {waste, disposal})

  ledgerRows.forEach(r => {
    const dk = dayjs(r.date).format('YYYY-MM-DD');
    if (!agg.has(dk)) agg.set(dk, new Map());
    const catMap = agg.get(dk);
    const prev = catMap.get(r.category) || { waste: 0, disposal: 0 };
    prev.waste    += Number(r.waste_for_day ?? 0);
    prev.disposal += Number(r.disposal ?? 0);
    catMap.set(r.category, prev);
  });

  // Step 2: sort dates chronologically, then densify — every calendar day from
  // the first to the last entered date gets a row, so dates "sandwiched" between
  // two declarations show up with zero waste/disposal (stock simply carries
  // forward). Days with no data fall through to the {waste:0,disposal:0} default.
  const presentDates = [...agg.keys()].sort();
  const allDates = [];
  if (presentDates.length) {
    let cur = dayjs(presentDates[0]).startOf('day');
    const end = dayjs(presentDates[presentDates.length - 1]).startOf('day');
    while (cur.valueOf() <= end.valueOf()) {
      allDates.push(cur.format('YYYY-MM-DD'));
      cur = cur.add(1, 'day');
    }
  }

  // Step 3: compute running opening/closing stock per category, seeded from
  // the real balance as of just before the report's date range (0 when this
  // is a full-history export, since there's nothing earlier to carry in).
  const running = {};
  orderedCategories.forEach(cat => { running[cat] = openingSeed[cat] || 0; });

  const dataRows = allDates.map(dk => {
    const catMap = agg.get(dk);
    const row = { date: dayjs(dk).format('DD-MM-YYYY') };
    orderedCategories.forEach(cat => {
      const d = catMap?.get(cat) || { waste: 0, disposal: 0 };
      const opening = running[cat];
      const closing = opening + d.waste - d.disposal;
      running[cat] = closing;
      row[cat] = {
        opening:  parseFloat(opening.toFixed(2)),
        waste:    parseFloat(d.waste.toFixed(2)),
        disposal: parseFloat(d.disposal.toFixed(2)),
        closing:  parseFloat(closing.toFixed(2)),
      };
    });
    return row;
  });

  // ── Build worksheet ────────────────────────────────────────────────────────
  const ws = wb.addWorksheet(title);

  // Freeze date column + header rows
  ws.views = [{ state: 'frozen', xSplit: 1, ySplit: 2 }];

  // Column widths
  ws.getColumn(1).width = 13;
  orderedCategories.forEach((_, i) => {
    const base = 2 + i * 4;
    ws.getColumn(base    ).width = 14; // Opening
    ws.getColumn(base + 1).width = 16; // Waste for Day
    ws.getColumn(base + 2).width = 11; // Disposal
    ws.getColumn(base + 3).width = 14; // Closing
  });

  // ── Row 1: merged category headers ──────────────────────────────────────
  const hRow1 = ws.getRow(1);

  // Date cell
  const dateCell1 = hRow1.getCell(1);
  dateCell1.value = 'Date';
  dateCell1.font  = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
  dateCell1.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND_DARK } };
  dateCell1.alignment = { horizontal: 'center', vertical: 'middle' };

  orderedCategories.forEach((cat, i) => {
    const col   = 2 + i * 4;
    const argb  = GROUP_FILLS[i % 2];
    const cell  = hRow1.getCell(col);
    cell.value  = `${cat} (Kgs)`;
    cell.font   = { bold: true, size: 9 };
    cell.fill   = { type: 'pattern', pattern: 'solid', fgColor: { argb } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = { left: { style: 'medium' }, right: { style: 'medium' } };

    // Fill remaining 3 cells of the merged group with same colour
    for (let j = 1; j < 4; j++) {
      const c2 = hRow1.getCell(col + j);
      c2.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb } };
    }
    ws.mergeCells(1, col, 1, col + 3);
  });
  hRow1.height = 32;

  // ── Row 2: sub-headers ─────────────────────────────────────────────────
  const hRow2 = ws.getRow(2);

  // Date sub-header (empty, styled)
  const dateCell2 = hRow2.getCell(1);
  dateCell2.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND_DARK } };

  const SUB_LABELS = ['Opening\nStock', 'Waste for\nthe Day', 'Disposal', 'Closing\nStock'];
  orderedCategories.forEach((cat, i) => {
    const col  = 2 + i * 4;
    const argb = GROUP_LIGHT[i % 2];
    SUB_LABELS.forEach((label, j) => {
      const cell  = hRow2.getCell(col + j);
      cell.value  = label;
      cell.font   = { bold: true, size: 9 };
      cell.fill   = { type: 'pattern', pattern: 'solid', fgColor: { argb } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = {
        left:   j === 0 ? { style: 'medium' } : { style: 'thin' },
        right:  j === 3 ? { style: 'medium' } : { style: 'thin' },
        bottom: { style: 'thin' },
      };
    });
  });
  hRow2.height = 36;

  // ── Data rows ──────────────────────────────────────────────────────────
  dataRows.forEach((row, rowIdx) => {
    const wsRow = ws.getRow(3 + rowIdx);

    const dateCell = wsRow.getCell(1);
    dateCell.value = row.date;
    dateCell.font  = { bold: true, size: 9 };
    dateCell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowIdx % 2 === 0 ? 'FFFFFFFF' : ALT_ROW_FILL } };
    dateCell.alignment = { horizontal: 'center', vertical: 'middle' };
    dateCell.border = { right: { style: 'medium' } };

    orderedCategories.forEach((cat, i) => {
      const col = 2 + i * 4;
      const d   = row[cat];
      const rowFill = rowIdx % 2 === 0 ? 'FFFFFFFF' : ALT_ROW_FILL;
      [d.opening, d.waste, d.disposal, d.closing].forEach((val, j) => {
        const cell  = wsRow.getCell(col + j);
        cell.value  = val;
        cell.font   = { size: 9 };
        cell.fill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowFill } };
        cell.numFmt = '#,##0.00';
        cell.alignment = { horizontal: 'right', vertical: 'middle' };
        cell.border = {
          left:  j === 0 ? { style: 'medium' } : { style: 'thin' },
          right: j === 3 ? { style: 'medium' } : { style: 'thin' },
        };
      });
    });

    wsRow.height = 16;
  });

  // Outer border on header rows
  hRow1.eachCell(c => { if (!c.border) c.border = {}; });
}

// ── Declarations log sheet ────────────────────────────────────────────────────
function addDeclarationsSheet(wb, declarations) {
  const ws = wb.addWorksheet('Declarations Log');
  ws.columns = [
    { header: 'Declaration No', key: 'no',           width: 24 },
    { header: 'Date',           key: 'date',          width: 14 },
    { header: 'Employee',       key: 'employee',      width: 22 },
    { header: 'Zone',           key: 'zone',          width: 14 },
    { header: 'Storage Location', key: 'storage_location', width: 20 },
    { header: 'Function',       key: 'fn',            width: 12 },
    { header: 'Source',         key: 'source',        width: 10 },
    { header: 'Shift',          key: 'shift',         width: 8  },
    { header: 'Disposal Route', key: 'disposal_route',width: 18 },
    { header: 'Reference No',   key: 'reference_no',  width: 14 },
    { header: 'Status',         key: 'status',        width: 20 },
    { header: 'Items',          key: 'items',         width: 8  },
    { header: 'Total Wt (kg)',  key: 'total_kg',      width: 16 },
    { header: 'Submitted At',   key: 'created_at',    width: 20 },
    { header: 'Completed At',   key: 'completed_at',  width: 20 },
  ];

  const hRow = ws.getRow(1);
  hRow.eachCell(cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND_PRIMARY } };
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
  });
  hRow.height = 22;

  declarations.forEach((d, i) => {
    const total_kg = d.line_items.reduce((s, li) => s + Number(li.weight_kg ?? 0), 0);
    const storageLocations = [...new Set(d.line_items.map(li => li.storage_location).filter(Boolean))];
    const row = ws.addRow({
      no:           d.declaration_no,
      date:         dayjs(d.date).format('DD-MM-YYYY'),
      employee:     d.employee?.name ?? '',
      zone:         d.zone,
      storage_location: storageLocations.length ? storageLocations.join(', ') : '—',
      fn:           d.production_function,
      source:       d.source,
      shift:        d.shift,
      disposal_route: d.disposal_route === 'AUTHORIZED_AGENCY' ? 'Authorized Agency' : 'Circularity',
      reference_no: d.reference_no || '—',
      status:       d.status,
      items:        d.line_items.length,
      total_kg:     parseFloat(total_kg.toFixed(3)),
      created_at:   dayjs(d.created_at).format('DD-MM-YYYY HH:mm'),
      completed_at: d.completed_at ? dayjs(d.completed_at).format('DD-MM-YYYY HH:mm') : '—',
    });
    if (i % 2 === 1) {
      row.eachCell(cell => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ALT_ROW_FILL } };
      });
    }
  });
}

// ── Summary sheet ─────────────────────────────────────────────────────────────
function addSummarySheet(wb, ledger, declarations, generatedAt, dateFrom, dateTo) {
  const ws = wb.addWorksheet('Summary');
  ws.columns = [
    { header: 'Metric', key: 'metric', width: 40 },
    { header: 'Value',  key: 'value',  width: 24 },
  ];

  const hRow = ws.getRow(1);
  hRow.eachCell(cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND_DARK } };
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });
  hRow.height = 22;

  const bySource = {};
  ledger.forEach(l => {
    bySource[l.source] = (bySource[l.source] || 0) + Number(l.waste_for_day ?? 0);
  });

  const completed = declarations.filter(d => d.status === 'COMPLETED').length;

  // Actual span of data present in this report (min–max ledger date).
  const dates = ledger.map(l => dayjs(l.date)).sort((a, b) => a.valueOf() - b.valueOf());
  const dataRange = dates.length
    ? `${dates[0].format('DD-MM-YYYY')} – ${dates[dates.length - 1].format('DD-MM-YYYY')}`
    : '—';
  const exportRange = (dateFrom && dateTo)
    ? `${dayjs(dateFrom).format('DD-MM-YYYY')} – ${dayjs(dateTo).format('DD-MM-YYYY')}`
    : 'All Records';

  const rows = [
    { metric: 'Report Generated At',            value: generatedAt },
    { metric: 'Data Date Range',                 value: dataRange },
    { metric: 'Export Range Selected',           value: exportRange },
    { metric: 'Total Declarations (all time)',   value: declarations.length },
    { metric: 'Completed Declarations',          value: completed },
    { metric: 'Pending / In-Progress',           value: declarations.length - completed },
    { metric: '— BAT Total Waste (kg)',          value: (bySource.BAT  || 0).toFixed(3) },
    { metric: '— SOFT Total Waste (kg)',         value: (bySource.SOFT || 0).toFixed(3) },
    { metric: 'General Waste Total (kg)',        value: ledger.filter(l => l.waste_type === 'GENERAL').reduce((s, l) => s + Number(l.waste_for_day ?? 0), 0).toFixed(3) },
    { metric: 'Hazardous Waste Total (kg)',      value: ledger.filter(l => l.waste_type === 'HAZARDOUS').reduce((s, l) => s + Number(l.waste_for_day ?? 0), 0).toFixed(3) },
    { metric: 'E-Waste Total (kg)',              value: ledger.filter(l => l.waste_type === 'EWASTE').reduce((s, l) => s + Number(l.waste_for_day ?? 0), 0).toFixed(3) },
  ];

  rows.forEach((r, i) => {
    const row = ws.addRow(r);
    if (i % 2 === 1) {
      row.eachCell(cell => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ALT_ROW_FILL } };
      });
    }
  });
}

// ── Public API ────────────────────────────────────────────────────────────────
export async function generateReport(dateFrom, dateTo) {
  const dateWhere = {};
  if (dateFrom && dateTo) {
    dateWhere.date = { gte: new Date(dateFrom), lte: new Date(dateTo + 'T23:59:59Z') };
  }

  const [ledger, declarations, cats] = await Promise.all([
    prisma.generationDisposalLedger.findMany({
      where: dateWhere,
      orderBy: [{ date: 'asc' }, { waste_type: 'asc' }, { category: 'asc' }],
    }),
    prisma.scrapDeclaration.findMany({
      where: dateFrom && dateTo
        ? { date: { gte: new Date(dateFrom), lte: new Date(dateTo + 'T23:59:59Z') } }
        : {},
      include: { employee: { select: { name: true } }, line_items: true },
      orderBy: { created_at: 'desc' },
    }),
    loadCategoryLists(),
  ]);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'ReSource Management';
  wb.created = new Date();

  const generatedAt = dayjs().format('DD-MM-YYYY HH:mm:ss');

  addSummarySheet(wb, ledger, declarations, generatedAt, dateFrom, dateTo);

  const forSrc = (src, wt) => ledger.filter(l => l.source === src && l.waste_type === wt);

  const [
    softGeneralOpen, softHazOpen, softEwasteOpen,
    batGeneralOpen, batHazOpen, batEwasteOpen,
  ] = await Promise.all([
    getOpeningBalances(dateFrom, 'SOFT', 'GENERAL'),
    getOpeningBalances(dateFrom, 'SOFT', 'HAZARDOUS'),
    getOpeningBalances(dateFrom, 'SOFT', 'EWASTE'),
    getOpeningBalances(dateFrom, 'BAT', 'GENERAL'),
    getOpeningBalances(dateFrom, 'BAT', 'HAZARDOUS'),
    getOpeningBalances(dateFrom, 'BAT', 'EWASTE'),
  ]);

  addPivotSheet(wb, 'SOFT General',   forSrc('SOFT', 'GENERAL'),   cats.GENERAL_CATEGORIES,   softGeneralOpen);
  addPivotSheet(wb, 'SOFT Hazardous', forSrc('SOFT', 'HAZARDOUS'), cats.HAZARDOUS_CATEGORIES, softHazOpen);
  addPivotSheet(wb, 'SOFT E-Waste',   forSrc('SOFT', 'EWASTE'),    cats.EWASTE_CATEGORIES,    softEwasteOpen);

  addPivotSheet(wb, 'BAT General',    forSrc('BAT', 'GENERAL'),    cats.BAT_GENERAL_CATEGORIES,   batGeneralOpen);
  addPivotSheet(wb, 'BAT Hazardous',  forSrc('BAT', 'HAZARDOUS'),  cats.BAT_HAZARDOUS_CATEGORIES, batHazOpen);
  addPivotSheet(wb, 'BAT E-Waste',    forSrc('BAT', 'EWASTE'),     cats.BAT_EWASTE_CATEGORIES,    batEwasteOpen);

  addDeclarationsSheet(wb, declarations);

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

// ── Vendor pickup invoice sheet ───────────────────────────────────────────────
export async function generateVendorInvoiceReport(dateFrom, dateTo) {
  const where = {};
  if (dateFrom) where.date = { ...where.date, gte: new Date(dateFrom) };
  if (dateTo)   where.date = { ...where.date, lte: new Date(dateTo + 'T23:59:59Z') };

  const pickups = await prisma.vendorPickup.findMany({
    where,
    include: { creator: { select: { name: true, emp_no: true } } },
    orderBy: { date: 'desc' },
  });

  const wb = new ExcelJS.Workbook();
  wb.creator = 'ReSource Management';
  wb.created = new Date();

  const ws = wb.addWorksheet('Vendor Invoice Sheet');
  const headerLabels = ['Date', 'Vendor Name', 'Vehicle Entry No', 'Vehicle Out No', 'Holding Time', 'Category', 'Invoice Raise Time', 'Invoice Received Time', 'Remarks', 'Logged By'];
  const widths = [14, 24, 16, 16, 16, 22, 16, 18, 28, 20];
  ws.columns = headerLabels.map((_, i) => ({ key: `c${i}`, width: widths[i] }));

  ws.mergeCells(1, 1, 1, headerLabels.length);
  const titleCell = ws.getCell(1, 1);
  titleCell.value = 'VENDOR PICKUP INVOICE SHEET';
  titleCell.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND_PRIMARY } };
  ws.getRow(1).height = 26;

  ws.mergeCells(2, 1, 2, headerLabels.length);
  const subCell = ws.getCell(2, 1);
  subCell.value = `Generated ${dayjs().format('DD-MM-YYYY HH:mm:ss')}` +
    (dateFrom && dateTo ? ` · Range ${dayjs(dateFrom).format('DD-MM-YYYY')} – ${dayjs(dateTo).format('DD-MM-YYYY')}` : ' · All Records');
  subCell.font = { italic: true, size: 10, color: { argb: 'FF666666' } };
  subCell.alignment = { vertical: 'middle', horizontal: 'center' };
  ws.getRow(2).height = 18;

  const hRow = ws.getRow(4);
  headerLabels.forEach((label, i) => {
    const cell = hRow.getCell(i + 1);
    cell.value = label;
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND_DARK } };
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
  });
  hRow.height = 24;

  pickups.forEach((p, i) => {
    const row = ws.addRow([
      dayjs(p.date).format('DD-MM-YYYY'),
      p.vendor_name,
      p.vehicle_entry_no,
      p.vehicle_out_no || '—',
      p.vehicle_holding_time || '—',
      p.category,
      p.invoice_raise_time || '—',
      p.invoice_received_time || '—',
      p.remarks || '—',
      p.creator?.name || '—',
    ]);
    row.eachCell(cell => {
      cell.border = {
        top:    { style: 'thin', color: { argb: 'FFE0E0E0' } },
        bottom: { style: 'thin', color: { argb: 'FFE0E0E0' } },
        left:   { style: 'thin', color: { argb: 'FFE0E0E0' } },
        right:  { style: 'thin', color: { argb: 'FFE0E0E0' } },
      };
      cell.alignment = { vertical: 'middle' };
    });
    if (i % 2 === 1) {
      row.eachCell(cell => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ALT_ROW_FILL } };
      });
    }
  });

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export async function triggerExport(declarationId, triggeredBy = 'DECLARATION_COMPLETED') {
  const buffer = await generateReport();
  return saveReportLocally(buffer, declarationId, triggeredBy);
}
