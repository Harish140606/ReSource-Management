import { useState, useEffect, useCallback } from 'react';
import Layout from '../components/Layout.jsx';
import LoadingSpinner from '../components/LoadingSpinner.jsx';
import ErrorAlert from '../components/ErrorAlert.jsx';
import api from '../services/api.js';
import { ROLE_LABELS } from '../constants/roles.js';
import { useReferenceData, buildFunctionGroups, invalidateReferenceData } from '../hooks/useReferenceData.js';
import { createReferenceItem, updateReferenceItem, deleteReferenceItem, hardDeleteReferenceItem, getAdminReferenceData } from '../services/referenceData.js';
import { formatDate, today, weekAgo } from '../utils/dateHelpers.js';
import { usePersistedState } from '../hooks/usePersistedState.js';
import { useSetting } from '../hooks/useSetting.js';
import { SETTING_KEYS, updateSetting } from '../services/settings.js';
import dayjs from 'dayjs';

// ─── Action metadata ────────────────────────────────────────────────────────
const ACTION_META = {
  LOGIN:                  { label: 'Signed in',          color: 'green'  },
  LOGOUT:                 { label: 'Signed out',          color: 'gray'   },
  DECLARATION_CREATED:    { label: 'Created declaration', color: 'blue'   },
  DECLARATION_UPDATED:    { label: 'Edited declaration',  color: 'yellow' },
  DECLARATION_DELETED:    { label: 'Deleted declaration', color: 'red'    },
  DECLARATION_SUBMITTED:  { label: 'Submitted declaration', color: 'blue' },
  DECLARATION_APPROVED:   { label: 'Approved declaration', color: 'teal' },
  STORAGE_LOCATION_UPDATED: { label: 'Updated storage location', color: 'purple' },
  VENDOR_PICKUP_CREATED:  { label: 'Logged vendor pickup', color: 'purple' },
  DISPOSAL_INVOICE_RECORDED: { label: 'Recorded disposal invoice', color: 'teal' },
  EMPLOYEE_CREATED:       { label: 'Created employee',    color: 'blue'   },
  EMPLOYEE_UPDATED:       { label: 'Updated employee',    color: 'yellow' },
  EMPLOYEE_ACTIVATED:     { label: 'Activated employee',  color: 'green'  },
  EMPLOYEE_DEACTIVATED:   { label: 'Deactivated employee', color: 'red'   },
};

const BADGE_COLORS = {
  green:  'bg-green-100 text-green-700',
  gray:   'bg-gray-100 text-gray-600',
  blue:   'bg-teal-100 text-brand-primary',
  yellow: 'bg-yellow-100 text-yellow-700',
  teal:   'bg-cyan-100 text-brand-cyan',
  purple: 'bg-purple-100 text-purple-700',
  red:    'bg-red-100 text-red-600',
};

