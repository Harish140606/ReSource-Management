// One-time repair: merges duplicate same-day ledger rows (a bug in
// createLedgerEntries that's now fixed) and recomputes the entire running
// opening/closing balance chain per (category, waste_type, source) group from
// scratch, using the recorded waste_for_day/disposal amounts. Does not touch
// ScrapDeclaration or DisposalInvoice — only GenerationDisposalLedger.
import prisma from '../src/utils/prisma.js';

const isoDay = (d) => new Date(d).toISOString().slice(0, 10);

async function main() {
  const all = await prisma.generationDisposalLedger.findMany({
    orderBy: [{ date: 'asc' }, { created_at: 'asc' }],
  });

  const groups = new Map(); // 'category|waste_type|source' -> rows[]
  for (const r of all) {
    const key = `${r.category}|${r.waste_type}|${r.source}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }

  const report = [];
  console.log(`Processing ${groups.size} groups...`);

  for (const [key, rows] of groups) {
    const [category, waste_type, source] = key.split('|');
    try {

    // Merge duplicate same-day rows.
    const byDay = new Map(); // 'YYYY-MM-DD' -> { date, waste, disposal, keepId, dropIds[] }
    for (const r of rows) {
      const day = isoDay(r.date);
      if (!byDay.has(day)) {
        byDay.set(day, { date: r.date, waste: 0, disposal: 0, keepId: r.id, dropIds: [], declaration_id: r.declaration_id });
      }
      const entry = byDay.get(day);
      entry.waste += Number(r.waste_for_day);
      entry.disposal += Number(r.disposal);
      if (r.id !== entry.keepId) entry.dropIds.push(r.id);
    }

    const days = [...byDay.values()].sort((a, b) => new Date(a.date) - new Date(b.date));

    const before = {
      rowCount: rows.length,
      latestClosing: rows.length ? Number(rows[rows.length - 1].closing_stock) : null,
    };

    let prevClosing = 0;
    const updates = [];
    for (const d of days) {
      const opening = prevClosing;
      const closing = opening + d.waste - d.disposal;
      updates.push({ id: d.keepId, opening_stock: opening, waste_for_day: d.waste, disposal: d.disposal, closing_stock: closing, dropIds: d.dropIds });
      prevClosing = closing;
    }

    await prisma.$transaction(async (tx) => {
      for (const u of updates) {
        await tx.generationDisposalLedger.update({
          where: { id: u.id },
          data: { opening_stock: u.opening_stock, waste_for_day: u.waste_for_day, disposal: u.disposal, closing_stock: u.closing_stock },
        });
        if (u.dropIds.length) {
          await tx.generationDisposalLedger.deleteMany({ where: { id: { in: u.dropIds } } });
        }
      }
    }, { timeout: 30000, maxWait: 10000 });

      const entry = {
        category, waste_type, source,
        before_rows: before.rowCount, after_rows: days.length,
        before_latest_closing: before.latestClosing, after_latest_closing: prevClosing,
        went_negative: prevClosing < 0,
      };
      report.push(entry);
      console.log('OK:', JSON.stringify(entry));
    } catch (err) {
      console.log('FAILED:', key, '-', err.message);
    }
  }

  report.sort((a, b) => (b.went_negative - a.went_negative) || Math.abs(b.before_latest_closing - b.after_latest_closing) - Math.abs(a.before_latest_closing - a.after_latest_closing));
  console.log(JSON.stringify(report, null, 2));
  console.log(`\nDone. ${report.length} groups processed. ${report.filter(r => r.went_negative).length} still negative after merge (genuine over-disposal, not a duplicate-row artifact).`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
