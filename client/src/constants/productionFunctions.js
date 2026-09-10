export const PRODUCTION_FUNCTION_LABELS = {
  SMT: 'SMT',
  MFT: 'MFT',
  REPAIR: 'REPAIR',
  RFM: 'RFM',
  FILTER: 'FILTER',
  IE: 'IE',
  TE: 'TE',
  SMT_ENGINEERING: 'SMT ENGINEERING',
  MES: 'MES',
  WAREHOUSE: 'WAREHOUSE',
  MATERIAL_CONTROL: 'MATERIAL CONTROL',
  PDM: 'PDM',
  OIP: 'OIP',
  PME: 'PME',
  SQA: 'SQA',
  IREP: 'IREP',
  GLOBAL_IT: 'IT/Global IT',
};

export const PRODUCTION_FUNCTION_GROUPS = [
  { label: 'Production', options: ['SMT', 'MFT', 'REPAIR', 'RFM', 'FILTER'] },
  { label: 'MS', options: ['IE', 'TE', 'SMT_ENGINEERING', 'MES'] },
  { label: 'Planning', options: ['WAREHOUSE', 'MATERIAL_CONTROL', 'PDM'] },
  { label: 'QA', options: ['OIP', 'PME'] },
  { label: 'MM', options: ['SQA', 'IREP'] },
  { label: 'IT', options: ['GLOBAL_IT'], flat: true },
];

export const PRODUCTION_FUNCTIONS = PRODUCTION_FUNCTION_GROUPS.flatMap(g => g.options);
