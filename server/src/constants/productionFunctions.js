// Function (formerly "Production Function") groups, mirrored from
// client/src/constants/productionFunctions.js
export const PRODUCTION_FUNCTION_GROUPS = [
  { label: 'Production', options: ['SMT', 'MFT', 'REPAIR', 'RFM', 'FILTER'] },
  { label: 'MS', options: ['IE', 'TE', 'SMT_ENGINEERING', 'MES'] },
  { label: 'Planning', options: ['WAREHOUSE', 'MATERIAL_CONTROL', 'PDM'] },
  { label: 'QA', options: ['OIP', 'PME'] },
  { label: 'MM', options: ['SQA', 'IREP'] },
  { label: 'IT', options: ['GLOBAL_IT'], flat: true },
];

export const PRODUCTION_FUNCTIONS = PRODUCTION_FUNCTION_GROUPS.flatMap(g => g.options);
