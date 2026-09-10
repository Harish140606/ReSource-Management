import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Layout from '../components/Layout.jsx';
import { useAuth } from '../hooks/useAuth.jsx';
import { createDeclaration, updateDeclaration, submitDeclaration, getDeclaration, getNextReferenceNo } from '../services/declarations.js';
import { today } from '../utils/dateHelpers.js';
import { useReferenceData, buildFunctionGroups, buildSubgroups, buildNestedSubgroups, categoryCodesFor } from '../hooks/useReferenceData.js';
import { useSetting } from '../hooks/useSetting.js';
import { SETTING_KEYS } from '../services/settings.js';
import BulkDeclarationUpload from './BulkDeclarationUpload.jsx';

function sourceFromFunction(fn) {
  return ['SMT', 'MFT'].includes(fn) ? 'BAT' : 'SOFT';
}

function buildDefaultRows(categories, waste_type) {
  return categories.map(cat => ({ waste_type, category: cat, pallet_qty: '', weight_kg: '', remarks: '', bat_id: '' }));
}

// Defined at module scope so React never remounts it on parent re-renders
const PANEL_ACCENT = {
  general:   { bar: '#00838F', light: '#E0F2F1', badge: 'bg-teal-100 text-teal-700',   icon: '♻️' },
  hazardous: { bar: '#F59E0B', light: '#FFFBEB', badge: 'bg-amber-100 text-amber-700', icon: '⚠️' },
  ewaste:    { bar: '#10B981', light: '#ECFDF5', badge: 'bg-green-100 text-green-700',  icon: '🖥️' },
};

function CategoryRow({ row, displayIdx, accent, query, updateRow, showBatId }) {
  const i         = row._orig;
  const hasWeight = row.weight_kg !== '' && Number(row.weight_kg) > 0;
  const missingBatId = showBatId && hasWeight && !row.bat_id?.trim();
  const catName   = row.category;
  const matchIdx  = query ? catName.toLowerCase().indexOf(query) : -1;
  const highlighted = matchIdx >= 0
    ? <>{catName.slice(0, matchIdx)}<mark style={{ background: `${accent.bar}30`, color: accent.bar, borderRadius: 2 }}>{catName.slice(matchIdx, matchIdx + query.length)}</mark>{catName.slice(matchIdx + query.length)}</>
    : catName;

  return (
    <tr className="transition-colors" style={{ background: hasWeight ? `${accent.bar}08` : displayIdx % 2 === 0 ? '#ffffff' : '#f9fafb' }}>
      <td className="px-4 py-2.5">
        <div className="flex items-center gap-2.5">
          <span className="text-xs text-gray-400 font-mono w-5 text-right flex-shrink-0">{i + 1}</span>
          <span className="text-sm font-medium" style={{ color: hasWeight ? accent.bar : '#374151' }}>{highlighted}</span>
          {hasWeight && <span className="text-xs font-semibold px-1.5 py-0.5 rounded flex-shrink-0" style={{ background: `${accent.bar}18`, color: accent.bar }}>✓</span>}
        </div>
      </td>
      <td className="px-3 py-2 text-center">
        <input type="number" min="0" step="1"
          className="w-24 text-center border rounded-lg px-2 py-1.5 text-sm font-medium transition-all outline-none"
          style={{ borderColor: row.pallet_qty !== '' ? accent.bar : '#E5E7EB', background: row.pallet_qty !== '' ? `${accent.bar}08` : '#fff', color: '#111827' }}
          placeholder="0" value={row.pallet_qty}
          onChange={e => updateRow(i, 'pallet_qty', e.target.value)}
          onFocus={e => { e.target.style.boxShadow = `0 0 0 3px ${accent.bar}25`; e.target.style.borderColor = accent.bar; }}
          onBlur={e => { e.target.style.boxShadow = 'none'; e.target.style.borderColor = row.pallet_qty !== '' ? accent.bar : '#E5E7EB'; }}
        />
      </td>
      <td className="px-3 py-2 text-center">
        <input type="number" min="0" step="0.001"
          className="w-24 text-center border rounded-lg px-2 py-1.5 text-sm font-bold transition-all outline-none"
          style={{ borderColor: hasWeight ? accent.bar : '#E5E7EB', background: hasWeight ? `${accent.bar}12` : '#fff', color: hasWeight ? accent.bar : '#111827' }}
          placeholder="0.000" value={row.weight_kg}
          onChange={e => updateRow(i, 'weight_kg', e.target.value)}
          onFocus={e => { e.target.style.boxShadow = `0 0 0 3px ${accent.bar}25`; e.target.style.borderColor = accent.bar; }}
          onBlur={e => { e.target.style.boxShadow = 'none'; e.target.style.borderColor = hasWeight ? accent.bar : '#E5E7EB'; }}
        />
      </td>
      {showBatId && (
        <td className="px-3 py-2">
          <input type="text"
            className="w-full border rounded-lg px-3 py-1.5 text-sm transition-all outline-none"
            style={{ borderColor: missingBatId ? '#EF4444' : row.bat_id ? '#D1D5DB' : '#E5E7EB', background: '#fff', color: '#374151' }}
            placeholder={hasWeight ? 'BAT ID *' : 'BAT ID'} value={row.bat_id || ''}
            onChange={e => updateRow(i, 'bat_id', e.target.value)}
            onFocus={e => { e.target.style.boxShadow = `0 0 0 3px ${accent.bar}25`; e.target.style.borderColor = accent.bar; }}
            onBlur={e => { e.target.style.boxShadow = 'none'; e.target.style.borderColor = missingBatId ? '#EF4444' : row.bat_id ? '#D1D5DB' : '#E5E7EB'; }}
          />
        </td>
      )}
      <td className="px-3 py-2">
        <input type="text"
          className="w-full border rounded-lg px-3 py-1.5 text-sm transition-all outline-none"
          style={{ borderColor: row.remarks ? '#D1D5DB' : '#E5E7EB', background: '#fff', color: '#374151' }}
          placeholder="Optional remarks…" value={row.remarks}
          onChange={e => updateRow(i, 'remarks', e.target.value)}
          onFocus={e => { e.target.style.boxShadow = `0 0 0 3px ${accent.bar}25`; e.target.style.borderColor = accent.bar; }}
          onBlur={e => { e.target.style.boxShadow = 'none'; e.target.style.borderColor = row.remarks ? '#D1D5DB' : '#E5E7EB'; }}
        />
      </td>
    </tr>
  );
}

