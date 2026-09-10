import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// ── Reference data ─────────────────────────────────────────────────────────────

const PRODUCTION_FUNCTIONS = [
  { group: 'Production', items: [{ code: 'SMT', label: 'SMT' }, { code: 'MFT', label: 'MFT' }, { code: 'REPAIR', label: 'REPAIR' }, { code: 'RFM', label: 'RFM' }, { code: 'FILTER', label: 'FILTER' }] },
  { group: 'MS',         items: [{ code: 'IE', label: 'IE' }, { code: 'TE', label: 'TE' }, { code: 'SMT_ENGINEERING', label: 'SMT ENGINEERING' }, { code: 'MES', label: 'MES' }] },
  { group: 'Planning',   items: [{ code: 'WAREHOUSE', label: 'WAREHOUSE' }, { code: 'MATERIAL_CONTROL', label: 'MATERIAL CONTROL' }, { code: 'PDM', label: 'PDM' }] },
  { group: 'QA',         items: [{ code: 'OIP', label: 'OIP' }, { code: 'PME', label: 'PME' }] },
  { group: 'MM',         items: [{ code: 'SQA', label: 'SQA' }, { code: 'IREP', label: 'IREP' }] },
  { group: 'IT',         items: [{ code: 'GLOBAL_IT', label: 'IT/Global IT' }] },
];

const ZONES = ['ZONE-A', 'ZONE-B', 'ZONE-C', 'HQ', 'MAIN', 'GATE'];

const SHIFTS = [
  { code: 'A', label: 'Shift A' },
  { code: 'B', label: 'Shift B' },
  { code: 'C', label: 'Shift C' },
  { code: 'G', label: 'General' },
];

const DISPOSAL_ROUTES = [
  { code: 'CIRCULARITY',       label: 'Circularity' },
  { code: 'AUTHORIZED_AGENCY', label: 'Authorized Agency' },
];

const STORAGE_LOCATIONS = [
  { code: 'GENERAL_SCRAP_YARD',      label: 'General Scrap Yard' },
  { code: 'HAZARDOUS_WASTE_STORAGE', label: 'Hazardous Waste Storage' },
  { code: 'EWASTE_STORAGE',          label: 'E-Waste Storage' },
  { code: 'PLASTICS_STORAGE',        label: 'Plastics Storage' },
  { code: 'METALS_STORAGE',          label: 'Metals Storage' },
];

// SOFT General waste categories with subgroups
const SOFT_GENERAL = [
  { subgroup: 'Packaging & Paper', items: ['Package Carton', 'Master Carton', 'Wooden Pallet'] },
  { subgroup: 'Plastics',          items: ['Plastic Tray (Pet)', 'Plastic Wheels', 'Damaged Plastic / General Plastic', 'Polymer (Rubber/Plastics)'] },
  {
    // Matches the company's actual Excel column structure exactly — several of
    // the original individual materials are combined under company-defined
    // "Rubbish waste -N" categories, while the rest stay as their own column.
    subgroup: 'Plastics EPR',
    items: [
      'CATEGORY II – Flexible packaging –Rubbish waste -1 (Foam, Component feeder waste, reels, packaging cover, bubble wrap, Tape)',
      'CATEGORY I – Rigid packaging –Rubbish waste -2 (Strips, Seal caps)',
      'CATEGORY III – Multilayer packaging –Rubbish waste-3 (ESD Component covers, Slicing Tape, Anti-static bags,Thermocol)',
      'CATEGORY III – Multilayer Plastic Packaging– Damaged plastic pallet scrap (Pallet Inner layer made of Foam outer layer with plastic sheet)',
      'CATEGORY II – Flexible plastic packaging– Use plastic packaging tray/pet Scrap',
      'CATEGORY I – Rigid plastics packaging Spool/ Wheel Scrap',
      'CATEGORY I – Rigid Plastic Packaging –Damaged plastic pallet scrap (Plastic pallet)',
    ],
  },
  { subgroup: 'Metals',           items: ['Iron and Steel', 'Casting Iron', 'Aluminium Scrap', 'Steel MS/SS', 'PA with Aluminium'] },
  { subgroup: 'Copper',           items: ['Copper Scrap', 'Copper/Brass', 'PA with Copper'] },
  { subgroup: 'Electronic Scrap', items: ['E-waste PCBA (Edge Cutting)', 'E-Components (SMT Reels/BGA/Mosfet)', 'Optical Fibre Cable'] },
  { subgroup: 'General / Misc',   items: ['Rubbish Waste', 'Glass Waste', 'Assets'] },
];

const SOFT_HAZARDOUS = [
  { subgroup: 'Category 5 – Liquid Waste',  items: ['5.1 – Used/Spent Oil', '5.2 – Wastes or Residues', 'Spent Itching Chemical & Solvent', 'Oil Waste', 'Condaminated Oil Waste'] },
  { subgroup: 'Category 31 – Process Waste', items: ['31.1 – Process Residue & Waste'] },
  { subgroup: 'Category 33 – Containers',    items: ['33.1 – Empty Barrels/Containers/Liners (contaminated)'] },
];

const SOFT_EWASTE = [
  { subgroup: 'PCB & Components', items: ['Edge Cutting', 'PCB With Components', 'Blank PCB', 'CPU', 'Desktop', 'Server', 'Others'] },
];

