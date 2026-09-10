import { useMemo } from 'react';
import { useReferenceData, buildSubgroups } from '../hooks/useReferenceData.js';
import { GROUP_PREFIX } from '../constants/wasteCategories.js';

export default function MaterialSelect({ value, onChange, className = '' }) {
  const { data: categories } = useReferenceData('WASTE_CATEGORY');

  // Build subgroups from SOFT General (dashboard uses SOFT as the reference view)
  const generalSubgroups  = useMemo(() => buildSubgroups(categories, 'SOFT', 'GENERAL'),   [categories]);
  const hazardousCategories = useMemo(() => categories.filter(c => c.metadata?.waste_type === 'HAZARDOUS' && c.metadata?.source === 'SOFT').map(c => c.code), [categories]);
  const ewasteCategories    = useMemo(() => categories.filter(c => c.metadata?.waste_type === 'EWASTE'    && c.metadata?.source === 'SOFT').map(c => c.code), [categories]);

  return (
    <select
      className={`form-select w-auto text-xs py-1.5 max-w-[220px] ${className}`}
      value={value}
      onChange={e => onChange(e.target.value)}
    >
      <option value="">All Materials</option>

      {Object.entries(generalSubgroups).map(([group, cats]) => (
        <optgroup key={group} label={`General — ${group}`}>
          <option value={`${GROUP_PREFIX}${group}`}>↳ All {group}</option>
          {cats.map(c => <option key={c} value={c}>{c}</option>)}
        </optgroup>
      ))}

      <optgroup label="Hazardous Waste">
        {hazardousCategories.map(c => <option key={c} value={c}>{c}</option>)}
      </optgroup>

      <optgroup label="E-Waste">
        {ewasteCategories.map(c => <option key={c} value={c}>{c}</option>)}
      </optgroup>
    </select>
  );
}