function MiniTable({ rows, accent, query, updateRow, indent = false, showBatId }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full">
        <thead>
          <tr style={{ background: `${accent.bar}10` }}>
            <th className={`${indent ? 'pl-8' : 'pl-4'} pr-4 py-2 text-left text-xs font-bold uppercase tracking-wide text-gray-400 w-80`}># Category</th>
            <th className="px-3 py-2 text-center text-xs font-bold uppercase tracking-wide text-gray-400 w-32">Pallet Qty</th>
            <th className="px-3 py-2 text-center text-xs font-bold uppercase tracking-wide text-gray-400 w-32">Weight (kg)</th>
            {showBatId && <th className="px-3 py-2 text-left text-xs font-bold uppercase tracking-wide text-gray-400 w-40">BAT ID</th>}
            <th className="px-3 py-2 text-left text-xs font-bold uppercase tracking-wide text-gray-400">Remarks</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((row, displayIdx) => (
            <CategoryRow key={row.category} row={row} displayIdx={displayIdx} accent={accent} query={query} updateRow={updateRow} showBatId={showBatId} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

// For a nested group like "Cat I – Rigid Plastic": shows one combined row for the
// whole group, plus a small toggle to drill into the specific materials beneath it
// if the declarer wants to break the weight down by material instead.
function NestedCategoryBlock({ name, aggregateRow, detailRows, accent, query, updateRow, depth, showBatId }) {
  const [open, setOpen] = useState(false);
  const filledDetail = detailRows.filter(r => r.weight_kg !== '' && Number(r.weight_kg) > 0);
  const detailTotal  = filledDetail.reduce((s, r) => s + Number(r.weight_kg), 0);

  // No aggregate category configured for this group yet — fall back to the
  // original flat list of specific materials only.
  if (!aggregateRow) {
    return <MiniTable rows={detailRows} accent={accent} query={query} updateRow={updateRow} indent={depth > 0} showBatId={showBatId} />;
  }

  return (
    <div>
      <MiniTable rows={[aggregateRow]} accent={accent} query={query} updateRow={updateRow} indent={depth > 0} showBatId={showBatId} />
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 pl-8 pr-4 py-1.5 text-left transition-colors hover:brightness-95"
        style={{ background: `${accent.bar}05` }}
      >
        <svg
          className="flex-shrink-0 transition-transform duration-200"
          style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)', color: accent.bar }}
          width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 6l6 6-6 6" />
        </svg>
        <span className="text-xs text-gray-500">
          {open ? 'Hide' : 'Or enter'} per-material breakdown ({detailRows.length})
        </span>
        {filledDetail.length > 0 && (
          <span className="flex-shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: `${accent.bar}22`, color: accent.bar }}>
            {filledDetail.length} filled · {detailTotal.toFixed(2)} kg
          </span>
        )}
      </button>
      {open && <MiniTable rows={detailRows} accent={accent} query={query} updateRow={updateRow} indent showBatId={showBatId} />}
    </div>
  );
}

function SubGroupDropdown({ name, rows, accent, query, updateRow, depth = 0, nestedSubgroups, showBatId }) {
  const filledCount = rows.filter(r => r.weight_kg !== '' && Number(r.weight_kg) > 0).length;
  const totalKg     = rows.filter(r => Number(r.weight_kg) > 0).reduce((s, r) => s + Number(r.weight_kg), 0);
  const [open, setOpen] = useState(false);

  // For Plastics EPR: nested Cat I/II/III blocks (one combined row + drill-down) instead of flat rows
  const nestedDefs = nestedSubgroups?.[name];
  const nestedSegments = nestedDefs
    ? Object.entries(nestedDefs).map(([sub, cats]) => ({ sub, rows: rows.filter(r => cats.includes(r.category) || r.category === sub) })).filter(s => s.rows.length > 0)
    : null;

  const pl = depth === 0 ? 'pl-4' : 'pl-8';
  const bgHeader = depth === 0 ? `${accent.bar}0e` : `${accent.bar}07`;
  const borderL  = depth > 0 ? `border-l-2` : '';
  const borderLColor = depth > 0 ? `border-l-[${accent.bar}]` : '';

  return (
    <div className={`${borderL} ${borderLColor}`} style={depth > 0 ? { borderLeftColor: `${accent.bar}60` } : {}}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`w-full flex items-center justify-between ${pl} pr-4 py-2.5 text-left transition-colors hover:brightness-95`}
        style={{ background: bgHeader, borderBottom: open ? `1px solid ${accent.bar}18` : 'none' }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <svg
            className="flex-shrink-0 transition-transform duration-200"
            style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)', color: accent.bar }}
            width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 6l6 6-6 6" />
          </svg>
          <span className={`font-semibold truncate ${depth === 0 ? 'text-sm text-gray-800' : 'text-xs text-gray-700'}`}>{name}</span>
          {filledCount > 0 && (
            <span className="flex-shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: `${accent.bar}22`, color: accent.bar }}>
              {filledCount} filled · {totalKg.toFixed(2)} kg
            </span>
          )}
          {filledCount === 0 && (
            <span className="flex-shrink-0 text-[10px] text-gray-400">{rows.length} categories</span>
          )}
        </div>
      </button>

      {open && (
        <div style={{ borderBottom: `1px solid ${accent.bar}14` }}>
          {nestedSegments
            ? <div className="divide-y" style={{ divideColor: `${accent.bar}14` }}>
                {nestedSegments.map(({ sub, rows: sRows }) => {
                  const aggregateRow = sRows.find(r => r.category === sub) || null;
                  const detailRows   = sRows.filter(r => r.category !== sub);
                  return (
                    <NestedCategoryBlock
                      key={sub} name={sub} aggregateRow={aggregateRow} detailRows={detailRows}
                      accent={accent} query={query} updateRow={updateRow} depth={depth + 1} showBatId={showBatId}
                    />
                  );
                })}
              </div>
            : <MiniTable rows={rows} accent={accent} query={query} updateRow={updateRow} indent={depth > 0} showBatId={showBatId} />
          }
        </div>
      )}
    </div>
  );
}

function WasteTable({ rows, setRows, title, panel, isOpen, onToggle, subgroups, nestedSubgroups, showBatId }) {
  const [search, setSearch] = useState('');
  const filledRows  = rows.filter(r => r.weight_kg !== '' && Number(r.weight_kg) > 0);
  const totalKg     = filledRows.reduce((s, r) => s + Number(r.weight_kg), 0);
  const accent      = PANEL_ACCENT[panel] || PANEL_ACCENT.general;
  const query       = search.trim().toLowerCase();
  const indexedRows = rows.map((r, i) => ({ ...r, _orig: i }));
  const searchRows  = query ? indexedRows.filter(r => r.category.toLowerCase().includes(query)) : [];

  function updateRow(idx, field, value) {
    setRows(prev => { const next = [...prev]; next[idx] = { ...next[idx], [field]: value }; return next; });
  }

  // Build sub-group segments for dropdown view
  const segments = subgroups
    ? Object.entries(subgroups).map(([groupName, cats]) => ({
        groupName,
        rows: indexedRows.filter(r => cats.includes(r.category)),
      })).filter(g => g.rows.length > 0)
    : null;

  return (
    <div className="rounded-xl overflow-hidden bg-white shadow-sm" style={{ border: `1.5px solid ${accent.bar}33` }}>
      {/* Main panel toggle */}
      <button type="button" onClick={() => onToggle(panel)}
        className="w-full flex items-center justify-between px-5 py-3.5 transition-colors hover:opacity-90"
        style={{ background: accent.light, borderBottom: isOpen ? `1.5px solid ${accent.bar}22` : 'none' }}
      >
        <div className="flex items-center gap-3">
          <span className="text-lg">{accent.icon}</span>
          <span className="font-semibold text-sm text-gray-800">{title}</span>
          {filledRows.length > 0 && (
            <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${accent.badge}`}>
              {filledRows.length} item{filledRows.length > 1 ? 's' : ''} · {totalKg.toFixed(2)} kg
            </span>
          )}
        </div>
        <span className="text-xs text-gray-400 font-medium">{isOpen ? 'Collapse ▲' : 'Expand ▼'}</span>
      </button>

      {isOpen && (
        <>
          {/* Search bar */}
          <div className="px-4 py-3 border-b border-gray-100" style={{ background: accent.light }}>
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: accent.bar }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 105 11a6 6 0 0012 0z" />
              </svg>
              <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder={`Search in ${title}…`}
                className="w-full pl-9 pr-9 py-2 text-sm rounded-lg border bg-white outline-none transition-all"
                style={{ borderColor: search ? accent.bar : '#E5E7EB', boxShadow: search ? `0 0 0 3px ${accent.bar}20` : 'none' }}
              />
              {search && (
                <button type="button" onClick={() => setSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
              )}
            </div>
            {query && (
              <p className="text-xs mt-1.5" style={{ color: accent.bar }}>
                {searchRows.length} of {rows.length} categories match
                {filledRows.filter(r => r.category.toLowerCase().includes(query)).length > 0 &&
                  ` · ${filledRows.filter(r => r.category.toLowerCase().includes(query)).length} with data`}
              </p>
            )}
          </div>

          {/* Search results: flat table */}
          {query && (
            searchRows.length === 0
              ? <div className="flex flex-col items-center gap-2 text-gray-400 py-10">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-4.35-4.35M17 11A6 6 0 105 11a6 6 0 0012 0z" />
                  </svg>
                  <p className="text-sm font-medium">No categories match "<span className="font-semibold">{search}</span>"</p>
                  <button type="button" onClick={() => setSearch('')} className="text-xs underline" style={{ color: accent.bar }}>Clear search</button>
                </div>
              : <MiniTable rows={searchRows} accent={accent} query={query} updateRow={updateRow} showBatId={showBatId} />
          )}

          {/* Sub-group dropdowns (no search active) */}
          {!query && segments && (
            <div className="divide-y divide-gray-100">
              {segments.map(({ groupName, rows: gRows }) => (
                <SubGroupDropdown key={groupName} name={groupName} rows={gRows} accent={accent} query={query} updateRow={updateRow} depth={0} nestedSubgroups={nestedSubgroups} showBatId={showBatId} />
              ))}
            </div>
          )}

          {/* No subgroups: flat table */}
          {!query && !segments && <MiniTable rows={indexedRows} accent={accent} query={query} updateRow={updateRow} showBatId={showBatId} />}

          {/* Footer */}
          {filledRows.length > 0 && (
            <div className="flex items-center justify-between px-4 py-2.5" style={{ background: `${accent.bar}10`, borderTop: `2px solid ${accent.bar}30` }}>
              <span className="text-xs font-bold text-gray-600">{filledRows.length} of {rows.length} categories filled</span>
              <span className="text-sm font-bold" style={{ color: accent.bar }}>{totalKg.toFixed(3)} kg total</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function DeclarationForm() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = Boolean(id);

  const { value: bulkUploadEnabled } = useSetting(SETTING_KEYS.EXCEL_DECLARATION_UPLOAD);
  const [mode, setMode] = useState('manual'); // 'manual' | 'bulk'

  // Dynamic reference data
  const { data: allCategories, loading: catsLoading } = useReferenceData('WASTE_CATEGORY');
  const { data: functionItems }  = useReferenceData('PRODUCTION_FUNCTION');
  const { data: shiftItems }     = useReferenceData('SHIFT');
  const { data: zoneItems }      = useReferenceData('ZONE');
  const functionGroups     = useMemo(() => buildFunctionGroups(functionItems), [functionItems]);

  const initialSource = sourceFromFunction(user?.production_function || '');

  const [header, setHeader] = useState({
    date: today(),
    shift: '',
    time: new Date().toTimeString().slice(0, 5),
    zone: user?.zone || '',
    production_function: user?.production_function || '',
    source: initialSource || 'SOFT',
    reference_no: '',
  });

  // Populate default shift once shifts load
  useEffect(() => {
    if (shiftItems.length && !header.shift) {
      setHeader(h => ({ ...h, shift: shiftItems[0].code }));
    }
  }, [shiftItems]);

  // Populate default function once functions load
  useEffect(() => {
    if (functionItems.length && !header.production_function) {
      setHeader(h => ({ ...h, production_function: functionItems[0].code }));
    }
  }, [functionItems]);

  // Derive category lists from fetched data
  const generalCodes   = useMemo(() => categoryCodesFor(allCategories, header.source, 'GENERAL'),   [allCategories, header.source]);
  const hazardousCodes = useMemo(() => categoryCodesFor(allCategories, header.source, 'HAZARDOUS'), [allCategories, header.source]);
  const ewasteCodes    = useMemo(() => categoryCodesFor(allCategories, header.source, 'EWASTE'),    [allCategories, header.source]);

  const generalSubgroups   = useMemo(() => buildSubgroups(allCategories, header.source, 'GENERAL'),   [allCategories, header.source]);
  const ewasteSubgroups    = useMemo(() => buildSubgroups(allCategories, header.source, 'EWASTE'),    [allCategories, header.source]);
  const generalNested      = useMemo(() => buildNestedSubgroups(allCategories, header.source, 'GENERAL'), [allCategories, header.source]);

  const [generalRows, setGeneralRows]     = useState([]);
  const [hazardousRows, setHazardousRows] = useState([]);
  const [ewasteRows, setEwasteRows]       = useState([]);

  const [openPanels, setOpenPanels] = useState({ general: true, hazardous: false, ewaste: false });
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [loadingDraft, setLoadingDraft] = useState(isEdit);
  const [error, setError] = useState('');

  // Pre-fill form when editing an existing draft
  useEffect(() => {
    if (!isEdit || catsLoading) return;
    setLoadingDraft(true);
    getDeclaration(id)
      .then(decl => {
        if (decl.status !== 'DRAFT') { navigate(`/declaration/${id}`); return; }
        const src = decl.source || sourceFromFunction(decl.production_function);
        setHeader({
          date: decl.date?.slice(0, 10) ?? today(),
          shift: decl.shift,
          time: decl.time,
          zone: decl.zone,
          production_function: decl.production_function,
          source: src,
          reference_no: decl.reference_no || '',
        });

        function mergeRows(codes, waste_type) {
          return codes.map(cat => {
            const saved = decl.line_items?.find(li => li.waste_type === waste_type && li.category === cat);
            return { waste_type, category: cat,
              pallet_qty: saved?.pallet_qty != null ? String(saved.pallet_qty) : '',
              weight_kg:  saved?.weight_kg  != null ? String(saved.weight_kg)  : '',
              remarks:    saved?.remarks    ?? '',
              bat_id:     saved?.bat_id     ?? '' };
          });
        }
        setGeneralRows(mergeRows(categoryCodesFor(allCategories, src, 'GENERAL'),   'GENERAL'));
        setHazardousRows(mergeRows(categoryCodesFor(allCategories, src, 'HAZARDOUS'), 'HAZARDOUS'));
        setEwasteRows(mergeRows(categoryCodesFor(allCategories, src, 'EWASTE'),    'EWASTE'));

        const hasGeneral   = decl.line_items?.some(li => li.waste_type === 'GENERAL'   && Number(li.weight_kg) > 0);
        const hasHazardous = decl.line_items?.some(li => li.waste_type === 'HAZARDOUS' && Number(li.weight_kg) > 0);
        const hasEwaste    = decl.line_items?.some(li => li.waste_type === 'EWASTE'    && Number(li.weight_kg) > 0);
        setOpenPanels({ general: hasGeneral || true, hazardous: hasHazardous, ewaste: hasEwaste });
      })
      .catch(() => setError('Failed to load draft. Please go back and try again.'))
      .finally(() => setLoadingDraft(false));
  }, [id, isEdit, navigate, catsLoading]);

  // Auto-generate reference number when source changes
  useEffect(() => {
    if (isEdit) return;
    getNextReferenceNo(header.source)
      .then(({ reference_no }) => setHeader(h => ({ ...h, reference_no })))
      .catch(() => {});
  }, [isEdit, header.source]);

  // Rebuild waste rows when categories load or source changes
  useEffect(() => {
    if (isEdit || catsLoading) return;
    setGeneralRows(buildDefaultRows(generalCodes,   'GENERAL'));
    setHazardousRows(buildDefaultRows(hazardousCodes, 'HAZARDOUS'));
    setEwasteRows(buildDefaultRows(ewasteCodes,    'EWASTE'));
  }, [isEdit, catsLoading, generalCodes.join(','), hazardousCodes.join(','), ewasteCodes.join(',')]);

  const togglePanel = (panel) => setOpenPanels(p => ({ ...p, [panel]: !p[panel] }));

  function collectLineItems() {
    return [...generalRows, ...hazardousRows, ...ewasteRows]
      .filter(r => r.weight_kg !== '' && Number(r.weight_kg) > 0)
      .map(r => ({
        waste_type: r.waste_type,
        category: r.category,
        pallet_qty: r.pallet_qty !== '' ? Number(r.pallet_qty) : null,
        weight_kg: Number(r.weight_kg),
        remarks: r.remarks || null,
        bat_id: header.source === 'BAT' ? (r.bat_id?.trim() || null) : null,
      }));
  }

  function missingBatIds(line_items) {
    return header.source === 'BAT' && line_items.some(li => !li.bat_id);
  }

  async function handleSave() {
    setError('');
    const line_items = collectLineItems();
    if (!line_items.length) { setError('Enter weight in at least one row.'); return; }
    if (missingBatIds(line_items)) { setError('Enter a BAT ID for every row with a weight entered.'); return; }
    setSaving(true);
    try {
      const decl = isEdit
        ? await updateDeclaration(id, { ...header, line_items })
        : await createDeclaration({ ...header, line_items });
      navigate(`/declaration/${decl.id}`);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Save failed');
    } finally { setSaving(false); }
  }

  async function handleSubmit() {
    setError('');
    const line_items = collectLineItems();
    if (!line_items.length) { setError('Enter weight in at least one row before submitting.'); return; }
    if (missingBatIds(line_items)) { setError('Enter a BAT ID for every row with a weight entered.'); return; }
    setSubmitting(true);
    try {
      const decl = isEdit
        ? await updateDeclaration(id, { ...header, line_items })
        : await createDeclaration({ ...header, line_items });
      await submitDeclaration(decl.id);
      navigate(`/declaration/${decl.id}`);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Submit failed');
    } finally { setSubmitting(false); }
  }

  if (loadingDraft) return (
    <Layout>
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-[#00838F] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-500">Loading draft…</p>
        </div>
      </div>
    </Layout>
  );

  return (
    <Layout>
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="page-title">
              {isEdit ? 'Edit Draft Declaration' : 'New Scrap Declaration'}
            </h1>
            <p className="page-subtitle">
              {isEdit ? 'Update the draft and save or submit for approval.' : 'Fill in all relevant waste categories and submit for approval.'}
            </p>
          </div>
          {isEdit && (
            <button onClick={() => navigate(`/declaration/${id}`)} className="btn-ghost ml-auto text-xs">
              ← Back to Detail
            </button>
          )}
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>
        )}

        {!isEdit && bulkUploadEnabled && (
          <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
            {[
              { key: 'manual', label: 'Manual Entry' },
              { key: 'bulk', label: 'Bulk Upload (Excel)' },
            ].map(t => (
              <button
                key={t.key}
                onClick={() => setMode(t.key)}
                className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  mode === t.key ? 'bg-white text-brand-primary shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}

        {!isEdit && mode === 'bulk' && bulkUploadEnabled ? (
          <BulkDeclarationUpload
            allCategories={allCategories}
            functionGroups={functionGroups}
            zoneItems={zoneItems}
            shiftItems={shiftItems}
          />
        ) : (<>
        {/* Header section */}
        <div className="card">
          <h2 className="font-semibold text-gray-900 mb-4">Declaration Header</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <label className="form-label">Date *</label>
              <input type="date" className="form-input" value={header.date} onChange={e => setHeader(h => ({ ...h, date: e.target.value }))} required />
            </div>
            <div>
              <label className="form-label">Shift *</label>
              <select className="form-select" value={header.shift} onChange={e => setHeader(h => ({ ...h, shift: e.target.value }))}>
                {shiftItems.map(s => <option key={s.code} value={s.code}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Time *</label>
              <input type="time" className="form-input" value={header.time} onChange={e => setHeader(h => ({ ...h, time: e.target.value }))} required />
            </div>
            <div>
              <label className="form-label">Zone *</label>
              <select className="form-select" value={header.zone} onChange={e => setHeader(h => ({ ...h, zone: e.target.value }))}>
                <option value="">— Select Zone —</option>
                {zoneItems.map(z => <option key={z.code} value={z.code}>{z.label}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Function *</label>
              <select className="form-select" value={header.production_function} onChange={e => setHeader(h => ({ ...h, production_function: e.target.value }))}>
                {functionGroups.map(grp => (
                  <optgroup key={grp.label} label={grp.label}>
                    {grp.options.map(f => <option key={f.code} value={f.code}>{f.label}</option>)}
                  </optgroup>
                ))}
              </select>
            </div>
            <div>
              <label className="form-label">Source</label>
              <select className="form-select" value={header.source} onChange={e => setHeader(h => ({ ...h, source: e.target.value }))}>
                <option value="BAT">BAT</option>
                <option value="SOFT">SOFT</option>
              </select>
            </div>
            <div>
              <label className="form-label">Reference No. (auto)</label>
              <input type="text" className="form-input bg-gray-50" readOnly value={header.reference_no} />
            </div>
          </div>
        </div>

        {/* Line item tables */}
        {catsLoading ? (
          <div className="card flex items-center justify-center py-10 text-sm text-gray-400">Loading categories…</div>
        ) : (<>
          <WasteTable
            rows={generalRows} setRows={setGeneralRows}
            title="General Waste" panel="general"
            isOpen={openPanels.general} onToggle={togglePanel}
            subgroups={Object.keys(generalSubgroups).length ? generalSubgroups : undefined}
            nestedSubgroups={generalNested}
            showBatId={header.source === 'BAT'}
          />
          <WasteTable
            rows={hazardousRows} setRows={setHazardousRows}
            title="Hazardous Waste" panel="hazardous"
            isOpen={openPanels.hazardous} onToggle={togglePanel}
            showBatId={header.source === 'BAT'}
          />
          <WasteTable
            rows={ewasteRows} setRows={setEwasteRows}
            title="E-Waste" panel="ewaste"
            isOpen={openPanels.ewaste} onToggle={togglePanel}
            subgroups={Object.keys(ewasteSubgroups).length ? ewasteSubgroups : undefined}
            showBatId={header.source === 'BAT'}
          />
        </>)}

        {/* Approval chain preview */}
        <div className="card">
          <h2 className="font-semibold text-gray-900 mb-4">Approval Chain</h2>
          <div className="flex items-center gap-2 flex-wrap text-sm text-gray-600">
            {['Declared By', 'Dept Head', 'IREP', 'Security', 'Completed'].map((step, i, arr) => (
              <span key={step} className="flex items-center gap-2">
                <span className="bg-gray-100 border border-gray-200 px-3 py-1 rounded-full text-xs font-medium">{step}</span>
                {i < arr.length - 1 && <span className="text-gray-300">→</span>}
              </span>
            ))}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-3 justify-end">
          <button onClick={handleSave} disabled={saving || submitting} className="btn-secondary">
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Save as Draft'}
          </button>
          <button onClick={handleSubmit} disabled={saving || submitting} className="btn-primary">
            {submitting ? 'Submitting…' : 'Submit for Approval'}
          </button>
        </div>
        </>)}
      </div>
    </Layout>
  );
}
