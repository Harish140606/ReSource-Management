import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import dayjs from 'dayjs';
import { fmtKg } from './formatters.js';

const APPROVAL_STEPS = [
  { key: 'declared',  label: 'Declared By' },
  { key: 'dept',      label: 'Dept Approved' },
  { key: 'irep',      label: 'IREP Auth' },
  { key: 'security',  label: 'Security' },
];

function approvalRows(decl) {
  return [
    { label: 'Declared By',    name: decl.employee?.name,            at: decl.created_at },
    { label: 'Dept Approved',  name: decl.dept_head?.name,           at: decl.dept_approved_at },
    { label: 'IREP Auth',      name: decl.irep_authorizer?.name,     at: decl.irep_authorized_at },
    { label: 'Security',       name: decl.security_authorizer?.name, at: decl.security_authorized_at },
  ].filter(r => r.name || r.at);
}

/** Build and download a one-page PDF summary of a single declaration. */
export function downloadDeclarationPdf(decl, { fnLabel, locLabel } = {}) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const marginX = 40;
  let y = 50;

  doc.setFontSize(16);
  doc.setFont(undefined, 'bold');
  doc.text('ReSource Management', marginX, y);
  doc.setFontSize(10);
  doc.setFont(undefined, 'normal');
  doc.text('Scrap Declaration Summary', marginX, y + 16);

  doc.setFontSize(11);
  doc.setFont(undefined, 'bold');
  doc.text(decl.declaration_no, 595 - marginX, y, { align: 'right' });
  doc.setFont(undefined, 'normal');
  doc.setFontSize(9);
  doc.text(`Generated ${dayjs().format('DD-MM-YYYY HH:mm')}`, 595 - marginX, y + 14, { align: 'right' });

  y += 36;
  doc.setDrawColor(200);
  doc.line(marginX, y, 595 - marginX, y);
  y += 20;

  const totalWeight = (decl.line_items || []).reduce((s, li) => s + Number(li.weight_kg ?? 0), 0);
  const infoPairs = [
    ['Declared By', `${decl.employee?.name ?? '—'} (${decl.employee?.emp_no ?? '—'})`],
    ['Date', dayjs(decl.date).format('DD-MM-YYYY')],
    ['Shift / Time', `${decl.shift ?? '—'} / ${decl.time ?? '—'}`],
    ['Zone', decl.zone ?? '—'],
    ['Function', fnLabel ? fnLabel(decl.production_function) : (decl.production_function ?? '—')],
    ['Source', decl.source ?? '—'],
    ['Reference No', decl.reference_no ?? '—'],
    ['Status', decl.status ?? '—'],
    ['Total Weight', fmtKg(totalWeight)],
  ];

  doc.setFontSize(9);
  const colWidth = (595 - marginX * 2) / 3;
  infoPairs.forEach(([label, value], i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = marginX + col * colWidth;
    const rowY = y + row * 30;
    doc.setTextColor(120);
    doc.text(label, x, rowY);
    doc.setTextColor(20);
    doc.setFont(undefined, 'bold');
    doc.text(String(value), x, rowY + 13);
    doc.setFont(undefined, 'normal');
  });
  y += Math.ceil(infoPairs.length / 3) * 30 + 16;

  // Approval chain
  const approvals = approvalRows(decl);
  if (approvals.length) {
    doc.setFontSize(11);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(20);
    doc.text('Approval Chain', marginX, y);
    y += 8;
    autoTable(doc, {
      startY: y,
      margin: { left: marginX, right: marginX },
      head: [['Stage', 'By', 'At']],
      body: approvals.map(r => [r.label, r.name || '—', r.at ? dayjs(r.at).format('DD-MM-YYYY HH:mm') : '—']),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [0, 80, 255] },
      theme: 'grid',
    });
    y = doc.lastAutoTable.finalY + 20;
  }

  // Line items, grouped by waste type
  const showBatId = decl.source === 'BAT';
  ['GENERAL', 'HAZARDOUS', 'EWASTE'].forEach(wt => {
    const rows = (decl.line_items || []).filter(li => li.waste_type === wt);
    if (!rows.length) return;

    if (y > 700) { doc.addPage(); y = 50; }

    doc.setFontSize(10);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(20);
    doc.text(wt, marginX, y);
    y += 6;

    const head = showBatId
      ? [['Category', 'Pallets', 'Weight (kg)', 'BAT ID', 'Storage', 'Remarks']]
      : [['Category', 'Pallets', 'Weight (kg)', 'Storage', 'Remarks']];

    autoTable(doc, {
      startY: y,
      margin: { left: marginX, right: marginX },
      head,
      body: rows.map(li => {
        const storage = locLabel ? locLabel(li.storage_location) : (li.storage_location ?? '—');
        const base = [li.category, li.pallet_qty ?? '—', li.weight_kg ?? '—'];
        if (showBatId) base.push(li.bat_id || '—');
        base.push(storage, li.remarks || '—');
        return base;
      }),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [0, 80, 255] },
      theme: 'grid',
    });
    y = doc.lastAutoTable.finalY + 20;
  });

  doc.save(`${decl.declaration_no}.pdf`);
}
