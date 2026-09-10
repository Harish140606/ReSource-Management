import { useParams, useNavigate } from 'react-router-dom';
import Layout from '../components/Layout.jsx';
import ApprovalChain from '../components/ApprovalChain.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import LoadingSpinner from '../components/LoadingSpinner.jsx';
import ErrorAlert from '../components/ErrorAlert.jsx';
import { useDeclaration } from '../hooks/useDeclarations.js';
import { useAuth } from '../hooks/useAuth.jsx';
import { approveDeclaration, submitDeclaration, deleteDeclaration, deleteLineItem, editLineItem, updateStorageLocations } from '../services/declarations.js';
import { useReferenceData } from '../hooks/useReferenceData.js';
import { formatDate, formatDateTime } from '../utils/dateHelpers.js';
import { fmtKg } from '../utils/formatters.js';
import { downloadDeclarationPdf } from '../utils/declarationPdf.js';
import { useState, useEffect } from 'react';

const APPROVER_FOR = {
  SUBMITTED:          ['DEPT_HEAD', 'IREP', 'SECURITY', 'FACILITY_MANAGER', 'ADMIN'],
  DEPT_APPROVED:      ['IREP', 'FACILITY_MANAGER', 'ADMIN'],
  IREP_AUTHORIZED:    ['SECURITY', 'FACILITY_MANAGER', 'ADMIN'],
};

