/**
 * Demo data — populates ~45 days of scrap declarations + a running
 * generation/disposal ledger so the dashboard trend/ledger/circularity
 * charts have something to show. Safe to re-run: it wipes previously
 * generated declarations + ledger rows first.
 *
 *   node prisma/seed-demo.js            # 45 days (default)
 *   node prisma/seed-demo.js 90         # 90 days
 */
import dayjs from 'dayjs';
import prisma from '../src/utils/prisma.js';

const DAYS = parseInt(process.argv[2]) || 45;

// (category, waste_type, source) — a spread across all three waste types
// and both production sources.
const CATS = [
  { code: 'Package Carton',                                       waste_type: 'GENERAL',   source: 'SOFT' },
  { code: 'Wooden Pallet',                                        waste_type: 'GENERAL',   source: 'SOFT' },
  { code: 'Damaged Plastic / General Plastic',                    waste_type: 'GENERAL',   source: 'SOFT' },
  { code: 'Metal Waste',                                          waste_type: 'GENERAL',   source: 'BAT'  },
  { code: 'Casting/Mechanics',                                    waste_type: 'GENERAL',   source: 'BAT'  },
  { code: 'Oil Waste',                                            waste_type: 'HAZARDOUS', source: 'SOFT' },
  { code: 'Hazardous Waste',                                      waste_type: 'HAZARDOUS', source: 'BAT'  },
  { code: 'PCB With Components',                                  waste_type: 'EWASTE',    source: 'SOFT' },
  { code: 'E-waste',                                              waste_type: 'EWASTE',    source: 'BAT'  },
];

const WEIGHT_RANGE = { GENERAL: [60, 420], HAZARDOUS: [4, 55], EWASTE: [12, 130] };
const rand  = (a, b) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(rand(a, b + 1));
const pick  = (arr) => arr[randi(0, arr.length - 1)];
const round = (n) => Math.round(n * 1000) / 1000;

