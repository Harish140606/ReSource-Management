import { useState, useEffect, useCallback } from 'react';
import Layout from '../components/Layout.jsx';
import LoadingSpinner from '../components/LoadingSpinner.jsx';
import ErrorAlert from '../components/ErrorAlert.jsx';
import api from '../services/api.js';
import { formatDateTime } from '../utils/dateHelpers.js';
import { usePersistedState } from '../hooks/usePersistedState.js';

const API_BASE = window.location.hostname === 'localhost'
  ? 'http://localhost:4000/api/v1'
  : window.location.origin + '/api/v1';

const ENDPOINTS = [
  { key: 'ledger',        label: 'Ledger',         url: `${API_BASE}/live/ledger`,         desc: 'Full generation & disposal ledger' },
  { key: 'declarations',  label: 'Declarations',    url: `${API_BASE}/live/declarations`,    desc: 'All declarations with totals' },
  { key: 'summary',       label: 'Summary',         url: `${API_BASE}/live/summary`,         desc: 'Daily & weekly KPI summary' },
  { key: 'vendor-pickups',label: 'Vendor Pickups',  url: `${API_BASE}/live/vendor-pickups`,  desc: 'Vendor pickup log' },
];

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }
  return (
    <button onClick={copy} className="text-xs bg-brand-primary/10 hover:bg-brand-primary/20 text-brand-primary px-2 py-1 rounded transition-colors ml-2 flex-shrink-0">
      {copied ? '✓ Copied' : 'Copy'}
    </button>
  );
}

