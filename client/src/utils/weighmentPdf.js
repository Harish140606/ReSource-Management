import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import dayjs from 'dayjs';

function fmtDate(d) {
  if (!d) return '—';
  const parsed = dayjs(d);
  return parsed.isValid() ? parsed.format('DD-MM-YYYY') : String(d);
}

function weightRow(label, kg) {
  return [label, kg != null && kg !== '' ? `${Number(kg).toFixed(2)} Kg` : '—'];
}

/**
 * Build and download a one-page PDF documenting the two physical weighbridge
 * tickets (empty/tare + loaded/gross) behind a disposal, side by side as two
 * clearly separated sections.
 */
export function downloadWeighmentPdf({ empty = {}, loaded = {}, invoice_no } = {}) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const marginX = 40;
  let y = 50;

  doc.setFontSize(16);
  doc.setFont(undefined, 'bold');
  doc.text('ReSource Management', marginX, y);
  doc.setFontSize(10);
  doc.setFont(undefined, 'normal');
  doc.text('Weighbridge Weighment Certificate', marginX, y + 16);

  doc.setFontSize(11);
  doc.setFont(undefined, 'bold');
  doc.text(invoice_no || 'Manual Disposal', 595 - marginX, y, { align: 'right' });
  doc.setFont(undefined, 'normal');
  doc.setFontSize(9);
  doc.text(`Generated ${dayjs().format('DD-MM-YYYY HH:mm')}`, 595 - marginX, y + 14, { align: 'right' });

  y += 36;
  doc.setDrawColor(200);
  doc.line(marginX, y, 595 - marginX, y);
  y += 24;

  // ── Section 1: Empty (Tare) Weighment ──────────────────────────────────
  doc.setFontSize(12);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(20);
  doc.text('1. Empty Weighment (Vehicle Tare)', marginX, y);
  y += 8;

  autoTable(doc, {
    startY: y,
    margin: { left: marginX, right: marginX },
    head: [['Field', 'Value']],
    body: [
      ['Serial No.', empty.serial_no || '—'],
      ['Vehicle No.', empty.vehicle_no || '—'],
      ['Date', fmtDate(empty.date)],
      ['Time', empty.time || '—'],
      weightRow('Vehicle Weight (Tare)', empty.weight_kg),
    ],
    styles: { fontSize: 9 },
    headStyles: { fillColor: [0, 80, 255] },
    theme: 'grid',
  });
  y = doc.lastAutoTable.finalY + 28;

  // ── Section 2: Loaded (Gross) Weighment ────────────────────────────────
  doc.setFontSize(12);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(20);
  doc.text('2. Loaded Weighment (Vehicle + Scrap)', marginX, y);
  y += 8;

  autoTable(doc, {
    startY: y,
    margin: { left: marginX, right: marginX },
    head: [['Field', 'Value']],
    body: [
      ['Serial No.', loaded.serial_no || '—'],
      ['Vehicle No.', loaded.vehicle_no || '—'],
      ['Date', fmtDate(loaded.date)],
      ['Time', loaded.time || '—'],
      ['Material', loaded.material || '—'],
      weightRow('Gross Weight', loaded.gross_kg),
      weightRow('Tare Weight', loaded.tare_kg),
      weightRow('Nett Weight (Scrap)', loaded.net_kg),
    ],
    styles: { fontSize: 9 },
    headStyles: { fillColor: [0, 80, 255] },
    theme: 'grid',
  });
  y = doc.lastAutoTable.finalY + 28;

  // ── Summary ─────────────────────────────────────────────────────────────
  const netKg = loaded.net_kg != null && loaded.net_kg !== ''
    ? Number(loaded.net_kg)
    : (loaded.gross_kg != null && loaded.gross_kg !== '' && empty.weight_kg != null && empty.weight_kg !== ''
        ? Number(loaded.gross_kg) - Number(empty.weight_kg)
        : null);

  doc.setFontSize(11);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(20);
  doc.text(
    `Net Scrap Weight: ${netKg != null ? netKg.toFixed(2) + ' Kg' : '—'}`,
    marginX, y,
  );

  const filenameSafe = (invoice_no || 'weighment').replace(/[^A-Za-z0-9_-]/g, '_');
  doc.save(`${filenameSafe}_weighment.pdf`);
}