async function main() {
  const emps = await prisma.employee.findMany();
  const byNo = Object.fromEntries(emps.map(e => [e.emp_no, e]));
  const declarers  = [byNo.EMP005, byNo.EMP007].filter(Boolean);
  const deptHeads  = [byNo.EMP003, byNo.EMP004, byNo.EMP006].filter(Boolean);
  const irep       = byNo.EMP008;
  const security   = byNo.EMP009;
  if (!declarers.length || !deptHeads.length) throw new Error('Run `node prisma/seed.js` first.');

  // ── wipe previously generated data ──────────────────────────────────────────
  await prisma.$transaction([
    prisma.generationDisposalLedger.deleteMany({}),
    prisma.declarationLineItem.deleteMany({}),
    prisma.excelExportLog.deleteMany({}),
    prisma.scrapDeclaration.deleteMany({}),
  ]);

  const start = dayjs().subtract(DAYS - 1, 'day').startOf('day');
  const contributions = []; // { day, category, waste_type, source, kg }
  let created = 0, pending = 0;

  for (let d = 0; d < DAYS; d++) {
    const day = start.add(d, 'day');
    const isoDay = day.format('YYYYMMDD');
    const perDay = randi(2, 4);

    for (let i = 0; i < perDay; i++) {
      const declarer = pick(declarers);
      const source   = pick(['BAT', 'SOFT']);
      const dayCats  = CATS.filter(c => c.source === source);
      const lineCats = [pick(dayCats), ...(Math.random() < 0.5 ? [pick(dayCats)] : [])];

      // Recent declarations are sometimes still mid-approval (pending KPI).
      const daysAgo = DAYS - d;
      let status = 'COMPLETED';
      if (daysAgo <= 6 && Math.random() < 0.55) {
        status = pick(['SUBMITTED', 'DEPT_APPROVED', 'IREP_AUTHORIZED']);
        pending++;
      }

      const deptHead = pick(deptHeads);
      const t = day
        .hour(randi(7, 19)).minute(pick([0, 15, 30, 45]));

      const lineItems = lineCats.map((c) => {
        const [lo, hi] = WEIGHT_RANGE[c.waste_type];
        const kg = round(rand(lo, hi));
        if (status === 'COMPLETED') {
          contributions.push({ day: day.format('YYYY-MM-DD'), category: c.code, waste_type: c.waste_type, source, kg });
        }
        return {
          waste_type: c.waste_type,
          category: c.code,
          pallet_qty: round(rand(1, 8)),
          weight_kg: kg,
          remarks: pick(['Line clearance', 'Shift changeover', 'Rework reject', 'Packaging teardown', 'Routine sweep', null]),
        };
      });

      const statusTimes = {};
      if (['DEPT_APPROVED', 'IREP_AUTHORIZED', 'COMPLETED'].includes(status)) statusTimes.dept_approved_at = t.add(2, 'hour').toDate();
      if (['IREP_AUTHORIZED', 'COMPLETED'].includes(status)) statusTimes.irep_authorized_at = t.add(4, 'hour').toDate();
      if (status === 'COMPLETED') { statusTimes.security_authorized_at = t.add(6, 'hour').toDate(); statusTimes.completed_at = t.add(7, 'hour').toDate(); }

      await prisma.scrapDeclaration.create({
        data: {
          declaration_no: `DCL-${isoDay}-${String(i + 1).padStart(4, '0')}`,
          employee_id: declarer.id,
          date: new Date(day.format('YYYY-MM-DD')),
          shift: pick(['A', 'B', 'C']),
          time: t.format('HH:mm'),
          zone: declarer.zone || 'ZONE-A',
          production_function: declarer.production_function || 'SMT',
          source,
          description: `${source} floor scrap — ${day.format('DD MMM YYYY')}`,
          reference_no: `${source}-${String(created + 1).padStart(3, '0')}`,
          disposal_route: 'CIRCULARITY',
          status,
          dept_head_id: ['DEPT_APPROVED', 'IREP_AUTHORIZED', 'COMPLETED'].includes(status) ? deptHead.id : null,
          irep_auth_by: ['IREP_AUTHORIZED', 'COMPLETED'].includes(status) && irep ? irep.id : null,
          security_auth_by: status === 'COMPLETED' && security ? security.id : null,
          ...statusTimes,
          created_at: t.toDate(),
          line_items: { create: lineItems },
        },
      });
      created++;
    }
  }

  // ── build the running ledger, group by (category, waste_type, source) ───────
  const groups = {};
  for (const c of contributions) {
    const key = `${c.category}|${c.waste_type}|${c.source}`;
    (groups[key] = groups[key] || {}).__meta = { category: c.category, waste_type: c.waste_type, source: c.source };
    groups[key][c.day] = (groups[key][c.day] || 0) + c.kg;
  }

  let ledgerRows = 0;
  for (const key of Object.keys(groups)) {
    const { category, waste_type, source } = groups[key].__meta;
    const days = Object.keys(groups[key]).filter(k => k !== '__meta').sort();
    let closing = 0;
    let sinceDisposal = 0;
    for (const day of days) {
      const opening = closing;
      const wasteForDay = round(groups[key][day]);
      sinceDisposal++;
      // Every few active days a vendor pickup clears most of the pile.
      let disposal = 0;
      if (sinceDisposal >= 3 && Math.random() < 0.6) {
        disposal = round((opening + wasteForDay) * rand(0.45, 0.85));
        sinceDisposal = 0;
      }
      closing = round(opening + wasteForDay - disposal);
      await prisma.generationDisposalLedger.create({
        data: {
          date: new Date(day),
          category, waste_type, source,
          opening_stock: opening,
          waste_for_day: wasteForDay,
          disposal,
          closing_stock: closing,
        },
      });
      ledgerRows++;
    }
  }

  const totalKg = round(contributions.reduce((s, c) => s + c.kg, 0));
  console.log(`Demo data: ${created} declarations (${pending} still in approval), ${ledgerRows} ledger rows, ${totalKg} kg over ${DAYS} days.`);
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