function StatusDot({ status }) {
  const isOk = status === 'SUCCESS';
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${isOk ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${isOk ? 'bg-green-500' : 'bg-red-500'}`} />
      {status}
    </span>
  );
}

function fmtBytes(bytes) {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export default function LiveExcel() {
  const [exportLog, setExportLog]   = useState([]);
  const [logLoading, setLogLoading] = useState(true);
  const [logError, setLogError]     = useState('');
  const [reportInfo, setReportInfo] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [genMsg, setGenMsg]         = useState('');
  const [genError, setGenError]     = useState('');
  const [rangeFrom, setRangeFrom]   = usePersistedState('liveExcel_rangeFrom', '');
  const [rangeTo, setRangeTo]       = usePersistedState('liveExcel_rangeTo', '');

  const loadLog = useCallback(async () => {
    setLogLoading(true);
    setLogError('');
    try {
      const [logRes, infoRes] = await Promise.all([
        api.get('/admin-excel/export-log'),
        api.get('/admin-excel/report-info'),
      ]);
      setExportLog(logRes.data?.data?.items ?? []);
      const info = infoRes.data?.data ?? null;
      setReportInfo(info);
      // Pre-fill the range pickers to the full available data span.
      if (info?.dataRange) {
        setRangeFrom(prev => prev || info.dataRange.min);
        setRangeTo(prev => prev || info.dataRange.max);
      }
    } catch (err) {
      setLogError(err.response?.data?.error?.message || 'Failed to load export log');
    } finally { setLogLoading(false); }
  }, []);

  useEffect(() => { loadLog(); }, [loadLog]);

  const handleGenerate = useCallback(async (silent = false) => {
    if (!silent) setGenMsg('');
    setGenError('');
    setGenerating(true);
    try {
      await api.post('/admin-excel/generate-report');
      if (!silent) setGenMsg('Report generated! All historical data is now included. Click Download to get it.');
      loadLog();
    } catch (err) {
      if (!silent) setGenError(err.response?.data?.error?.message || 'Generation failed');
    } finally { setGenerating(false); }
  }, [loadLog]);

  // Auto-refresh: regenerate as soon as the page opens, then every 5 minutes
  // while it stays open — no more manual "Regenerate" clicking required.
  const AUTO_REFRESH_MS = 5 * 60 * 1000;
  useEffect(() => {
    handleGenerate(true);
    const interval = setInterval(() => handleGenerate(true), AUTO_REFRESH_MS);
    return () => clearInterval(interval);
  }, [handleGenerate]);

  function handleDownload() {
    setGenError('');
    const token = localStorage.getItem('access_token');

    // Only send a range when the user has narrowed it below the full data span;
    // a full/empty range downloads the cached full-history file.
    const full = reportInfo?.dataRange;
    const isFullRange = !full || (rangeFrom === full.min && rangeTo === full.max);
    const q = (!isFullRange && rangeFrom && rangeTo)
      ? `?date_from=${rangeFrom}&date_to=${rangeTo}`
      : '';
    const filename = q
      ? `ReSource_Scrap_Report_${rangeFrom}_to_${rangeTo}.xlsx`
      : 'ReSource_Scrap_Report.xlsx';

    const link = document.createElement('a');
    link.setAttribute('download', filename);

    fetch(`${API_BASE}/admin-excel/download-report${q}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.blob())
      .then(blob => {
        const url = URL.createObjectURL(blob);
        link.href = url;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      })
      .catch(() => setGenError('Download failed. Try generating the report first.'));
  }

  return (
    <Layout>
      <div className="space-y-6 max-w-4xl">
        <div>
          <h1 className="page-title">Excel Reports & Live Connection</h1>
          <p className="page-subtitle">Download the full scrap report or connect Excel via live Power Query endpoints.</p>
        </div>

        {/* Section 1 — Download Report */}
        <div className="card">
          <div className="flex items-start justify-between flex-wrap gap-4 mb-5">
            <div>
              <h2 className="font-semibold text-gray-900">Full History Report</h2>
              <p className="text-sm text-gray-500 mt-0.5">
                Downloads <span className="font-mono text-xs bg-gray-100 px-1 rounded">ReSource_Scrap_Report.xlsx</span> — all declarations, ledger, and summary in one file.
                Auto-refreshes every 5 minutes while this page is open, plus on declaration completion and nightly at 23:55.
              </p>
            </div>
            <div className="flex gap-2 flex-shrink-0">
              <button onClick={() => handleGenerate(false)} disabled={generating} className="btn-secondary text-sm">
                {generating ? 'Generating…' : '⟳ Refresh Now'}
              </button>
              <button onClick={handleDownload} className="btn-primary text-sm">
                ↓ Download Excel
              </button>
            </div>
          </div>

          {genError && (
            <div className="bg-red-50 border border-red-200 text-red-800 text-sm rounded-lg p-3 mb-4">{genError}</div>
          )}
          {genMsg && (
            <div className="bg-green-50 border border-green-200 text-green-800 text-sm rounded-lg p-3 mb-4">{genMsg}</div>
          )}

          {/* Date-range selector */}
          <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 mb-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <p className="text-sm font-medium text-gray-800">Download date range</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {reportInfo?.dataRange
                    ? <>Data available {reportInfo.dataRange.min} → {reportInfo.dataRange.max}. Narrow the dates to export part of it; leave as-is for everything.</>
                    : 'No ledger data yet.'}
                </p>
              </div>
              <div className="flex items-end gap-2">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">From</label>
                  <input type="date" className="form-input text-sm py-1.5"
                    min={reportInfo?.dataRange?.min} max={reportInfo?.dataRange?.max}
                    value={rangeFrom} onChange={e => setRangeFrom(e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">To</label>
                  <input type="date" className="form-input text-sm py-1.5"
                    min={reportInfo?.dataRange?.min} max={reportInfo?.dataRange?.max}
                    value={rangeTo} onChange={e => setRangeTo(e.target.value)} />
                </div>
                {reportInfo?.dataRange && (rangeFrom !== reportInfo.dataRange.min || rangeTo !== reportInfo.dataRange.max) && (
                  <button
                    onClick={() => { setRangeFrom(reportInfo.dataRange.min); setRangeTo(reportInfo.dataRange.max); }}
                    className="text-xs text-brand-primary underline pb-2"
                  >Reset</button>
                )}
              </div>
            </div>
          </div>

          {/* File info */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 flex items-center gap-4">
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-green-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm text-gray-900 truncate">ReSource_Scrap_Report.xlsx</p>
              {reportInfo?.exists ? (
                <p className="text-xs text-gray-500 mt-0.5">
                  {fmtBytes(reportInfo.size)} · Last updated {formatDateTime(reportInfo.lastModified)}
                </p>
              ) : (
                <p className="text-xs text-gray-400 mt-0.5">Not generated yet — auto-refresh will create it shortly, or click Refresh Now.</p>
              )}
            </div>
            <div className="flex-shrink-0 flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs text-gray-500">
                <span className={`w-1.5 h-1.5 rounded-full bg-green-500 ${generating ? 'animate-pulse' : ''}`} />
                Auto-refresh every 5 min
              </span>
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${reportInfo?.exists ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${reportInfo?.exists ? 'bg-green-500' : 'bg-gray-400'}`} />
                {reportInfo?.exists ? 'Ready' : 'Not ready'}
              </span>
            </div>
          </div>

          {/* Workbook sheet guide */}
          <div className="mt-4 border border-gray-100 rounded-lg divide-y divide-gray-100 text-sm">
            {[
              { sheet: 'Summary',          desc: 'All-time totals by source and waste type, declaration counts' },
              { sheet: 'SOFT General/Hazardous/E-Waste', desc: 'SOFT production ledger (detailed categories) — opening, waste, disposal, closing stock' },
              { sheet: 'BAT General/Hazardous/E-Waste',  desc: 'BAT production ledger (high-level categories) on its own sheets' },
              { sheet: 'Declarations Log', desc: 'All declarations with employee, zone, status, weight, and timestamps' },
            ].map(s => (
              <div key={s.sheet} className="flex items-start gap-3 px-4 py-2.5">
                <span className="bg-[#00838F] text-white text-xs font-semibold px-2 py-0.5 rounded mt-0.5 flex-shrink-0">{s.sheet}</span>
                <span className="text-gray-600 text-xs">{s.desc}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Section 2 — Power Query live endpoints */}
        <div className="card">
          <h2 className="font-semibold text-gray-900 mb-1">Power Query Live Endpoints</h2>
          <p className="text-xs text-gray-500 mb-4">
            Connect Excel directly for real-time data. Use <strong>Data → Get Data → From Web (Advanced)</strong> with your Bearer token.
          </p>

          <div className="space-y-3">
            {ENDPOINTS.map(ep => (
              <div key={ep.key} className="flex items-center justify-between gap-3 border border-gray-200 rounded-lg p-3">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="flex items-center gap-1.5 bg-green-100 text-green-800 text-xs font-semibold px-2.5 py-0.5 rounded-full flex-shrink-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                    Live
                  </span>
                  <div className="min-w-0">
                    <p className="font-medium text-sm text-gray-900">{ep.label}</p>
                    <p className="text-xs text-gray-500 truncate font-mono">{ep.url}</p>
                    <p className="text-xs text-gray-400">{ep.desc}</p>
                  </div>
                </div>
                <CopyButton text={ep.url} />
              </div>
            ))}
          </div>

          <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-800">
            <strong>Get your token:</strong> Run in PowerShell:
            <pre className="mt-1 font-mono bg-blue-100 rounded p-2 text-xs overflow-x-auto">{`$r = Invoke-RestMethod -Uri "http://localhost:4000/api/v1/auth/login" -Method POST -Body '{"emp_no":"EMP001","password":"resource@123"}' -ContentType "application/json"
Write-Host "Bearer $($r.data.access_token)"`}</pre>
          </div>
        </div>

        {/* Section 3 — Export log */}
        <div className="card">
          <h2 className="font-semibold text-gray-900 mb-4">Export History</h2>
          {logLoading ? <LoadingSpinner /> : logError ? <ErrorAlert message={logError} onRetry={loadLog} /> : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr>
                    {['Triggered By', 'Timestamp', 'Filename', 'Status'].map(h => (
                      <th key={h} className="table-header">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {exportLog.map((row, i) => (
                    <tr key={row.id} className={i % 2 === 1 ? 'bg-gray-50' : ''}>
                      <td className="table-cell text-xs font-medium">{row.triggered_by.replace(/_/g, ' ')}</td>
                      <td className="table-cell text-xs">{formatDateTime(row.created_at)}</td>
                      <td className="table-cell text-xs font-mono">{row.filename || '—'}</td>
                      <td className="table-cell"><StatusDot status={row.status} /></td>
                    </tr>
                  ))}
                  {!exportLog.length && (
                    <tr><td colSpan={4} className="table-cell text-center text-gray-400 py-8">No exports yet — complete a declaration or click Regenerate</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
