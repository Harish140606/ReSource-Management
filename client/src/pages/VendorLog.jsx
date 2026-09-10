import { useState } from 'react';
import dayjs from 'dayjs';
import Layout from '../components/Layout.jsx';
import LoadingSpinner from '../components/LoadingSpinner.jsx';
import ErrorAlert from '../components/ErrorAlert.jsx';
import { createVendorPickup, getVendorPickups, downloadVendorInvoice } from '../services/liveExcel.js';
import { formatDate } from '../utils/dateHelpers.js';
import { today } from '../utils/dateHelpers.js';
import { useEffect } from 'react';
import { useReferenceData } from '../hooks/useReferenceData.js';

const BLANK = {
  date: today(), vendor_name: '', vehicle_entry_no: '', vehicle_out_no: '',
  vehicle_holding_time: '', invoice_raise_time: '', invoice_received_time: '',
  category: '', remarks: '',
};

export default function VendorLog() {
  const { data: allCategories } = useReferenceData('WASTE_CATEGORY');
  const [form, setForm] = useState(BLANK);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [pickups, setPickups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [downloadingInvoice, setDownloadingInvoice] = useState(false);

  async function fetchPickups() {
    setLoading(true);
    try {
      const result = await getVendorPickups({ limit: 50 });
      setPickups(result.items || []);
    } catch (err) {
      setListError(err.response?.data?.error?.message || 'Failed to load');
    } finally { setLoading(false); }
  }

  useEffect(() => { fetchPickups(); }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setFormError('');
    if (!form.vendor_name || !form.vehicle_entry_no || !form.category) {
      setFormError('Vendor name, entry no., and category are required.');
      return;
    }
    setSaving(true);
    try {
      await createVendorPickup({
        ...form,
        invoice_raise_time: form.invoice_raise_time || null,
        invoice_received_time: form.invoice_received_time || null,
      });
      setForm(BLANK);
      fetchPickups();
    } catch (err) {
      setFormError(err.response?.data?.error?.message || 'Save failed');
    } finally { setSaving(false); }
  }

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function handleDownloadInvoice() {
    setListError('');
    setDownloadingInvoice(true);
    try {
      const blob = await downloadVendorInvoice();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ReSource_Vendor_Invoice_Sheet_${dayjs().format('YYYY-MM-DD_HH-mm-ss')}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setListError('Invoice sheet download failed');
    } finally { setDownloadingInvoice(false); }
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="page-title">Vendor Pickup Log</h1>
          <p className="page-subtitle">Log daily scrap pickups by vendors.</p>
        </div>

        {/* Form */}
        <div className="card">
          <h2 className="font-semibold text-gray-900 mb-4">Log New Pickup</h2>
          {formError && <div className="text-red-600 text-sm mb-3 bg-red-50 border border-red-200 rounded p-3">{formError}</div>}
          <form onSubmit={handleSubmit}>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div><label className="form-label">Date *</label><input type="date" className="form-input" value={form.date} onChange={e => set('date', e.target.value)} required /></div>
              <div><label className="form-label">Vendor Name *</label><input type="text" className="form-input" placeholder="Vendor company" value={form.vendor_name} onChange={e => set('vendor_name', e.target.value)} required /></div>
              <div><label className="form-label">Vehicle Entry No. *</label><input type="text" className="form-input" value={form.vehicle_entry_no} onChange={e => set('vehicle_entry_no', e.target.value)} required /></div>
              <div><label className="form-label">Vehicle Out No.</label><input type="text" className="form-input" value={form.vehicle_out_no} onChange={e => set('vehicle_out_no', e.target.value)} /></div>
              <div><label className="form-label">Holding Time</label><input type="text" className="form-input" placeholder="e.g. 2h 15m" value={form.vehicle_holding_time} onChange={e => set('vehicle_holding_time', e.target.value)} /></div>
              <div>
                <label className="form-label">Category *</label>
                <select className="form-select" value={form.category} onChange={e => set('category', e.target.value)} required>
                  <option value="">Select category</option>
                  {allCategories.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
                </select>
              </div>
              <div><label className="form-label">Invoice Raise Time</label><input type="time" className="form-input" value={form.invoice_raise_time} onChange={e => set('invoice_raise_time', e.target.value)} /></div>
              <div><label className="form-label">Invoice Received Time</label><input type="time" className="form-input" value={form.invoice_received_time} onChange={e => set('invoice_received_time', e.target.value)} /></div>
              <div className="col-span-full"><label className="form-label">Remarks</label><input type="text" className="form-input" value={form.remarks} onChange={e => set('remarks', e.target.value)} /></div>
            </div>
            <div className="flex justify-end mt-4">
              <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Saving…' : 'Log Pickup'}</button>
            </div>
          </form>
        </div>

        {/* Table */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900">Recent Pickups</h2>
            <button onClick={handleDownloadInvoice} disabled={downloadingInvoice} className="btn-secondary text-xs">
              {downloadingInvoice ? 'Preparing…' : '⬇ Download Invoice Sheet'}
            </button>
          </div>
          {listError && <ErrorAlert message={listError} onRetry={fetchPickups} />}
          {loading ? <LoadingSpinner /> : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr>
                    {['Date', 'Vendor', 'Entry No.', 'Category', 'Holding Time', 'Remarks', 'Logged By'].map(h => <th key={h} className="table-header">{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {pickups.map((p, i) => (
                    <tr key={p.id} className={i % 2 === 1 ? 'bg-gray-50' : ''}>
                      <td className="table-cell">{formatDate(p.date)}</td>
                      <td className="table-cell font-medium">{p.vendor_name}</td>
                      <td className="table-cell font-mono text-xs">{p.vehicle_entry_no}</td>
                      <td className="table-cell text-xs">{p.category}</td>
                      <td className="table-cell">{p.vehicle_holding_time || '—'}</td>
                      <td className="table-cell text-gray-500">{p.remarks || '—'}</td>
                      <td className="table-cell">{p.creator?.name || '—'}</td>
                    </tr>
                  ))}
                  {!pickups.length && <tr><td colSpan={7} className="table-cell text-center text-gray-400">No pickups logged yet</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
