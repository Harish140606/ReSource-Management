// Canonical category lists — must match client/src/constants/wasteCategories.js
// and the lists used in excel.service.js.

export const GENERAL_CATEGORIES = [
  'Package Carton', 'Master Carton', 'Wooden Pallet',
  'Plastic Tray (Pet)', 'Plastic Wheels', 'Damaged Plastic / General Plastic',
  'Polymer (Rubber/Plastics)',
  'CATEGORY II – Flexible packaging –Rubbish waste -1 (Foam, Component feeder waste, reels, packaging cover, bubble wrap, Tape)',
  'CATEGORY I – Rigid packaging –Rubbish waste -2 (Strips, Seal caps)',
  'CATEGORY III – Multilayer packaging –Rubbish waste-3 (ESD Component covers, Slicing Tape, Anti-static bags,Thermocol)',
  'CATEGORY III – Multilayer Plastic Packaging– Damaged plastic pallet scrap (Pallet Inner layer made of Foam outer layer with plastic sheet)',
  'CATEGORY II – Flexible plastic packaging– Use plastic packaging tray/pet Scrap',
  'CATEGORY I – Rigid plastics packaging Spool/ Wheel Scrap',
  'CATEGORY I – Rigid Plastic Packaging –Damaged plastic pallet scrap (Plastic pallet)',
  'Iron and Steel', 'Casting Iron', 'Aluminium Scrap', 'Steel MS/SS', 'PA with Aluminium',
  'Copper Scrap', 'Copper/Brass', 'PA with Copper',
  'E-waste PCBA (Edge Cutting)', 'E-Components (SMT Reels/BGA/Mosfet)', 'Optical Fibre Cable',
  'Rubbish Waste', 'Glass Waste', 'Assets',
];

export const HAZARDOUS_CATEGORIES = [
  '5.1 – Used/Spent Oil',
  '5.2 – Wastes or Residues',
  '31.1 – Process Residue & Waste',
  '33.1 – Empty Barrels/Containers/Liners (contaminated)',
];

export const EWASTE_CATEGORIES = [
  'Edge Cutting', 'PCB With Components', 'Blank PCB',
  'CPU', 'Desktop', 'Server', 'Others',
];

export const ALL_CATEGORIES = [
  ...GENERAL_CATEGORIES.map(c => ({ category: c, waste_type: 'GENERAL' })),
  ...HAZARDOUS_CATEGORIES.map(c => ({ category: c, waste_type: 'HAZARDOUS' })),
  ...EWASTE_CATEGORIES.map(c => ({ category: c, waste_type: 'EWASTE' })),
];