export default function DeclarationDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: decl, loading, error, refetch } = useDeclaration(id);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState('');

  const canEdit    = decl?.status === 'DRAFT' && (decl?.employee_id === user?.id || user?.role === 'ADMIN');
  const canSubmit  = canEdit;
  const canApprove = decl && (APPROVER_FOR[decl.status] || []).includes(user?.role);
  const canDelete  = decl && (decl.employee_id === user?.id || user?.role === 'ADMIN');
  const canSetStorage = ['IREP', 'ADMIN'].includes(user?.role);
  const canDeleteLineItem = user?.role === 'ADMIN';
  const canEditLineItem = user?.role === 'ADMIN';
  const [deletingLineItemId, setDeletingLineItemId] = useState(null);
  const [editingLineItemId, setEditingLineItemId] = useState(null);
  const [lineItemEdits, setLineItemEdits] = useState({});
  const [lineItemSaving, setLineItemSaving] = useState(false);

  const { data: storageItems }  = useReferenceData('STORAGE_LOCATION');
  const { data: functionItems } = useReferenceData('PRODUCTION_FUNCTION');
  const fnLabel  = (code) => functionItems.find(f => f.code === code)?.label || code || '—';
  const locLabel = (code) => storageItems.find(s => s.code === code)?.label || code || '—';

  const [storageEdits, setStorageEdits] = useState({});
  const [initialStorage, setInitialStorage] = useState({});
  const [storageSaving, setStorageSaving] = useState(false);
  const [storageSaved, setStorageSaved] = useState(false);

  useEffect(() => {
    if (!decl) return;
    const initial = {};
    for (const li of decl.line_items ?? []) initial[li.id] = li.storage_location || '';
    setStorageEdits(initial);
    setInitialStorage(initial);
  }, [decl]);

  // Storage location is compulsory, but edits are only saved when the user
  // clicks "Save Storage Locations" — not on every single selection.
  function handleStorageChange(lineItemId, value) {
    setStorageEdits(s => ({ ...s, [lineItemId]: value }));
    setStorageSaved(false);
  }

  const storageDirty = Object.keys(storageEdits).some(id => storageEdits[id] !== initialStorage[id]);

  async function handleSaveStorage() {
    const changed = Object.entries(storageEdits)
      .filter(([id, val]) => val && val !== initialStorage[id])
      .map(([line_item_id, storage_location]) => ({ line_item_id, storage_location }));
    if (!changed.length) return;
    setActionError('');
    setStorageSaving(true);
    try {
      await updateStorageLocations(decl.id, changed);
      setStorageSaved(true);
      refetch();
    } catch (err) {
      setActionError(err.response?.data?.error?.message || 'Failed to save storage locations');
    } finally { setStorageSaving(false); }
  }

  async function handleApprove() {
    setActionError('');
    setActionLoading(true);
    try {
      await approveDeclaration(decl.id);
      refetch();
    } catch (err) {
      setActionError(err.response?.data?.error?.message || 'Approval failed');
    } finally { setActionLoading(false); }
  }

  async function handleDelete() {
    const warning = decl.status === 'COMPLETED'
      ? `Delete declaration ${decl.declaration_no}? This is COMPLETED and its ledger entries will also be removed. This cannot be undone.`
      : `Delete declaration ${decl.declaration_no}? This cannot be undone.`;
    if (!window.confirm(warning)) return;
    setActionError('');
    setActionLoading(true);
    try {
      await deleteDeclaration(decl.id);
      navigate('/submissions');
    } catch (err) {
      setActionError(err.response?.data?.error?.message || 'Delete failed');
      setActionLoading(false);
    }
  }

  async function handleDeleteLineItem(li) {
    if (!window.confirm(`Remove "${li.category}" (${li.weight_kg ?? 0} kg) from this declaration? The other line items are not affected. This cannot be undone.`)) return;
    setActionError('');
    setDeletingLineItemId(li.id);
    try {
      await deleteLineItem(decl.id, li.id);
      refetch();
    } catch (err) {
      setActionError(err.response?.data?.error?.message || 'Failed to remove line item');
    } finally { setDeletingLineItemId(null); }
  }

  function handleStartEditLineItem(li) {
    setActionError('');
    setEditingLineItemId(li.id);
    setLineItemEdits({
      category: li.category ?? '',
      weight_kg: li.weight_kg ?? '',
      pallet_qty: li.pallet_qty ?? '',
      remarks: li.remarks ?? '',
      bat_id: li.bat_id ?? '',
    });
  }

  function handleCancelEditLineItem() {
    setEditingLineItemId(null);
    setLineItemEdits({});
  }

  async function handleSaveEditLineItem(li) {
    setActionError('');
    setLineItemSaving(true);
    try {
      await editLineItem(decl.id, li.id, {
        category: lineItemEdits.category?.trim() || li.category,
        weight_kg: lineItemEdits.weight_kg === '' ? null : Number(lineItemEdits.weight_kg),
        pallet_qty: lineItemEdits.pallet_qty === '' ? null : Number(lineItemEdits.pallet_qty),
        remarks: lineItemEdits.remarks?.trim() || null,
        bat_id: lineItemEdits.bat_id?.trim() || null,
      });
      setEditingLineItemId(null);
      setLineItemEdits({});
      refetch();
    } catch (err) {
      setActionError(err.response?.data?.error?.message || 'Failed to update line item');
    } finally { setLineItemSaving(false); }
  }

  async function handleSubmitAction() {
    setActionError('');
    setActionLoading(true);
    try {
      await submitDeclaration(decl.id);
      refetch();
    } catch (err) {
      setActionError(err.response?.data?.error?.message || 'Submit failed');
    } finally { setActionLoading(false); }
  }

  function handlePrint() {
    try {
      downloadDeclarationPdf(decl, { fnLabel, locLabel });
    } catch (err) {
      setActionError('PDF generation failed');
    }
  }

  if (loading) return <Layout><LoadingSpinner /></Layout>;
  if (error) return <Layout><ErrorAlert message={error} onRetry={refetch} /></Layout>;
  if (!decl) return null;

  const totalWeight = decl.line_items?.reduce((s, li) => s + Number(li.weight_kg ?? 0), 0) ?? 0;

  return (
    <Layout>
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold font-mono text-white">{decl.declaration_no}</h1>
            <p className="text-sm text-white/60 mt-0.5">
              {formatDate(decl.date)} · Shift {decl.shift} · {decl.time}
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <StatusBadge status={decl.status} />
            <button onClick={handlePrint} className="btn-secondary text-xs">🖶 Print / Download PDF</button>
          </div>
        </div>

        {actionError && <ErrorAlert message={actionError} />}

        {/* Info card */}
        <div className="card grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
          <div><p className="text-gray-500 text-xs">Declared By</p><p className="font-medium">{decl.employee?.name} ({decl.employee?.emp_no})</p></div>
          <div><p className="text-gray-500 text-xs">Zone</p><p className="font-medium">{decl.zone}</p></div>
          <div><p className="text-gray-500 text-xs">Function</p><p className="font-medium">{fnLabel(decl.production_function)}</p></div>
          <div><p className="text-gray-500 text-xs">Source</p><p className={`font-semibold ${decl.source === 'BAT' ? 'text-brand-primary' : 'text-brand-cyan'}`}>{decl.source}</p></div>
          <div><p className="text-gray-500 text-xs">Reference No</p><p className="font-medium">{decl.reference_no || '—'}</p></div>
          <div><p className="text-gray-500 text-xs">Total Weight</p><p className="font-semibold text-brand-primary">{fmtKg(totalWeight)}</p></div>
          {decl.description && <div className="col-span-full"><p className="text-gray-500 text-xs">Description</p><p className="font-medium">{decl.description}</p></div>}
        </div>

        {/* Approval chain */}
        <div className="card">
          <h2 className="font-semibold text-gray-900 mb-4">Approval Chain</h2>
          <ApprovalChain declaration={decl} />
        </div>

        {/* Line items */}
        <div className="card">
          <h2 className="font-semibold text-gray-900 mb-4">Line Items</h2>
          {['GENERAL', 'HAZARDOUS', 'EWASTE'].map(wt => {
            const rows = decl.line_items?.filter(li => li.waste_type === wt) ?? [];
            if (!rows.length) return null;
            return (
              <div key={wt} className="mb-4">
                <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">{wt}</h3>
                <table className="min-w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
                  <thead>
                    <tr>
                      <th className="table-header">Category</th>
                      <th className="table-header">Pallets</th>
                      <th className="table-header">Weight (kg)</th>
                      {decl.source === 'BAT' && <th className="table-header">BAT ID</th>}
                      <th className="table-header">Remarks</th>
                      <th className="table-header">Storage Location{canSetStorage && <span className="text-red-500"> *</span>}</th>
                      {(canDeleteLineItem || canEditLineItem) && <th className="table-header text-right">Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((li, i) => {
                      const val = storageEdits[li.id] ?? '';
                      const isEditingLi = editingLineItemId === li.id;
                      if (isEditingLi) {
                        return (
                          <tr key={li.id} className={i % 2 === 1 ? 'bg-gray-50' : ''}>
                            <td className="table-cell">
                              <input className="form-input text-xs py-1" value={lineItemEdits.category}
                                onChange={e => setLineItemEdits(s => ({ ...s, category: e.target.value }))} />
                            </td>
                            <td className="table-cell">
                              <input type="number" className="form-input text-xs py-1 w-20" value={lineItemEdits.pallet_qty}
                                onChange={e => setLineItemEdits(s => ({ ...s, pallet_qty: e.target.value }))} />
                            </td>
                            <td className="table-cell">
                              <input type="number" className="form-input text-xs py-1 w-24" value={lineItemEdits.weight_kg}
                                onChange={e => setLineItemEdits(s => ({ ...s, weight_kg: e.target.value }))} />
                            </td>
                            {decl.source === 'BAT' && (
                              <td className="table-cell">
                                <input className="form-input text-xs py-1 w-24" value={lineItemEdits.bat_id}
                                  onChange={e => setLineItemEdits(s => ({ ...s, bat_id: e.target.value }))} />
                              </td>
                            )}
                            <td className="table-cell">
                              <input className="form-input text-xs py-1" value={lineItemEdits.remarks}
                                onChange={e => setLineItemEdits(s => ({ ...s, remarks: e.target.value }))} />
                            </td>
                            <td className="table-cell text-gray-400 text-xs">—</td>
                            <td className="table-cell text-right whitespace-nowrap">
                              <button onClick={() => handleSaveEditLineItem(li)} disabled={lineItemSaving}
                                className="text-green-700 hover:text-green-900 text-xs font-medium disabled:opacity-50 mr-2">
                                {lineItemSaving ? 'Saving…' : 'Save'}
                              </button>
                              <button onClick={handleCancelEditLineItem} disabled={lineItemSaving}
                                className="text-gray-500 hover:text-gray-700 text-xs font-medium disabled:opacity-50">
                                Cancel
                              </button>
                            </td>
                          </tr>
                        );
                      }
                      return (
                      <tr key={li.id} className={i % 2 === 1 ? 'bg-gray-50' : ''}>
                        <td className="table-cell">{li.category}</td>
                        <td className="table-cell">{li.pallet_qty ?? '—'}</td>
                        <td className="table-cell font-medium">{li.weight_kg ?? '—'}</td>
                        {decl.source === 'BAT' && <td className="table-cell font-mono text-xs">{li.bat_id || '—'}</td>}
                        <td className="table-cell text-gray-500">{li.remarks || '—'}</td>
                        <td className="table-cell">
                          {canSetStorage ? (
                            <div className="flex items-center gap-2">
                              <select
                                required
                                disabled={storageSaving}
                                className={`form-select text-xs py-1 w-auto ${!val ? 'border-red-300 text-red-600' : ''}`}
                                value={val}
                                onChange={e => handleStorageChange(li.id, e.target.value)}
                              >
                                <option value="" disabled>Select…</option>
                                {storageItems.map(loc => (
                                  <option key={loc.code} value={loc.code}>{loc.label}</option>
                                ))}
                              </select>
                              {!val && <span className="text-[11px] text-red-500">Required</span>}
                            </div>
                          ) : (
                            <span className="text-gray-500">{locLabel(li.storage_location)}</span>
                          )}
                        </td>
                        {(canDeleteLineItem || canEditLineItem) && (
                          <td className="table-cell text-right whitespace-nowrap">
                            {canEditLineItem && (
                              <button
                                onClick={() => handleStartEditLineItem(li)}
                                className="text-brand-primary hover:text-teal-800 text-xs font-medium mr-3"
                              >
                                Edit
                              </button>
                            )}
                            {canDeleteLineItem && (
                              <button
                                onClick={() => handleDeleteLineItem(li)}
                                disabled={deletingLineItemId === li.id}
                                className="text-red-600 hover:text-red-800 text-xs font-medium disabled:opacity-50"
                              >
                                {deletingLineItemId === li.id ? 'Removing…' : 'Remove'}
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })}
          {canSetStorage && (
            <div className="flex items-center justify-end gap-3 mt-2">
              {storageSaved && !storageDirty && <span className="text-xs text-green-700">✓ Saved</span>}
              <button
                onClick={handleSaveStorage}
                disabled={!storageDirty || storageSaving}
                className="btn-primary text-sm disabled:opacity-50"
              >
                {storageSaving ? 'Saving…' : 'Save Storage Locations'}
              </button>
            </div>
          )}
        </div>

        {/* Actions */}
        {(canEdit || canSubmit || canApprove || canDelete) && (
          <div className="flex gap-3 justify-end">
            {canEdit && (
              <button onClick={() => navigate(`/declaration/${id}/edit`)} className="btn-secondary">
                ✏ Edit Draft
              </button>
            )}
            {canDelete && (
              <button onClick={handleDelete} disabled={actionLoading} className="btn-secondary text-red-600 hover:bg-red-50 border-red-200">
                🗑 Delete
              </button>
            )}
            {canSubmit && (
              <button onClick={handleSubmitAction} disabled={actionLoading} className="btn-primary">
                {actionLoading ? 'Submitting…' : 'Submit for Approval'}
              </button>
            )}
            {canApprove && (
              <button onClick={handleApprove} disabled={actionLoading} className="btn-primary">
                {actionLoading ? 'Processing…' : `Approve → ${
                  { SUBMITTED: 'Dept Approve', DEPT_APPROVED: 'IREP Authorize', IREP_AUTHORIZED: 'Security Authorize & Complete' }[decl.status]
                }`}
              </button>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}
