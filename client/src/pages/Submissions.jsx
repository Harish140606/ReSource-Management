import { useState } from 'react';
import Layout from '../components/Layout.jsx';
import DeclarationTable from '../components/DeclarationTable.jsx';
import Pagination from '../components/Pagination.jsx';
import ErrorAlert from '../components/ErrorAlert.jsx';
import { useDeclarations } from '../hooks/useDeclarations.js';
import { deleteDeclaration } from '../services/declarations.js';
import { today, weekAgo } from '../utils/dateHelpers.js';
import { usePersistedState } from '../hooks/usePersistedState.js';

export default function Submissions() {
  const [filters, setFilters] = usePersistedState('submissions_filters', {
    date_from: weekAgo(), date_to: today(), status: '', page: 1, limit: 20, sort_by: '', sort_dir: 'asc',
  });
  const { data, loading, error, refetch, setParams } = useDeclarations(filters);

  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkError, setBulkError] = useState('');

  function applyFilters(next) {
    const updated = { ...filters, ...next, page: 1 };
    setFilters(updated);
    setParams(updated);
  }

  function onPage(p) {
    const updated = { ...filters, page: p };
    setFilters(updated);
    setParams(updated);
    setSelectedIds(new Set());
  }

  function onSort(key) {
    const updated = {
      ...filters,
      sort_by: key,
      sort_dir: filters.sort_by === key && filters.sort_dir === 'asc' ? 'desc' : 'asc',
    };
    setFilters(updated);
    setParams(updated);
  }

  function toggleSelect(id) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    const items = data?.items || [];
    setSelectedIds(prev => {
      const allSelected = items.length > 0 && items.every(d => prev.has(d.id));
      if (allSelected) return new Set();
      return new Set(items.map(d => d.id));
    });
  }

  async function handleBulkDelete() {
    if (!selectedIds.size) return;
    if (!window.confirm(`Delete ${selectedIds.size} selected declaration(s)? This cannot be undone.`)) return;
    setBulkDeleting(true);
    setBulkError('');
    try {
      await Promise.all([...selectedIds].map(id => deleteDeclaration(id)));
      setSelectedIds(new Set());
      refetch();
    } catch (err) {
      setBulkError(err.response?.data?.error?.message || 'Some declarations could not be deleted');
    } finally { setBulkDeleting(false); }
  }

  return (
    <Layout>
      <div className="space-y-5">
        <div>
          <h1 className="page-title">My Submissions</h1>
          <p className="page-subtitle">Declarations you've submitted.</p>
        </div>

        {/* Filters */}
        <div className="card flex flex-wrap gap-3 items-end">
          <div>
            <label className="form-label">From</label>
            <input type="date" className="form-input w-auto" value={filters.date_from} onChange={e => applyFilters({ date_from: e.target.value })} />
          </div>
          <div>
            <label className="form-label">To</label>
            <input type="date" className="form-input w-auto" value={filters.date_to} onChange={e => applyFilters({ date_to: e.target.value })} />
          </div>
          <div>
            <label className="form-label">Status</label>
            <select className="form-select w-auto" value={filters.status} onChange={e => applyFilters({ status: e.target.value })}>
              <option value="">All</option>
              {['DRAFT', 'SUBMITTED', 'DEPT_APPROVED', 'IREP_AUTHORIZED', 'COMPLETED'].map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <button onClick={() => applyFilters({ date_from: '', date_to: '', status: '' })} className="btn-secondary text-xs">Reset</button>

          {selectedIds.size > 0 && (
            <button onClick={handleBulkDelete} disabled={bulkDeleting} className="btn-secondary text-xs text-red-600 border-red-300 hover:bg-red-50 ml-auto">
              {bulkDeleting ? 'Deleting…' : `Delete Selected (${selectedIds.size})`}
            </button>
          )}
        </div>

        {bulkError && <ErrorAlert message={bulkError} />}
        {error && <ErrorAlert message={error} onRetry={refetch} />}

        <DeclarationTable
          items={data?.items} loading={loading} emptyText="No submissions found for the selected filters."
          sortKey={filters.sort_by} sortDir={filters.sort_dir} onSort={onSort}
          selectable selectedIds={selectedIds} onToggleSelect={toggleSelect} onToggleSelectAll={toggleSelectAll}
        />
        <Pagination page={data?.page || 1} pages={data?.pages || 1} onPage={onPage} />
      </div>
    </Layout>
  );
}
