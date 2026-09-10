import prisma from '../utils/prisma.js';

// One-off additions that need to exist in every environment (including
// production), added outside of the main prisma/seed.js run. Upsert is
// idempotent and cheap, so this is safe to run on every server start rather
// than requiring a manual seed/migration step per environment.
const ADDITIONS = [
  { type: 'WASTE_CATEGORY', code: 'Spent Itching Chemical & Solvent', label: 'Spent Itching Chemical & Solvent', group: 'Category 5 – Liquid Waste', metadata: { source: 'SOFT', waste_type: 'HAZARDOUS' }, sort_order: 41 },
  { type: 'WASTE_CATEGORY', code: 'Oil Waste', label: 'Oil Waste', group: 'Category 5 – Liquid Waste', metadata: { source: 'SOFT', waste_type: 'HAZARDOUS' }, sort_order: 42 },
  { type: 'WASTE_CATEGORY', code: 'Condaminated Oil Waste', label: 'Condaminated Oil Waste', group: 'Category 5 – Liquid Waste', metadata: { source: 'SOFT', waste_type: 'HAZARDOUS' }, sort_order: 43 },
  // Plastics EPR — matches the company's actual Excel column structure exactly.
  { type: 'WASTE_CATEGORY', code: 'CATEGORY II – Flexible packaging –Rubbish waste -1 (Foam, Component feeder waste, reels, packaging cover, bubble wrap, Tape)', label: 'CATEGORY II – Flexible packaging –Rubbish waste -1 (Foam, Component feeder waste, reels, packaging cover, bubble wrap, Tape)', group: 'Plastics EPR', metadata: { source: 'SOFT', waste_type: 'GENERAL' }, sort_order: 7 },
  { type: 'WASTE_CATEGORY', code: 'CATEGORY I – Rigid packaging –Rubbish waste -2 (Strips, Seal caps)', label: 'CATEGORY I – Rigid packaging –Rubbish waste -2 (Strips, Seal caps)', group: 'Plastics EPR', metadata: { source: 'SOFT', waste_type: 'GENERAL' }, sort_order: 8 },
  { type: 'WASTE_CATEGORY', code: 'CATEGORY III – Multilayer packaging –Rubbish waste-3 (ESD Component covers, Slicing Tape, Anti-static bags,Thermocol)', label: 'CATEGORY III – Multilayer packaging –Rubbish waste-3 (ESD Component covers, Slicing Tape, Anti-static bags,Thermocol)', group: 'Plastics EPR', metadata: { source: 'SOFT', waste_type: 'GENERAL' }, sort_order: 9 },
  { type: 'WASTE_CATEGORY', code: 'CATEGORY III – Multilayer Plastic Packaging– Damaged plastic pallet scrap (Pallet Inner layer made of Foam outer layer with plastic sheet)', label: 'CATEGORY III – Multilayer Plastic Packaging– Damaged plastic pallet scrap (Pallet Inner layer made of Foam outer layer with plastic sheet)', group: 'Plastics EPR', metadata: { source: 'SOFT', waste_type: 'GENERAL' }, sort_order: 10 },
  { type: 'WASTE_CATEGORY', code: 'CATEGORY II – Flexible plastic packaging– Use plastic packaging tray/pet Scrap', label: 'CATEGORY II – Flexible plastic packaging– Use plastic packaging tray/pet Scrap', group: 'Plastics EPR', metadata: { source: 'SOFT', waste_type: 'GENERAL' }, sort_order: 11 },
  { type: 'WASTE_CATEGORY', code: 'CATEGORY I – Rigid plastics packaging Spool/ Wheel Scrap', label: 'CATEGORY I – Rigid plastics packaging Spool/ Wheel Scrap', group: 'Plastics EPR', metadata: { source: 'SOFT', waste_type: 'GENERAL' }, sort_order: 12 },
  { type: 'WASTE_CATEGORY', code: 'CATEGORY I – Rigid Plastic Packaging –Damaged plastic pallet scrap (Plastic pallet)', label: 'CATEGORY I – Rigid Plastic Packaging –Damaged plastic pallet scrap (Plastic pallet)', group: 'Plastics EPR', metadata: { source: 'SOFT', waste_type: 'GENERAL' }, sort_order: 13 },
];

// Superseded Plastics EPR codes from an earlier iteration of this category
// structure — removed wherever found so a stale environment can't end up with
// both the old per-material breakdown AND the new company-matching columns.
const REMOVALS = [
  'Cat I – Rigid Plastic', 'Cat I – Rigid Plastic (Spool/Wheel Scrap)', 'Cat I – Rigid Plastic (Strips)',
  'Cat I – Rigid Plastic (Seal Caps)', 'Cat I – Rigid Plastic (Damaged Pallet)',
  'Cat II – Flexible', 'Cat II – Flexible (Foam)', 'Cat II – Flexible (Component Feeder Waste)',
  'Cat II – Flexible (Reels)', 'Cat II – Flexible (Packaging Cover)', 'Cat II – Flexible (Bubble Wrap)',
  'Cat II – Flexible (Tape)', 'Cat II – Flexible (Plastic Tray/PET)',
  'Cat III – Multilayer', 'Cat III – Multilayer (Foam+Plastic Sheet Pallet)', 'Cat III – Multilayer (ESD Covers)',
  'Cat III – Multilayer (Slicing Tape)', 'Cat III – Multilayer (Anti-static Bags)', 'Cat III – Multilayer (Thermocol)',
];

export async function ensureReferenceData() {
  try {
    await prisma.referenceData.deleteMany({
      where: { type: 'WASTE_CATEGORY', code: { in: REMOVALS } },
    });
    for (const row of ADDITIONS) {
      await prisma.referenceData.upsert({
        where: { type_code: { type: row.type, code: row.code } },
        update: {},
        create: row,
      });
    }
  } catch (err) {
    console.error('[Bootstrap] ensureReferenceData failed:', err.message);
  }
}
