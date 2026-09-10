import { useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { createDeclaration } from '../services/declarations.js';
import { readPivotWorkbook, resolveRows, groupIntoDeclarations, ambiguousCategories } from '../utils/bulkDeclarationExcel.js';
import { fmtKg } from '../utils/formatters.js';

export default function BulkDeclarationUpload({ allCategories, functionGroups, zoneItems, shiftItems }) {
  const fileRef = useRef(null);

  const [shift, setShift] = useState('');
  const [zone, setZone] = useState('');
  const [productionFunction, setProductionFunction] = useState('');

  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState('');
  const [resolved, setResolved] = useState(null);
  const [unmatched, setUnmatched] = useState([]);
  const [sourceOverrides, setSourceOverrides] = useState({});
  const [batIds, setBatIds] = useState({}); // date -> BAT ID string

  const [confirming, setConfirming] = useState(false);
  const [confirmProgress, setConfirmProgress] = useState(0);
  const [results, setResults] = useState(null);

  const headerReady = shift && zone && productionFunction;
  const ambiguous = resolved ? ambiguousCategories(resolved) : [];
  const ambiguousResolved = ambiguous.every(a => sourceOverrides[a.category]);
  const groups = resolved ? groupIntoDeclarations(resolved, sourceOverrides) : [];

  function batIdFor(date) { return batIds[date] || ''; }
  function setBatId(date, value) { setBatIds(b => ({ ...b, [date]: value })); }

  const missingBatId = groups.some(g => g.source === 'BAT' && !batIdFor(g.date).trim());
  const canConfirm = headerReady && resolved && groups.length > 0 &&
    unmatched.length === 0 && ambiguousResolved && !missingBatId;

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setParseError('');
    setResults(null);
    setParsing(true);
    try {
      const rawRows = await readPivotWorkbook(file);
      if (!rawRows.length) {
        throw new Error('No data rows found. The file needs a row whose first cell is "Date", with category columns to its right (the same pivot layout as your Live Excel report).');
      }
      const { resolved: r, unmatched: u } = resolveRows(rawRows, allCategories);
      setResolved(r);
      setUnmatched(u);
      setSourceOverrides({});
      setBatIds({});
    } catch (err) {
      setParseError(err.message || 'Could not read this file');
      setResolved(null);
    } finally {
      setParsing(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function handleConfirm() {
    setConfirming(true);
    setConfirmProgress(0);
    const out = [];
    for (const g of groups) {
      const payload = {
        date: g.date,
        shift,
        time: new Date().toTimeString().slice(0, 5),
        zone,
        production_function: productionFunction,
        source: g.source,
        line_items: g.items.map(it => ({
          waste_type: it.waste_type,
          category: it.category,
          weight_kg: it.weight_kg,
          bat_id: g.source === 'BAT' ? (batIdFor(g.date).trim() || null) : null,
        })),
      };
      try {
        const decl = await createDeclaration(payload);
        out.push({ ok: true, date: g.date, source: g.source, declaration_no: decl.declaration_no });
      } catch (err) {
        out.push({ ok: false, date: g.date, source: g.source, error: err.response?.data?.error?.message || 'Failed to create' });
      }
      setConfirmProgress(p => p + 1);
    }
    setResults(out);
    setConfirming(false);
  }

  function reset() {
    setResolved(null);
    setUnmatched([]);
    setSourceOverrides({});
    setBatIds({});
    setResults(null);
  }

  if (results) {
    const okCount = results.filter(r => r.ok).length;
    return (
      <div className="card space-y-4">
        <h2 className="font-semibold text-gray-900">Upload Complete</h2>
        <p className="text-sm text-gray-600">
          {okCount} of {results.length} declaration(s) created as drafts. Review and submit each one from My Submissions.
        </p>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
            <thead>
              <tr>
                {['Date', 'Source', 'Result'].map(h => <th key={h} className="table-header">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {results.map((r, i) => (
                <tr key={i} className={i % 2 === 1 ? 'bg-gray-50' : ''}>
                  <td className="table-cell">{r.date}</td>
                  <td className="table-cell">{r.source}</td>
                  <td className="table-cell">
                    {r.ok
                      ? <span className="text-green-700">✓ Created {r.declaration_no}</span>
                      : <span className="text-red-600">✗ {r.error}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex justify-end gap-3">
          <button onClick={reset} className="btn-secondary text-sm">Upload Another File</button>
          <Link to="/submissions" className="btn-primary text-sm">Go to My Submissions</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="card">
        <h2 className="font-semibold text-gray-900 mb-1">Bulk Upload via Excel</h2>
        <p className="text-sm text-gray-500 mb-4">
          Upload a pivot-style workbook (same Date / Opening / Waste for the Day / Disposal / Closing layout as your
          Live Excel report). Each date becomes its own declaration — BAT or SOFT is detected automatically per
          category, so a single file can produce both kinds of declarations.
        </p>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-5">
          <div>
            <label className="form-label">Shift *</label>
            <select className="form-select" value={shift} onChange={e => setShift(e.target.value)}>
              <option value="">— Select Shift —</option>
              {shiftItems.map(s => <option key={s.code} value={s.code}>{s.label}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label">Zone *</label>
            <select className="form-select" value={zone} onChange={e => setZone(e.target.value)}>
              <option value="">— Select Zone —</option>
              {zoneItems.map(z => <option key={z.code} value={z.code}>{z.label}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label">Function *</label>
            <select className="form-select" value={productionFunction} onChange={e => setProductionFunction(e.target.value)}>
              <option value="">— Select Function —</option>
              {functionGroups.map(grp => (
                <optgroup key={grp.label} label={grp.label}>
                  {grp.options.map(f => <option key={f.code} value={f.code}>{f.label}</option>)}
                </optgroup>
              ))}
            </select>
          </div>
        </div>

        {!headerReady && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2 mb-3">
            Pick Shift, Zone, and Function before uploading — they apply to every declaration created from this file.
          </p>
        )}

        {parseError && <div className="text-red-600 text-sm mb-3 bg-red-50 border border-red-200 rounded p-3">{parseError}</div>}

        <div className="flex items-center gap-3">
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFile}
            disabled={!headerReady || parsing}
            className="block text-sm text-gray-600 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-brand-primary file:text-white hover:file:bg-teal-700 file:cursor-pointer disabled:opacity-50"
          />
          {parsing && <span className="text-sm text-gray-500">Reading file…</span>}
        </div>
      </div>

      {resolved && (
        <div className="card space-y-4">
          <h2 className="font-semibold text-gray-900">Review &amp; Confirm</h2>

          {unmatched.length > 0 && (
            <div className="text-red-700 text-sm bg-red-50 border border-red-300 rounded p-3">
              <p className="font-semibold mb-1">⚠ Unrecognised column(s) — fix the file and re-upload:</p>
              <ul className="list-disc pl-5">
                {unmatched.map(u => <li key={u.headerText}>"{u.headerText}" ({u.dateCount} date{u.dateCount > 1 ? 's' : ''})</li>)}
              </ul>
            </div>
          )}

          {ambiguous.length > 0 && (
            <div className="bg-amber-50 border border-amber-300 rounded p-3">
              <p className="font-semibold text-amber-800 text-sm mb-2">⚠ These categories apply to both BAT and SOFT — pick which one for this upload:</p>
              <div className="space-y-2">
                {ambiguous.map(a => (
                  <div key={a.category} className="flex items-center gap-3 text-sm">
                    <span className="text-gray-700">{a.label}</span>
                    <select
                      className="form-select text-xs py-1 w-auto"
                      value={sourceOverrides[a.category] || ''}
                      onChange={e => setSourceOverrides(s => ({ ...s, [a.category]: e.target.value }))}
                    >
                      <option value="">— choose —</option>
                      <option value="BAT">BAT</option>
                      <option value="SOFT">SOFT</option>
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
              <thead>
                <tr>
                  {['Date', 'Source', 'Items', 'Total Weight', 'BAT ID'].map(h => <th key={h} className="table-header">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {groups.map((g, i) => {
                  const total = g.items.reduce((s, it) => s + it.weight_kg, 0);
                  const needsBatId = g.source === 'BAT';
                  return (
                    <tr key={`${g.date}-${g.source}`} className={i % 2 === 1 ? 'bg-gray-50' : ''}>
                      <td className="table-cell">{g.date}</td>
                      <td className="table-cell">
                        <span className={`font-semibold text-xs ${g.source === 'BAT' ? 'text-brand-primary' : 'text-brand-cyan'}`}>{g.source}</span>
                      </td>
                      <td className="table-cell text-xs text-gray-600">{g.items.map(it => it.label).join(', ')}</td>
                      <td className="table-cell">{fmtKg(total)}</td>
                      <td className="table-cell">
                        {needsBatId ? (
                          <input
                            type="text"
                            className={`form-input text-xs py-1 w-32 ${!batIdFor(g.date).trim() ? 'border-red-300' : ''}`}
                            placeholder="BAT ID *"
                            value={batIdFor(g.date)}
                            onChange={e => setBatId(g.date, e.target.value)}
                          />
                        ) : '—'}
                      </td>
                    </tr>
                  );
                })}
                {!groups.length && (
                  <tr><td colSpan={5} className="table-cell text-center text-gray-400 py-8">Nothing to declare — every value in the file is zero or blank.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end gap-3">
            <button onClick={reset} className="btn-secondary text-sm">Cancel</button>
            <button onClick={handleConfirm} disabled={!canConfirm || confirming} className="btn-primary text-sm">
              {confirming ? `Creating… (${confirmProgress}/${groups.length})` : `Confirm & Create ${groups.length} Declaration${groups.length > 1 ? 's' : ''}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
