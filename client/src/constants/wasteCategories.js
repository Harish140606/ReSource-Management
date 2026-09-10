// ─── General Waste sub-groups ─────────────────────────────────────────────
export const GENERAL_WASTE_SUBGROUPS = {
  'Packaging & Paper': [
    'Package Carton',
    'Master Carton',
    'Wooden Pallet',
  ],
  'Plastics': [
    'Plastic Tray (Pet)',
    'Plastic Wheels',
    'Damaged Plastic / General Plastic',
    'Polymer (Rubber/Plastics)',
  ],
  'Plastics EPR': [
    'CATEGORY II – Flexible packaging –Rubbish waste -1 (Foam, Component feeder waste, reels, packaging cover, bubble wrap, Tape)',
    'CATEGORY I – Rigid packaging –Rubbish waste -2 (Strips, Seal caps)',
    'CATEGORY III – Multilayer packaging –Rubbish waste-3 (ESD Component covers, Slicing Tape, Anti-static bags,Thermocol)',
    'CATEGORY III – Multilayer Plastic Packaging– Damaged plastic pallet scrap (Pallet Inner layer made of Foam outer layer with plastic sheet)',
    'CATEGORY II – Flexible plastic packaging– Use plastic packaging tray/pet Scrap',
    'CATEGORY I – Rigid plastics packaging Spool/ Wheel Scrap',
    'CATEGORY I – Rigid Plastic Packaging –Damaged plastic pallet scrap (Plastic pallet)',
  ],
  'Metals': [
    'Iron and Steel',
    'Casting Iron',
    'Aluminium Scrap',
    'Steel MS/SS',
    'PA with Aluminium',
  ],
  'Copper': [
    'Copper Scrap',
    'Copper/Brass',
    'PA with Copper',
  ],
  'Electronic Scrap': [
    'E-waste PCBA (Edge Cutting)',
    'E-Components (SMT Reels/BGA/Mosfet)',
    'Optical Fibre Cable',
  ],
  'General / Misc': [
    'Rubbish Waste',
    'Glass Waste',
    'Assets',
  ],
};

// Flat list (for backward compat — same strings, same DB values)
export const GENERAL_WASTE_CATEGORIES = Object.values(GENERAL_WASTE_SUBGROUPS).flat();

export const HAZARDOUS_SUBGROUPS = {
  'Category 5 – Liquid Waste': [
    '5.1 – Used/Spent Oil',
    '5.2 – Wastes or Residues',
  ],
  'Category 31 – Process Waste': [
    '31.1 – Process Residue & Waste',
  ],
  'Category 33 – Containers': [
    '33.1 – Empty Barrels/Containers/Liners (contaminated)',
  ],
};

export const EWASTE_SUBGROUPS = {
  'PCB & Components': [
    'Edge Cutting',
    'PCB With Components',
    'Blank PCB',
    'CPU',
    'Desktop',
    'Server',
    'Others',
  ],
};

export const HAZARDOUS_CATEGORIES = Object.values(HAZARDOUS_SUBGROUPS).flat();
export const EWASTE_CATEGORIES = Object.values(EWASTE_SUBGROUPS).flat();

export const ALL_CATEGORIES = [
  ...GENERAL_WASTE_CATEGORIES,
  ...HAZARDOUS_CATEGORIES,
  ...EWASTE_CATEGORIES,
];

// ─── Nested sub-groups within a top-level group ────────────────────────────
// Plastics EPR no longer nests — each Cat I/II/III line is now its own flat
// category (see GENERAL_WASTE_SUBGROUPS above), matching the company's actual
// Excel column structure. Kept as an empty map for any future group that does
// need a nested breakdown.
export const NESTED_SUBGROUPS = {};

// ─── Group prefix used for sub-group selections ────────────────────────────
export const GROUP_PREFIX = 'grp:';

/** Return the human-readable label for a material value (category or group). */
export function materialLabel(value) {
  if (!value) return '';
  return value.startsWith(GROUP_PREFIX) ? value.slice(GROUP_PREFIX.length) : value;
}

/**
 * Given a material select value (individual category string OR "grp:GroupName"),
 * return the array of individual category strings to filter by.
 * Pass dynamicSubgroups (from buildSubgroups()) to resolve against live DB data.
 */
export function resolveCategories(value, dynamicSubgroups) {
  if (!value) return [];
  if (value.startsWith(GROUP_PREFIX)) {
    const groupName = value.slice(GROUP_PREFIX.length);
    const subgroups = dynamicSubgroups ?? GENERAL_WASTE_SUBGROUPS;
    return subgroups[groupName] ?? [];
  }
  return [value];
}
