import { Link } from 'react-router-dom';
import StatusBadge from './StatusBadge.jsx';
import { formatDate } from '../utils/dateHelpers.js';
import { fmtKg } from '../utils/formatters.js';
import { useReferenceData } from '../hooks/useReferenceData.js';

// `key: null` columns aren't sortable. Total Weight is intentionally excluded —
// it's a sum across line items, not a plain column, so it can't be sorted
// across the whole result set without a much heavier query; leaving it
// clickable would silently only reorder the current page, which is the exact
// bug being fixed here for every other column.
const COLUMNS = [
  { label: 'Declaration No', key: 'declaration_no' },
  { label: 'Date',           key: 'date' },
  { label: 'Zone',           key: 'zone' },
  { label: 'Function',       key: 'function' },
  { label: 'Source',         key: 'source' },
  { label: 'Route',          key: 'disposal_route' },
  { label: 'Total Weight',   key: null },
  { label: 'Status',         key: 'status' },
  { label: 'Actions',        key: null },
];

export default function DeclarationTable({
  items = [], loading, emptyText = 'No declarations found.',
  sortKey, sortDir = 'asc', onSort,
  selectable = false, selectedIds, onToggleSelect, onToggleSelectAll,
}) {
  const { data: functions } = useReferenceData('PRODUCTION_FUNCTION');
  const { data: routes }    = useReferenceData('DISPOSAL_ROUTE');

  const fnLabel    = (code) => functions.find(f => f.code === code)?.label || code || '—';
  const routeLabel = (code) => routes.find(r => r.code === code)?.label || '—';

  const totalWeight = (line_items) =>
    (line_items || []).reduce((s, li) => s + Number(li.weight_kg ?? 0), 0);

  if (loading) return (
    <div className="space-y-2">
      {[...Array(5)].map((_, i) => <div key={i} className="h-12 bg-gray-100 rounded animate-pulse" />)}
    </div>
  );

  if (!items.length) return (
    <div className="text-center py-12 text-gray-400 text-sm">{emptyText}</div>
  );

  const allSelected = selectable && items.length > 0 && items.every(d => selectedIds?.has(d.id));

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 -mx-3 sm:mx-0">
      <table className="min-w-[640px] w-full">
        <thead>
          <tr>
            {selectable && (
              <th className="table-header w-10">
                <input type="checkbox" checked={allSelected} onChange={onToggleSelectAll} />
              </th>
            )}
            {COLUMNS.map(col => (
              <th
                key={col.label}
                className={`table-header ${col.key ? 'cursor-pointer select-none hover:bg-white/10' : ''}`}
                onClick={() => col.key && onSort?.(col.key)}
              >
                <span className="inline-flex items-center gap-1">
                  {col.label}
                  {col.key && (
                    sortKey === col.key
                      ? <span className="text-[10px]">{sortDir === 'asc' ? '▲' : '▼'}</span>
                      : <span className="text-[9px] leading-none flex flex-col opacity-40">
                          <span>▲</span><span>▼</span>
                        </span>
                  )}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((d, i) => (
            <tr key={d.id} className={i % 2 === 1 ? 'bg-gray-50' : 'bg-white'}>
              {selectable && (
                <td className="table-cell">
                  <input type="checkbox" checked={selectedIds?.has(d.id) ?? false} onChange={() => onToggleSelect?.(d.id)} />
                </td>
              )}
              <td className="table-cell font-mono text-xs">{d.declaration_no}</td>
              <td className="table-cell">{formatDate(d.date)}</td>
              <td className="table-cell">{d.zone}</td>
              <td className="table-cell">{fnLabel(d.production_function)}</td>
              <td className="table-cell">
                <span className={`font-semibold text-xs ${d.source === 'BAT' ? 'text-brand-primary' : 'text-brand-cyan'}`}>
                  {d.source}
                </span>
              </td>
              <td className="table-cell">
                <span className={`text-xs font-medium ${d.disposal_route === 'AUTHORIZED_AGENCY' ? 'text-amber-600' : 'text-emerald-600'}`}>
                  {routeLabel(d.disposal_route)}
                </span>
              </td>
              <td className="table-cell">{fmtKg(totalWeight(d.line_items))}</td>
              <td className="table-cell"><StatusBadge status={d.status} /></td>
              <td className="table-cell">
                <Link to={`/declaration/${d.id}`} className="text-brand-primary text-xs font-medium hover:underline">
                  View →
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