const BAT_GENERAL   = [{ subgroup: null, items: ['Casting/Mechanics', 'Metal Waste', 'Packaging waste (Carton, wooden, Plastic etc.)', 'Mixed waste (Machine dropout, Sweeping waste, etc.)'] }];
const BAT_HAZARDOUS = [{ subgroup: null, items: ['Hazardous Waste'] }];
const BAT_EWASTE    = [{ subgroup: null, items: ['E-waste'] }];

async function seedReferenceData() {
  const rows = [];
  let order = 0;

  // Production functions
  for (const grp of PRODUCTION_FUNCTIONS) {
    for (const fn of grp.items) {
      rows.push({ type: 'PRODUCTION_FUNCTION', code: fn.code, label: fn.label, group: grp.group, sort_order: order++ });
    }
  }

  // Zones
  order = 0;
  for (const z of ZONES) {
    rows.push({ type: 'ZONE', code: z, label: z, group: null, sort_order: order++ });
  }

  // Shifts
  order = 0;
  for (const s of SHIFTS) {
    rows.push({ type: 'SHIFT', code: s.code, label: s.label, group: null, sort_order: order++ });
  }

  // Disposal routes
  order = 0;
  for (const d of DISPOSAL_ROUTES) {
    rows.push({ type: 'DISPOSAL_ROUTE', code: d.code, label: d.label, group: null, sort_order: order++ });
  }

  // Storage locations
  order = 0;
  for (const sl of STORAGE_LOCATIONS) {
    rows.push({ type: 'STORAGE_LOCATION', code: sl.code, label: sl.label, group: null, sort_order: order++ });
  }

  // Waste categories
  order = 0;
  function addCats(defs, waste_type, source) {
    for (const def of defs) {
      for (const item of def.items) {
        const isObj = typeof item === 'object';
        const code  = isObj ? item.label : item;
        rows.push({
          type: 'WASTE_CATEGORY',
          code,
          label: code,
          group: def.subgroup || null,
          metadata: {
            waste_type,
            source,
            ...(isObj && item.nested ? { nested_subgroup: item.nested } : {}),
          },
          sort_order: order++,
        });
      }
    }
  }

  addCats(SOFT_GENERAL,   'GENERAL',   'SOFT');
  addCats(SOFT_HAZARDOUS, 'HAZARDOUS', 'SOFT');
  addCats(SOFT_EWASTE,    'EWASTE',    'SOFT');
  addCats(BAT_GENERAL,    'GENERAL',   'BAT');
  addCats(BAT_HAZARDOUS,  'HAZARDOUS', 'BAT');
  addCats(BAT_EWASTE,     'EWASTE',    'BAT');

  // Upsert all rows
  for (const row of rows) {
    await prisma.referenceData.upsert({
      where: { type_code: { type: row.type, code: row.code } },
      update: { label: row.label, group: row.group ?? null, metadata: row.metadata ?? null, sort_order: row.sort_order },
      create: { type: row.type, code: row.code, label: row.label, group: row.group ?? null, metadata: row.metadata ?? null, sort_order: row.sort_order },
    });
  }

  console.log(`Seeded ${rows.length} reference data rows.`);
}

// ── Employees ─────────────────────────────────────────────────────────────────

async function main() {
  const hash = await bcrypt.hash('resource@123', 12);

  const employees = [
    { emp_no: 'EMP001', name: 'Arjun Mehta',      email: 'arjun.mehta@example.com',     role: 'ADMIN',            zone: 'HQ' },
    { emp_no: 'EMP002', name: 'Priya Nair',       email: 'priya.nair@example.com',      role: 'FACILITY_MANAGER', zone: 'MAIN' },
    { emp_no: 'EMP003', name: 'Rakesh Iyer',      email: 'rakesh.iyer@example.com',     role: 'DEPT_HEAD',        production_function: 'SMT',    zone: 'ZONE-A' },
    { emp_no: 'EMP004', name: 'Sanjay Kulkarni',  email: 'sanjay.kulkarni@example.com', role: 'DEPT_HEAD',        production_function: 'MFT',    zone: 'ZONE-B' },
    { emp_no: 'EMP005', name: 'Neha Sharma',      email: 'neha.sharma@example.com',     role: 'EMPLOYEE',         production_function: 'SMT',    zone: 'ZONE-A' },
    { emp_no: 'EMP006', name: 'Vikram Rao',       email: 'vikram.rao@example.com',      role: 'DEPT_HEAD',        production_function: 'REPAIR', zone: 'ZONE-B' },
    { emp_no: 'EMP007', name: 'Anita Desai',      email: 'anita.desai@example.com',     role: 'EMPLOYEE',         production_function: 'RFM',    zone: 'ZONE-B' },
    { emp_no: 'EMP008', name: 'Deepak Menon',     email: 'deepak.menon@example.com',    role: 'IREP',             zone: 'HQ' },
    { emp_no: 'EMP009', name: 'Suresh Pillai',    email: 'suresh.pillai@example.com',   role: 'SECURITY',         zone: 'GATE' },
  ];
  for (const e of employees) {
    await prisma.employee.upsert({
      where: { emp_no: e.emp_no },
      update: { name: e.name, email: e.email },
      create: { ...e, password_hash: hash },
    });
  }

  await seedReferenceData();

  console.log('Seed complete. Default password: resource@123');
}

main().catch(console.error).finally(() => prisma.$disconnect());