function ActionBadge({ action }) {
  const meta = ACTION_META[action] || { label: action, color: 'gray' };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap ${BADGE_COLORS[meta.color] || BADGE_COLORS.gray}`}>
      {meta.label}
    </span>
  );
}

function logDetails(log) {
  const nv = log.new_value;
  const ov = log.old_value;

  if (log.action === 'DECLARATION_CREATED') return nv?.declaration_no || '—';
  if (log.action === 'DECLARATION_APPROVED' && ov?.status && nv?.status) {
    return `${ov.status} → ${nv.status}`;
  }
  if (log.action === 'DECLARATION_SUBMITTED') return 'DRAFT → SUBMITTED';
  if (log.action === 'DECLARATION_UPDATED') return nv?.declaration_no || 'Draft updated';
  if (log.action === 'DECLARATION_DELETED') return ov?.declaration_no || 'Draft deleted';
  if (log.action === 'VENDOR_PICKUP_CREATED') {
    return nv?.vendor_name ? `${nv.vendor_name}${nv.category ? ` · ${nv.category}` : ''}` : '—';
  }
  if (log.action === 'DISPOSAL_INVOICE_RECORDED') {
    return nv?.invoice_no ? `${nv.invoice_no}${nv.vendor_name ? ` · ${nv.vendor_name}` : ''}${nv.items ? ` · ${nv.items} item(s)` : ''}` : '—';
  }
  if (log.action === 'EMPLOYEE_CREATED') return nv?.emp_no ? `${nv.emp_no} — ${nv.name}` : '—';
  if (log.action === 'EMPLOYEE_ACTIVATED' || log.action === 'EMPLOYEE_DEACTIVATED') {
    return nv?.emp_no ? `${nv.emp_no} — ${nv.name}` : '—';
  }
  if (log.action === 'EMPLOYEE_UPDATED') return nv?.emp_no || '—';
  return '—';
}

// ─── Employee modal (create + edit) ─────────────────────────────────────────
function EmployeeModal({ onClose, onSave, employee }) {
  const isEdit = Boolean(employee);
  const { data: functionItems } = useReferenceData('PRODUCTION_FUNCTION');
  const { data: zoneItems }     = useReferenceData('ZONE');
  const functionGroups = buildFunctionGroups(functionItems);

  const [form, setForm] = useState(
    isEdit
      ? { name: employee.name, email: employee.email, role: employee.role, production_function: employee.production_function || '', zone: employee.zone || '', password: '' }
      : { emp_no: '', name: '', email: '', password: '', role: 'EMPLOYEE', production_function: '', zone: '' }
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function submit(e) {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      if (isEdit) {
        const payload = { name: form.name, email: form.email, role: form.role, production_function: form.production_function || null, zone: form.zone || null };
        await api.patch(`/employees/${employee.id}`, payload);
      } else {
        await api.post('/employees', form);
      }
      onSave(); onClose();
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Save failed');
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-semibold text-gray-900">{isEdit ? `Edit — ${employee.name}` : 'Add Employee'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>
        {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded mb-4">{error}</div>}
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            {!isEdit && (
              <div><label className="form-label">Emp No *</label><input className="form-input" required value={form.emp_no} onChange={e => set('emp_no', e.target.value)} /></div>
            )}
            <div><label className="form-label">Name *</label><input className="form-input" required value={form.name} onChange={e => set('name', e.target.value)} /></div>
            <div><label className="form-label">Email *</label><input type="email" className="form-input" required value={form.email} onChange={e => set('email', e.target.value)} /></div>
            {!isEdit && (
              <div><label className="form-label">Password *</label><input type="password" className="form-input" required minLength={6} value={form.password} onChange={e => set('password', e.target.value)} /></div>
            )}
            <div>
              <label className="form-label">Role</label>
              <select className="form-select" value={form.role} onChange={e => set('role', e.target.value)}>
                {Object.entries(ROLE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Function</label>
              <select className="form-select" value={form.production_function} onChange={e => set('production_function', e.target.value)}>
                <option value="">— None —</option>
                {functionGroups.map(group => (
                  <optgroup key={group.label} label={group.label}>
                    {group.options.map(f => <option key={f.code} value={f.code}>{f.label}</option>)}
                  </optgroup>
                ))}
              </select>
            </div>
            <div>
              <label className="form-label">Zone</label>
              <select className="form-select" value={form.zone} onChange={e => set('zone', e.target.value)}>
                <option value="">— None —</option>
                {zoneItems.map(z => <option key={z.code} value={z.code}>{z.label}</option>)}
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Employee'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Notification preview ────────────────────────────────────────────────────
function NotificationPreview() {
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState('');

  useEffect(() => {
    api.get('/admin/notification-preview')
      .then(r => setData(r.data.data))
      .catch(() => setError('Failed to load'))
      .finally(() => setLoading(false));
  }, []);

  const stageLabel = { DEPT_HEAD: 'On Submit → DEPT_HEAD', IREP: 'On Dept Approve → IREP', SECURITY: 'On IREP Auth → SECURITY' };

  return (
    <div className="card">
      <h2 className="font-semibold text-gray-900 mb-1">Who Gets Notified</h2>
      <p className="text-sm text-gray-500 mb-3">Employees that will receive emails at each approval stage. Missing email = no notification.</p>
      {loading ? <p className="text-sm text-gray-400">Loading…</p> : error ? <p className="text-sm text-red-500">{error}</p> : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Object.entries(data).map(([role, emps]) => (
            <div key={role} className="border border-gray-200 rounded-lg p-3">
              <p className="text-xs font-semibold text-gray-500 uppercase mb-2">{stageLabel[role]}</p>
              {emps.length === 0
                ? <p className="text-xs text-red-500">⚠ No active {role} employees</p>
                : emps.map(e => (
                  <div key={e.emp_no} className="flex items-center justify-between py-1 border-b border-gray-100 last:border-0">
                    <span className="text-xs font-medium text-gray-700">{e.name}</span>
                    {e.email
                      ? <span className="text-xs text-green-700 font-mono">{e.email}</span>
                      : <span className="text-xs text-red-500">⚠ no email</span>}
                  </div>
                ))
              }
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Email test widget ───────────────────────────────────────────────────────
function EmailTest() {
  const [to, setTo]       = useState('');
  const [status, setStatus] = useState(null); // null | 'sending' | 'ok' | 'err'
  const [msg, setMsg]     = useState('');

  async function send(e) {
    e.preventDefault();
    setStatus('sending'); setMsg('');
    try {
      const res = await api.post('/admin/test-email', { to });
      setStatus('ok');
      setMsg(`Email sent! Resend ID: ${res.data.data.id}`);
    } catch (err) {
      setStatus('err');
      setMsg(err.response?.data?.error?.message || 'Failed');
    }
  }

  return (
    <div className="card">
      <h2 className="font-semibold text-gray-900 mb-1">Email Notification Test</h2>
      <p className="text-sm text-gray-500 mb-3">Send a test email to verify the mail provider is configured correctly.</p>
      <form onSubmit={send} className="flex items-end gap-3 flex-wrap">
        <div>
          <label className="form-label">Send test email to</label>
          <input type="email" className="form-input w-64" required placeholder="yourname@gmail.com" value={to} onChange={e => setTo(e.target.value)} />
        </div>
        <button type="submit" disabled={status === 'sending'} className="btn-primary text-sm">
          {status === 'sending' ? 'Sending…' : 'Send Test Email'}
        </button>
      </form>
      {status === 'ok'  && <p className="mt-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">{msg}</p>}
      {status === 'err' && <p className="mt-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">Error: {msg}</p>}
    </div>
  );
}

// ─── Employees tab ───────────────────────────────────────────────────────────
function EmployeesTab() {
  const { data: functionItems } = useReferenceData('PRODUCTION_FUNCTION');
  const fnLabel = (code) => functionItems.find(f => f.code === code)?.label || code || '—';

  const [employees, setEmployees] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');
  const [search, setSearch]       = useState('');
  const [showModal, setShowModal]   = useState(false);
  const [editEmployee, setEditEmployee] = useState(null);
  const [page, setPage]           = useState(1);
  const [pages, setPages]         = useState(1);

  async function fetchEmployees(p = 1, q = search) {
    setLoading(true);
    try {
      const res = await api.get('/employees', { params: { page: p, limit: 20, search: q } });
      setEmployees(res.data.data.employees);
      setPages(res.data.data.pages);
      setPage(p);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to load');
    } finally { setLoading(false); }
  }

  useEffect(() => { fetchEmployees(); }, []);

  async function toggleActive(id, current) {
    try {
      await api.patch(`/employees/${id}`, { is_active: !current });
      fetchEmployees(page);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Update failed');
    }
  }

  async function deleteEmployee(emp) {
    if (!window.confirm(`Permanently delete "${emp.name}" (${emp.emp_no})?\n\nThis cannot be undone.`)) return;
    setError('');
    try {
      await api.delete(`/employees/${emp.id}`);
      fetchEmployees(page);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Delete failed');
    }
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <h2 className="font-semibold text-gray-900">Employees ({employees.length})</h2>
        <div className="flex gap-2 flex-wrap">
          <input
            type="text" className="form-input w-48 text-sm"
            placeholder="Search name or emp no…"
            value={search}
            onChange={e => { setSearch(e.target.value); fetchEmployees(1, e.target.value); }}
          />
          <button onClick={() => setShowModal(true)} className="btn-primary text-sm">+ Add Employee</button>
        </div>
      </div>

      {showModal    && <EmployeeModal onClose={() => setShowModal(false)}              onSave={() => fetchEmployees(page)} />}
      {editEmployee && <EmployeeModal onClose={() => setEditEmployee(null)} onSave={() => fetchEmployees(page)} employee={editEmployee} />}
      {error && <ErrorAlert message={error} />}

      {loading ? <LoadingSpinner /> : (
        <div className="overflow-x-auto -mx-3 sm:mx-0">
          <table className="min-w-[640px] w-full text-sm">
            <thead>
              <tr>
                {['Emp No', 'Name', 'Email', 'Role', 'Function', 'Zone', 'Status', 'Actions'].map(h => (
                  <th key={h} className="table-header">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {employees.map((emp, i) => (
                <tr key={emp.id} className={i % 2 === 1 ? 'bg-gray-50' : ''}>
                  <td className="table-cell font-mono text-xs">{emp.emp_no}</td>
                  <td className="table-cell font-medium">{emp.name}</td>
                  <td className="table-cell text-xs">{emp.email}</td>
                  <td className="table-cell text-xs">{ROLE_LABELS[emp.role]}</td>
                  <td className="table-cell text-xs">{fnLabel(emp.production_function)}</td>
                  <td className="table-cell text-xs">{emp.zone || '—'}</td>
                  <td className="table-cell">
                    <span className={`text-xs font-semibold ${emp.is_active ? 'text-green-600' : 'text-red-500'}`}>
                      {emp.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="table-cell">
                    <div className="flex items-center gap-3">
                      <button onClick={() => setEditEmployee(emp)} className="text-xs text-brand-primary hover:underline font-medium">
                        Edit
                      </button>
                      <button onClick={() => toggleActive(emp.id, emp.is_active)} className="text-xs text-gray-500 hover:underline">
                        {emp.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                      <button onClick={() => deleteEmployee(emp)} className="text-xs text-red-500 hover:underline">
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!employees.length && (
                <tr><td colSpan={8} className="table-cell text-center text-gray-400">No employees found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 && (
        <div className="flex justify-between items-center mt-4">
          <p className="text-sm text-gray-500">Page {page} of {pages}</p>
          <div className="flex gap-2">
            <button disabled={page <= 1} onClick={() => fetchEmployees(page - 1)} className="px-3 py-1 text-sm border rounded hover:bg-gray-50 disabled:opacity-40">← Prev</button>
            <button disabled={page >= pages} onClick={() => fetchEmployees(page + 1)} className="px-3 py-1 text-sm border rounded hover:bg-gray-50 disabled:opacity-40">Next →</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Reference Data modal (add / edit) ──────────────────────────────────────
const WASTE_TYPES  = ['GENERAL', 'HAZARDOUS', 'EWASTE'];
const SOURCES      = ['SOFT', 'BAT', 'BOTH'];

function RefDataModal({ type, item, onClose, onSave }) {
  const isEdit = Boolean(item);
  const isWaste = type === 'WASTE_CATEGORY';

  const blankMeta = { waste_type: 'GENERAL', source: 'SOFT', nested_subgroup: '' };
  const initMeta  = isEdit && item.metadata
    ? { waste_type: item.metadata.waste_type || 'GENERAL', source: item.metadata.source || 'SOFT', nested_subgroup: item.metadata.nested_subgroup || '' }
    : blankMeta;

  const [form, setForm] = useState(
    isEdit
      ? { code: item.code, label: item.label, group: item.group || '', sort_order: item.sort_order ?? 0 }
      : { code: '', label: '', group: '', sort_order: 0 }
  );
  const [meta, setMeta] = useState(initMeta);
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const setM = (k, v) => setMeta(m => ({ ...m, [k]: v }));

  async function submit(e) {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      const payload = {
        ...form,
        sort_order: Number(form.sort_order) || 0,
        group: form.group || null,
        metadata: isWaste
          ? { waste_type: meta.waste_type, source: meta.source, ...(meta.nested_subgroup ? { nested_subgroup: meta.nested_subgroup } : {}) }
          : null,
      };
      if (isEdit) {
        await updateReferenceItem(item.id, payload);
      } else {
        await createReferenceItem({ ...payload, type });
      }
      invalidateReferenceData(type);
      onSave();
      onClose();
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Save failed');
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-semibold text-gray-900">{isEdit ? 'Edit Item' : 'Add Item'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>
        {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded mb-4">{error}</div>}
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="form-label">Code *</label>
            <input className="form-input" required value={form.code} readOnly={isEdit}
              onChange={e => set('code', e.target.value)}
              placeholder={isWaste ? 'e.g. Package Carton' : 'e.g. SMT'} />
            {isEdit && <p className="text-xs text-gray-400 mt-0.5">Code cannot be changed after creation.</p>}
          </div>
          <div>
            <label className="form-label">Label *</label>
            <input className="form-input" required value={form.label} onChange={e => set('label', e.target.value)}
              placeholder="Human-readable name" />
          </div>
          <div>
            <label className="form-label">Group</label>
            <input className="form-input" value={form.group} onChange={e => set('group', e.target.value)}
              placeholder={isWaste ? 'e.g. Packaging & Paper' : 'e.g. SMT Line'} />
          </div>
          <div>
            <label className="form-label">Sort Order</label>
            <input type="number" className="form-input w-24" value={form.sort_order} onChange={e => set('sort_order', e.target.value)} />
          </div>
          {isWaste && (
            <>
              <div>
                <label className="form-label">Waste Type *</label>
                <select className="form-select" value={meta.waste_type} onChange={e => setM('waste_type', e.target.value)}>
                  {WASTE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">Source *</label>
                <select className="form-select" value={meta.source} onChange={e => setM('source', e.target.value)}>
                  {SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">Nested Sub-group</label>
                <input className="form-input" value={meta.nested_subgroup} onChange={e => setM('nested_subgroup', e.target.value)}
                  placeholder="e.g. Cat I – Rigid Plastic (optional)" />
              </div>
            </>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Item'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Reference Data tab ──────────────────────────────────────────────────────
const REF_TYPES = [
  { id: 'PRODUCTION_FUNCTION', label: 'Production Functions' },
  { id: 'ZONE',                label: 'Zones'                },
  { id: 'SHIFT',               label: 'Shifts'               },
  { id: 'DISPOSAL_ROUTE',      label: 'Disposal Routes'      },
  { id: 'STORAGE_LOCATION',    label: 'Storage Locations'    },
  { id: 'WASTE_CATEGORY',      label: 'Waste Categories'     },
];

function ReferenceDataTab() {
  const [activeType, setActiveType] = useState('PRODUCTION_FUNCTION');
  const [showModal, setShowModal]   = useState(false);
  const [editItem, setEditItem]     = useState(null);
  const [opError, setOpError]       = useState('');
  const [items, setItems]           = useState([]);
  const [loading, setLoading]       = useState(true);

  async function fetchItems(type = activeType) {
    setLoading(true);
    try { setItems(await getAdminReferenceData(type)); }
    catch { setItems([]); }
    finally { setLoading(false); }
  }

  useEffect(() => { fetchItems(activeType); }, [activeType]);

  function afterSave() { invalidateReferenceData(activeType); fetchItems(); }

  async function handleDeactivate(item) {
    const action = item.is_active ? 'deactivate' : 'reactivate';
    if (!window.confirm(`${action === 'deactivate' ? 'Deactivate' : 'Reactivate'} "${item.label}"? ${action === 'deactivate' ? 'It will no longer appear in dropdowns but historical records are preserved.' : ''}`)) return;
    setOpError('');
    try {
      if (action === 'deactivate') {
        await deleteReferenceItem(item.id);
      } else {
        await updateReferenceItem(item.id, { is_active: true });
      }
      invalidateReferenceData(activeType);
      fetchItems();
    } catch (err) {
      setOpError(err.response?.data?.error?.message || 'Operation failed');
    }
  }

  async function handleHardDelete(item) {
    if (!window.confirm(`Permanently delete "${item.label}"?\n\nThis cannot be undone. Only delete items that have never been used in any declaration.`)) return;
    setOpError('');
    try {
      await hardDeleteReferenceItem(item.id);
      invalidateReferenceData(activeType);
      fetchItems();
    } catch (err) {
      setOpError(err.response?.data?.error?.message || 'Delete failed');
    }
  }

  // Reset state when type changes
  function switchType(t) { setActiveType(t); setOpError(''); setEditItem(null); setShowModal(false); }

  const showGroup    = ['PRODUCTION_FUNCTION', 'WASTE_CATEGORY'].includes(activeType);
  const showMeta     = activeType === 'WASTE_CATEGORY';

  return (
    <div className="space-y-4">
      {/* Sub-type tabs */}
      <div className="card">
        <div className="flex flex-wrap gap-1.5">
          {REF_TYPES.map(t => (
            <button
              key={t.id}
              onClick={() => switchType(t.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                activeType === t.id
                  ? 'bg-brand-primary text-white shadow-sm'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-semibold text-gray-900">{REF_TYPES.find(t => t.id === activeType)?.label}</h2>
            <p className="text-xs text-gray-500 mt-0.5">Manage dropdown values — changes apply immediately across the app.</p>
          </div>
          <button onClick={() => { setEditItem(null); setShowModal(true); }} className="btn-primary text-sm">
            + Add Item
          </button>
        </div>

        {opError && <ErrorAlert message={opError} />}

        {showModal && (
          <RefDataModal
            type={activeType}
            item={null}
            onClose={() => setShowModal(false)}
            onSave={afterSave}
          />
        )}
        {editItem && (
          <RefDataModal
            type={activeType}
            item={editItem}
            onClose={() => setEditItem(null)}
            onSave={afterSave}
          />
        )}

        {loading ? <LoadingSpinner /> : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr>
                  <th className="table-header">Code</th>
                  <th className="table-header">Label</th>
                  {showGroup && <th className="table-header">Group</th>}
                  {showMeta  && <th className="table-header">Waste Type</th>}
                  {showMeta  && <th className="table-header">Source</th>}
                  <th className="table-header">Sort</th>
                  <th className="table-header">Status</th>
                  <th className="table-header">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, i) => (
                  <tr key={item.id} className={`${i % 2 === 1 ? 'bg-gray-50' : ''} ${!item.is_active ? 'opacity-50' : ''}`}>
                    <td className="table-cell font-mono text-xs">{item.code}</td>
                    <td className="table-cell font-medium">{item.label}</td>
                    {showGroup && <td className="table-cell text-xs text-gray-500">{item.group || '—'}</td>}
                    {showMeta  && <td className="table-cell text-xs">{item.metadata?.waste_type || '—'}</td>}
                    {showMeta  && <td className="table-cell text-xs">{item.metadata?.source || '—'}</td>}
                    <td className="table-cell text-xs text-gray-400">{item.sort_order}</td>
                    <td className="table-cell">
                      <span className={`text-xs font-semibold ${item.is_active ? 'text-green-600' : 'text-red-500'}`}>
                        {item.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="table-cell">
                      <div className="flex items-center gap-3">
                        <button onClick={() => setEditItem(item)} className="text-xs text-brand-primary hover:underline font-medium">
                          Edit
                        </button>
                        <button onClick={() => handleDeactivate(item)} className="text-xs text-gray-500 hover:underline">
                          {item.is_active ? 'Deactivate' : 'Reactivate'}
                        </button>
                        <button onClick={() => handleHardDelete(item)} className="text-xs text-red-500 hover:underline">
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!items.length && (
                  <tr><td colSpan={8} className="table-cell text-center text-gray-400 py-8">No items yet — click "Add Item" to get started.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Audit log tab ───────────────────────────────────────────────────────────
function AuditLogTab() {
  const [logs, setLogs]         = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [total, setTotal]       = useState(0);
  const [page, setPage]         = useState(1);
  const [pages, setPages]       = useState(1);
  const [actions, setActions]   = useState([]);
  const [employees, setEmployees] = useState([]);

  const [filters, setFilters] = usePersistedState('admin_auditlog_filters', {
    date_from: weekAgo(),
    date_to: today(),
    action: '',
    user_id: '',
    search: '',
  });

  const setFilter = (k, v) => setFilters(f => ({ ...f, [k]: v }));

  const fetchLogs = useCallback(async (p = 1, f = filters) => {
    setLoading(true);
    try {
      const params = { page: p, limit: 50, ...f };
      Object.keys(params).forEach(k => { if (!params[k]) delete params[k]; });
      const res = await api.get('/admin/audit-logs', { params });
      setLogs(res.data.data.logs);
      setTotal(res.data.data.total);
      setPages(res.data.data.pages);
      setPage(p);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to load audit log');
    } finally { setLoading(false); }
  }, [filters]);

  useEffect(() => {
    fetchLogs(1, filters);
  }, []);

  useEffect(() => {
    api.get('/admin/audit-logs/actions').then(r => setActions(r.data.data)).catch(() => {});
    api.get('/admin/employees-list').then(r => setEmployees(r.data.data)).catch(() => {});
  }, []);

  function applyFilters(newFilters) {
    const merged = { ...filters, ...newFilters };
    setFilters(merged);
    fetchLogs(1, merged);
  }

  function resetFilters() {
    const def = { date_from: weekAgo(), date_to: today(), action: '', user_id: '', search: '' };
    setFilters(def);
    fetchLogs(1, def);
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="card">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="form-label">From</label>
            <input type="date" className="form-input w-auto text-xs" value={filters.date_from}
              onChange={e => applyFilters({ date_from: e.target.value })} />
          </div>
          <div>
            <label className="form-label">To</label>
            <input type="date" className="form-input w-auto text-xs" value={filters.date_to}
              onChange={e => applyFilters({ date_to: e.target.value })} />
          </div>
          <div>
            <label className="form-label">Action</label>
            <select className="form-select w-auto text-xs" value={filters.action}
              onChange={e => applyFilters({ action: e.target.value })}>
              <option value="">All actions</option>
              {actions.map(a => (
                <option key={a} value={a}>{ACTION_META[a]?.label || a}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="form-label">User</label>
            <select className="form-select w-auto text-xs" value={filters.user_id}
              onChange={e => applyFilters({ user_id: e.target.value })}>
              <option value="">All users</option>
              {employees.map(e => (
                <option key={e.id} value={e.id}>{e.emp_no} — {e.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="form-label">Search name</label>
            <input type="text" className="form-input text-xs w-40" placeholder="Name or emp no…"
              value={filters.search}
              onChange={e => applyFilters({ search: e.target.value })} />
          </div>
          <button onClick={resetFilters} className="btn-secondary text-xs">Reset</button>
        </div>
        <p className="text-xs text-gray-400 mt-3">{total.toLocaleString()} events found</p>
      </div>

      {error && <ErrorAlert message={error} />}

      {/* Log table */}
      <div className="card p-0 overflow-hidden">
        {loading ? (
          <div className="p-6"><LoadingSpinner /></div>
        ) : !logs.length ? (
          <div className="py-16 text-center text-gray-400 text-sm">No activity found for the selected filters.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[700px] w-full text-sm">
              <thead>
                <tr>
                  {['Timestamp', 'User', 'Role', 'Action', 'Details', 'IP Address'].map(h => (
                    <th key={h} className="table-header">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {logs.map((log, i) => (
                  <tr key={log.id} className={i % 2 === 1 ? 'bg-gray-50/60' : 'bg-white'}>
                    <td className="table-cell whitespace-nowrap">
                      <p className="text-xs font-medium text-gray-900">
                        {dayjs(log.created_at).format('DD MMM YYYY')}
                      </p>
                      <p className="text-[11px] text-gray-400 mt-0.5">
                        {dayjs(log.created_at).format('HH:mm:ss')}
                      </p>
                    </td>
                    <td className="table-cell">
                      <p className="font-medium text-gray-900 text-xs">{log.user?.name || '—'}</p>
                      <p className="text-[11px] text-gray-400 font-mono mt-0.5">{log.user?.emp_no}</p>
                    </td>
                    <td className="table-cell text-xs text-gray-500 whitespace-nowrap">
                      {ROLE_LABELS[log.user?.role] || '—'}
                    </td>
                    <td className="table-cell">
                      <ActionBadge action={log.action} />
                    </td>
                    <td className="table-cell text-xs text-gray-600 max-w-[200px] truncate">
                      {logDetails(log)}
                    </td>
                    <td className="table-cell text-xs font-mono text-gray-400">
                      {log.ip_address || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {pages > 1 && (
          <div className="flex justify-between items-center px-4 py-3 border-t border-gray-100">
            <p className="text-xs text-gray-500">Page {page} of {pages} · {total} entries</p>
            <div className="flex gap-2">
              <button disabled={page <= 1} onClick={() => fetchLogs(page - 1)} className="px-3 py-1 text-xs border rounded hover:bg-gray-50 disabled:opacity-40">← Prev</button>
              <button disabled={page >= pages} onClick={() => fetchLogs(page + 1)} className="px-3 py-1 text-xs border rounded hover:bg-gray-50 disabled:opacity-40">Next →</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Admin page ─────────────────────────────────────────────────────────
// ─── Settings tab ───────────────────────────────────────────────────────────
function SettingsTab() {
  const { value: excelUploadEnabled, loading, refetch } = useSetting(SETTING_KEYS.EXCEL_DECLARATION_UPLOAD);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleToggle() {
    setError('');
    setSaving(true);
    try {
      await updateSetting(SETTING_KEYS.EXCEL_DECLARATION_UPLOAD, !excelUploadEnabled);
      refetch();
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to update setting');
    } finally { setSaving(false); }
  }

  return (
    <div className="card max-w-2xl">
      <h2 className="font-semibold text-gray-900 mb-1">Feature Settings</h2>
      <p className="text-sm text-gray-500 mb-4">Turn optional features on or off for everyone.</p>
      {error && <div className="text-red-600 text-sm mb-3 bg-red-50 border border-red-200 rounded p-3">{error}</div>}
      <div className="flex items-center justify-between border border-gray-200 rounded-lg p-4">
        <div>
          <p className="font-medium text-sm text-gray-900">Bulk Declaration Upload via Excel</p>
          <p className="text-xs text-gray-500 mt-0.5">
            Lets employees upload a pivot-style Excel workbook (same layout as the Live Excel report) on the New
            Declaration page to create many declarations at once, instead of only the manual form.
          </p>
        </div>
        {loading ? (
          <span className="text-xs text-gray-400">Loading…</span>
        ) : (
          <button
            onClick={handleToggle}
            disabled={saving}
            className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${
              excelUploadEnabled ? 'bg-brand-primary' : 'bg-gray-300'
            } disabled:opacity-50`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              excelUploadEnabled ? 'translate-x-6' : 'translate-x-1'
            }`} />
          </button>
        )}
      </div>
    </div>
  );
}

export default function Admin() {
  const [activeTab, setActiveTab] = useState('employees');

  const tabs = [
    { id: 'employees',      label: 'Employees'      },
    { id: 'reference-data', label: 'Reference Data' },
    { id: 'audit',          label: 'Audit Log'      },
    { id: 'settings',       label: 'Settings'       },
  ];

  return (
    <Layout>
      <div className="space-y-5 max-w-screen-xl mx-auto">
        <div>
          <h1 className="page-title">Admin</h1>
          <p className="page-subtitle">Manage employees, dropdown values, and review system activity.</p>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 bg-white/10 rounded-xl p-1 w-fit border border-white/15">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                activeTab === t.id
                  ? 'bg-white text-brand-primary shadow-sm'
                  : 'text-white/75 hover:text-white hover:bg-white/10'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {activeTab === 'employees'      && <><EmailTest /><NotificationPreview /><EmployeesTab /></>}
        {activeTab === 'reference-data' && <ReferenceDataTab />}
        {activeTab === 'audit'          && <AuditLogTab />}
        {activeTab === 'settings'       && <SettingsTab />}
      </div>
    </Layout>
  );
}
