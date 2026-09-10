import { useState, useEffect, useRef, Fragment } from 'react';
import Layout from '../components/Layout.jsx';
import LoadingSpinner from '../components/LoadingSpinner.jsx';
import ErrorAlert from '../components/ErrorAlert.jsx';
import { parseDisposalInvoice, createDisposalInvoice, getDisposalInvoices, getDisposalStock, deleteDisposalInvoice, deleteDisposalItem, editDisposalItem, parseWeighmentCertificate } from '../services/disposals.js';
import { getWeighmentRecords, createWeighmentRecord, editWeighmentRecord, deleteWeighmentRecord } from '../services/weighments.js';
import { useAuth } from '../hooks/useAuth.jsx';
import { useReferenceData } from '../hooks/useReferenceData.js';
import { formatDate, formatDateTime, today } from '../utils/dateHelpers.js';
import { fmtKg } from '../utils/formatters.js';
import { downloadWeighmentPdf } from '../utils/weighmentPdf.js';

export default function DisposalLog() {
  const { user } = useAuth();
  const { data: allCategories } = useReferenceData('WASTE_CATEGORY');
  const isAdmin = user?.role === 'ADMIN';
  const [disposalsOpen, setDisposalsOpen] = useState(false);
  const [weighmentsOpen, setWeighmentsOpen] = useState(false);
  const fileRef = useRef(null);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState('');
  const [draft, setDraft] = useState(null); // { header, items } pending confirmation
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState('');

  // ── Manual entry mode ───────────────────────────────────────────────────────
  const [mode, setMode] = useState('pdf'); // 'pdf' | 'manual'
  const blankRow = () => ({ category: '', qty_kg: '', available_stock: null, _stockLoading: false });
  const [mHeader, setMHeader] = useState({ invoice_date: today(), vendor_name: '', invoice_no: '' });
  const [mItems, setMItems] = useState([blankRow()]);
  const [mSaving, setMSaving] = useState(false);
  const [mError, setMError] = useState('');
  const [mSuccess, setMSuccess] = useState('');

  function setMItemFields(idx, fields) {
    setMItems(items => items.map((it, i) => (i === idx ? { ...it, ...fields } : it)));
  }

  async function refreshManualStock(idx, category, date) {
    if (!category || !date) {
      setMItemFields(idx, { available_stock: null, _stockLoading: false });
      return;
    }
    setMItemFields(idx, { _stockLoading: true });
    try {
      const s = await getDisposalStock(category, date);
      setMItemFields(idx, { available_stock: s.available, _stockLoading: false });
    } catch {
      setMItemFields(idx, { available_stock: null, _stockLoading: false });
    }
  }

  function handleManualCategory(idx, category) {
    setMItemFields(idx, { category });
    refreshManualStock(idx, category, mHeader.invoice_date);
  }

  function handleManualDate(date) {
    setMHeader(h => ({ ...h, invoice_date: date }));
    mItems.forEach((it, idx) => { if (it.category) refreshManualStock(idx, it.category, date); });
  }

  function addManualRow() { setMItems(items => [...items, blankRow()]); }
  function removeManualRow(idx) {
    setMItems(items => (items.length === 1 ? [blankRow()] : items.filter((_, i) => i !== idx)));
  }

  async function handleManualSave() {
    setMError(''); setMSuccess('');
    if (!mHeader.invoice_date) { setMError('Pick a disposal date.'); return; }
    const rows = mItems.filter(it => it.category && it.qty_kg !== '' && Number(it.qty_kg) > 0);
    if (!rows.length) { setMError('Add at least one row with a category and a quantity greater than 0.'); return; }
    setMSaving(true);
    try {
      const payload = {
        invoice_no: mHeader.invoice_no?.trim() || undefined,
        invoice_date: mHeader.invoice_date,
        vendor_name: mHeader.vendor_name?.trim() || undefined,
        items: rows.map(it => ({
          material_description: it.category,
          category: it.category,
          qty_kg: Number(it.qty_kg),
        })),
        ...weighmentPayload(),
      };
      await createDisposalInvoice(payload);
      setMSuccess(`Disposal recorded — ${rows.length} item${rows.length > 1 ? 's' : ''} subtracted from stock.`);
      setMHeader({ invoice_date: today(), vendor_name: '', invoice_no: '' });
      setMItems([blankRow()]);
      resetWeighments();
      fetchInvoices();
      fetchWeighmentRecords();
    } catch (err) {
      setMError(err.response?.data?.error?.message || 'Save failed');
    } finally { setMSaving(false); }
  }

  const manualTotal = mItems.reduce((s, it) => s + Number(it.qty_kg || 0), 0);

  // ── Weighment certificates (shared by both PDF and Manual modes) ───────────
  // Two separate physical weighbridge tickets are recorded: the vehicle weighed
  // empty (tare) before loading, and the same vehicle weighed loaded (gross)
  // with the scrap on board. Nett scrap weight = loaded gross − empty tare.
  const blankEmptyWeighment = () => ({ serial_no: '', vehicle_no: '', date: '', time: '', weight_kg: '' });
  const blankLoadedWeighment = () => ({ serial_no: '', vehicle_no: '', date: '', time: '', material: '', gross_kg: '', tare_kg: '', net_kg: '' });

  const [emptyWeighment, setEmptyWeighment] = useState(blankEmptyWeighment());
  const [loadedWeighment, setLoadedWeighment] = useState(blankLoadedWeighment());
  const [emptyParsing, setEmptyParsing] = useState(false);
  const [loadedParsing, setLoadedParsing] = useState(false);
  const [emptyError, setEmptyError] = useState('');
  const [loadedError, setLoadedError] = useState('');
  const [emptyNotice, setEmptyNotice] = useState('');
  const [loadedNotice, setLoadedNotice] = useState('');
  const emptyFileRef = useRef(null);
  const loadedFileRef = useRef(null);

  const computedNetKg = loadedWeighment.net_kg !== ''
    ? Number(loadedWeighment.net_kg)
    : (loadedWeighment.gross_kg !== '' && emptyWeighment.weight_kg !== ''
        ? Number((Number(loadedWeighment.gross_kg) - Number(emptyWeighment.weight_kg)).toFixed(3))
        : null);

  async function handleEmptyWeighmentFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setEmptyError(''); setEmptyNotice('');
    setEmptyParsing(true);
    try {
      const result = await parseWeighmentCertificate(file);
      const weight = result.tare_kg ?? result.net_kg ?? result.gross_kg;
      setEmptyWeighment(w => ({
        serial_no: result.serial_no || w.serial_no,
        vehicle_no: result.vehicle_no || w.vehicle_no,
        date: result.date || w.date,
        time: result.time || w.time,
        weight_kg: weight != null ? String(weight) : w.weight_kg,
      }));
      if (!result.matched) {
        setEmptyNotice('Couldn’t auto-read any fields from this file — the photo may be unclear or skewed. Please fill in the fields below by hand.');
      }
    } catch (err) {
      setEmptyError(err.response?.data?.error?.message || 'Could not read this weighment certificate');
    } finally {
      setEmptyParsing(false);
      if (emptyFileRef.current) emptyFileRef.current.value = '';
    }
  }

  async function handleLoadedWeighmentFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoadedError(''); setLoadedNotice('');
    setLoadedParsing(true);
    try {
      const result = await parseWeighmentCertificate(file);
      setLoadedWeighment(w => ({
        serial_no: result.serial_no || w.serial_no,
        vehicle_no: result.vehicle_no || w.vehicle_no,
        date: result.date || w.date,
        time: result.time || w.time,
        material: result.material || w.material,
        gross_kg: result.gross_kg != null ? String(result.gross_kg) : w.gross_kg,
        tare_kg: result.tare_kg != null ? String(result.tare_kg) : w.tare_kg,
        net_kg: result.net_kg != null ? String(result.net_kg) : w.net_kg,
      }));
      if (!result.matched) {
        setLoadedNotice('Couldn’t auto-read any fields from this file — the photo may be unclear or skewed. Please fill in the fields below by hand.');
      }
    } catch (err) {
      setLoadedError(err.response?.data?.error?.message || 'Could not read this weighment certificate');
    } finally {
      setLoadedParsing(false);
      if (loadedFileRef.current) loadedFileRef.current.value = '';
    }
  }

  function resetWeighments() {
    setEmptyWeighment(blankEmptyWeighment());
    setLoadedWeighment(blankLoadedWeighment());
    setEmptyNotice(''); setLoadedNotice('');
  }

  function weighmentPayload() {
    const hasEmpty = emptyWeighment.serial_no || emptyWeighment.vehicle_no || emptyWeighment.weight_kg !== '';
    const hasLoaded = loadedWeighment.serial_no || loadedWeighment.vehicle_no || loadedWeighment.gross_kg !== '' || loadedWeighment.net_kg !== '';
    if (!hasEmpty && !hasLoaded) return {};

    const emptyKg = emptyWeighment.weight_kg !== '' ? Number(emptyWeighment.weight_kg) : null;
    const grossKg = loadedWeighment.gross_kg !== '' ? Number(loadedWeighment.gross_kg) : null;
    const netKg = computedNetKg;

    return {
      vehicle_no: loadedWeighment.vehicle_no?.trim() || emptyWeighment.vehicle_no?.trim() || null,
      gross_weight_kg: grossKg,
      tare_weight_kg: emptyKg,
      net_weight_kg: netKg,

      empty_serial_no: emptyWeighment.serial_no?.trim() || null,
      empty_vehicle_no: emptyWeighment.vehicle_no?.trim() || null,
      empty_weighed_date: emptyWeighment.date || null,
      empty_weighed_time: emptyWeighment.time || null,
      empty_weight_kg: emptyKg,

      loaded_serial_no: loadedWeighment.serial_no?.trim() || null,
      loaded_vehicle_no: loadedWeighment.vehicle_no?.trim() || null,
      loaded_weighed_date: loadedWeighment.date || null,
      loaded_weighed_time: loadedWeighment.time || null,
      loaded_material: loadedWeighment.material?.trim() || null,
      loaded_gross_weight_kg: grossKg,
      loaded_tare_weight_kg: loadedWeighment.tare_kg !== '' ? Number(loadedWeighment.tare_kg) : null,
      loaded_net_weight_kg: netKg,
    };
  }

  function handleDownloadWeighmentPdf() {
    downloadWeighmentPdf({
      empty: { ...emptyWeighment, weight_kg: emptyWeighment.weight_kg !== '' ? Number(emptyWeighment.weight_kg) : null },
      loaded: {
        ...loadedWeighment,
        gross_kg: loadedWeighment.gross_kg !== '' ? Number(loadedWeighment.gross_kg) : null,
        tare_kg: loadedWeighment.tare_kg !== '' ? Number(loadedWeighment.tare_kg) : null,
        net_kg: computedNetKg,
      },
      invoice_no: mHeader.invoice_no || undefined,
    });
  }

  // Save the weighment on its own — e.g. the vehicle has been weighed but the
  // disposal items aren't ready yet. Shows up in Recorded Weighments right away.
  const [savingWeighmentOnly, setSavingWeighmentOnly] = useState(false);
  const [weighmentSaveMsg, setWeighmentSaveMsg] = useState('');
  const [weighmentSaveError, setWeighmentSaveError] = useState('');

  async function handleSaveWeighmentOnly() {
    setWeighmentSaveError(''); setWeighmentSaveMsg('');
    const payload = weighmentPayload();
    if (!Object.keys(payload).length) {
      setWeighmentSaveError('Enter at least one weighment field before saving.');
      return;
    }
    setSavingWeighmentOnly(true);
    try {
      await createWeighmentRecord(payload);
      setWeighmentSaveMsg('✓ Weighment saved — see it under Recorded Weighments below.');
      resetWeighments();
      fetchWeighmentRecords();
    } catch (err) {
      setWeighmentSaveError(err.response?.data?.error?.message || 'Failed to save weighment');
    } finally { setSavingWeighmentOnly(false); }
  }

  async function fetchInvoices() {
    setLoading(true);
    try {
      const result = await getDisposalInvoices({ limit: 50 });
      setInvoices(result.items || []);
    } catch (err) {
      setListError(err.response?.data?.error?.message || 'Failed to load');
    } finally { setLoading(false); }
  }

  useEffect(() => { fetchInvoices(); }, []);

  // ── Recorded weighments — tracked independently so they can be edited/deleted on their own ──
  const [weighmentRecords, setWeighmentRecords] = useState([]);
  const [weighmentRecordsLoading, setWeighmentRecordsLoading] = useState(true);
  const [weighmentRecordsError, setWeighmentRecordsError] = useState('');
  const [editingWeighmentId, setEditingWeighmentId] = useState(null);
  const [weighmentRecordEdits, setWeighmentRecordEdits] = useState({});
  const [weighmentRecordSaving, setWeighmentRecordSaving] = useState(false);
  const [deletingWeighmentId, setDeletingWeighmentId] = useState(null);

  async function fetchWeighmentRecords() {
    setWeighmentRecordsLoading(true);
    try {
      const result = await getWeighmentRecords({ limit: 50 });
      setWeighmentRecords(result.items || []);
    } catch (err) {
      setWeighmentRecordsError(err.response?.data?.error?.message || 'Failed to load');
    } finally { setWeighmentRecordsLoading(false); }
  }

  useEffect(() => { fetchWeighmentRecords(); }, []);

  function startEditWeighmentRecord(rec) {
    setWeighmentRecordsError('');
    setEditingWeighmentId(rec.id);
    setWeighmentRecordEdits({
      empty_serial_no: rec.empty_serial_no ?? '',
      empty_vehicle_no: rec.empty_vehicle_no ?? '',
      empty_weighed_date: rec.empty_weighed_date ?? '',
      empty_weighed_time: rec.empty_weighed_time ?? '',
      empty_weight_kg: rec.empty_weight_kg ?? '',
      loaded_serial_no: rec.loaded_serial_no ?? '',
      loaded_vehicle_no: rec.loaded_vehicle_no ?? '',
      loaded_weighed_date: rec.loaded_weighed_date ?? '',
      loaded_weighed_time: rec.loaded_weighed_time ?? '',
      loaded_material: rec.loaded_material ?? '',
      loaded_gross_weight_kg: rec.loaded_gross_weight_kg ?? '',
      loaded_tare_weight_kg: rec.loaded_tare_weight_kg ?? '',
      loaded_net_weight_kg: rec.loaded_net_weight_kg ?? '',
    });
  }

  function cancelEditWeighmentRecord() {
    setEditingWeighmentId(null);
    setWeighmentRecordEdits({});
  }

  async function saveEditWeighmentRecord() {
    if (!editingWeighmentId) return;
    setWeighmentRecordSaving(true);
    setWeighmentRecordsError('');
    const num = (v) => (v === '' || v == null ? null : Number(v));
    try {
      await editWeighmentRecord(editingWeighmentId, {
        empty_serial_no: weighmentRecordEdits.empty_serial_no?.trim() || null,
        empty_vehicle_no: weighmentRecordEdits.empty_vehicle_no?.trim() || null,
        empty_weighed_date: weighmentRecordEdits.empty_weighed_date || null,
        empty_weighed_time: weighmentRecordEdits.empty_weighed_time || null,
        empty_weight_kg: num(weighmentRecordEdits.empty_weight_kg),
        loaded_serial_no: weighmentRecordEdits.loaded_serial_no?.trim() || null,
        loaded_vehicle_no: weighmentRecordEdits.loaded_vehicle_no?.trim() || null,
        loaded_weighed_date: weighmentRecordEdits.loaded_weighed_date || null,
        loaded_weighed_time: weighmentRecordEdits.loaded_weighed_time || null,
        loaded_material: weighmentRecordEdits.loaded_material?.trim() || null,
        loaded_gross_weight_kg: num(weighmentRecordEdits.loaded_gross_weight_kg),
        loaded_tare_weight_kg: num(weighmentRecordEdits.loaded_tare_weight_kg),
        loaded_net_weight_kg: num(weighmentRecordEdits.loaded_net_weight_kg),
      });
      setEditingWeighmentId(null);
      setWeighmentRecordEdits({});
      fetchWeighmentRecords();
      fetchInvoices();
    } catch (err) {
      setWeighmentRecordsError(err.response?.data?.error?.message || 'Failed to update weighment');
    } finally { setWeighmentRecordSaving(false); }
  }

  async function handleDeleteWeighmentRecord(rec) {
    if (!window.confirm(`Delete this weighment record (${rec.vehicle_no || 'no vehicle no.'})? This cannot be undone.`)) return;
    setDeletingWeighmentId(rec.id);
    setWeighmentRecordsError('');
    try {
      await deleteWeighmentRecord(rec.id);
      fetchWeighmentRecords();
      fetchInvoices();
    } catch (err) {
      setWeighmentRecordsError(err.response?.data?.error?.message || 'Delete failed');
    } finally { setDeletingWeighmentId(null); }
  }

  const [deletingId, setDeletingId] = useState(null);
  async function handleDelete(inv) {
    if (!window.confirm(`Delete disposal ${inv.invoice_no}? Its quantities will be added back to stock. This cannot be undone.`)) return;
    setDeletingId(inv.id);
    setListError('');
    try {
      await deleteDisposalInvoice(inv.id);
      fetchInvoices();
    } catch (err) {
      setListError(err.response?.data?.error?.message || 'Delete failed');
    } finally { setDeletingId(null); }
  }

  // ── Per-item edit (admin only) for already-recorded disposals ─────────────
  const [expandedInvoiceId, setExpandedInvoiceId] = useState(null);
  const [editingItem, setEditingItem] = useState(null); // { invoiceId, itemId }
  const [itemEdits, setItemEdits] = useState({});
  const [itemSaving, setItemSaving] = useState(false);
  const [deletingItemId, setDeletingItemId] = useState(null);

  function toggleExpand(invId) {
    setExpandedInvoiceId(id => (id === invId ? null : invId));
    setEditingItem(null);
  }

  function startEditItem(inv, it) {
    setListError('');
    setEditingItem({ invoiceId: inv.id, itemId: it.id });
    setItemEdits({
      material_description: it.material_description ?? '',
      category: it.category ?? '',
      qty_kg: it.qty_kg ?? '',
      unit_price: it.unit_price ?? '',
    });
  }

  function cancelEditItem() {
    setEditingItem(null);
    setItemEdits({});
  }

  async function saveEditItem() {
    if (!editingItem) return;
    setItemSaving(true);
    setListError('');
    try {
      await editDisposalItem(editingItem.invoiceId, editingItem.itemId, {
        material_description: itemEdits.material_description?.trim() || undefined,
        category: itemEdits.category?.trim() || undefined,
        qty_kg: itemEdits.qty_kg !== '' ? Number(itemEdits.qty_kg) : undefined,
        unit_price: itemEdits.unit_price !== '' ? Number(itemEdits.unit_price) : null,
      });
      setEditingItem(null);
      setItemEdits({});
      fetchInvoices();
    } catch (err) {
      setListError(err.response?.data?.error?.message || 'Failed to update item');
    } finally { setItemSaving(false); }
  }

  async function handleDeleteItem(inv, it) {
    if (!window.confirm(`Remove "${it.category}" (${fmtKg(it.qty_kg)}) from disposal ${inv.invoice_no}? The other items are not affected. This cannot be undone.`)) return;
    setDeletingItemId(it.id);
    setListError('');
    try {
      await deleteDisposalItem(inv.id, it.id);
      fetchInvoices();
    } catch (err) {
      setListError(err.response?.data?.error?.message || 'Failed to remove item');
    } finally { setDeletingItemId(null); }
  }

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setParseError(''); setSaveError(''); setDraft(null);
    setParsing(true);
    try {
      const result = await parseDisposalInvoice(file);
      setDraft(result);
    } catch (err) {
      setParseError(err.response?.data?.error?.message || 'Could not parse PDF');
    } finally {
      setParsing(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  function setItemFields(idx, fields) {
    setDraft(d => {
      const items = [...d.items];
      items[idx] = { ...items[idx], ...fields };
      return { ...d, items };
    });
  }
  function setItem(idx, key, value) {
    setItemFields(idx, { [key]: value });
  }
  function setHeader(key, value) {
    setDraft(d => ({ ...d, header: { ...d.header, [key]: value } }));
  }

  // Re-fetch the live available stock for a row whenever its category or the invoice date changes.
  async function refreshStock(idx, category, date) {
    if (!category || !date) {
      setItemFields(idx, { available_stock: null, opening_stock: null, waste_for_day: null, _stockLoading: false });
      return;
    }
    setItemFields(idx, { _stockLoading: true });
    try {
      const s = await getDisposalStock(category, date);
      setItemFields(idx, {
        available_stock: s.available, opening_stock: s.opening, waste_for_day: s.waste,
        waste_type: s.waste_type ?? undefined, stock_source: s.source, _stockLoading: false,
      });
    } catch {
      setItemFields(idx, { _stockLoading: false });
    }
  }

  function handleCategoryChange(idx, category) {
    setItem(idx, 'category', category);
    refreshStock(idx, category, draft.header.invoice_date);
  }

  function handleDateChange(date) {
    setHeader('invoice_date', date);
    draft.items.forEach((it, idx) => { if (it.category) refreshStock(idx, it.category, date); });
  }

  async function handleSave() {
    setSaveError('');
    const unmatched = draft.items.filter(i => !i.category);
    if (unmatched.length) {
      setSaveError(`Assign a category for: ${unmatched.map(i => i.material_description).join(', ')}`);
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...draft.header,
        items: draft.items.map(i => ({
          material_description: i.material_description,
          category: i.category,
          waste_type: i.waste_type || undefined,
          qty_kg: Number(i.qty_kg),
          unit_price: i.unit_price != null ? Number(i.unit_price) : null,
        })),
        ...weighmentPayload(),
      };
      await createDisposalInvoice(payload);
      setDraft(null);
      resetWeighments();
      fetchInvoices();
      fetchWeighmentRecords();
    } catch (err) {
      setSaveError(err.response?.data?.error?.message || 'Save failed');
    } finally { setSaving(false); }
  }

  const draftTotal = draft?.items.reduce((s, i) => s + Number(i.qty_kg || 0), 0) ?? 0;

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="page-title">Record Disposal</h1>
          <p className="page-subtitle">Subtract dispatched scrap from stock — upload a vendor invoice PDF or enter it manually.</p>
        </div>

        {/* Mode tabs */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
          {[
            { key: 'pdf', label: 'Upload Invoice PDF' },
            { key: 'manual', label: 'Manual Entry' },
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

        {/* ── Weighment certificates (vehicle weight) — shared by both modes ── */}
        <div className="card">
          <h2 className="font-semibold text-gray-900 mb-1">Weighbridge Weighment Certificates</h2>
          <p className="text-sm text-gray-500 mb-4">
            Vehicles are weighed twice — once empty (tare) before loading, and once loaded (gross) with the scrap on board.
            Upload each certificate separately; fields are read automatically via OCR.
          </p>

          <div className="grid md:grid-cols-2 gap-6">
            {/* Empty (Tare) ticket */}
            <div className="border border-gray-200 rounded-lg p-4">
              <h3 className="font-semibold text-gray-800 mb-1">1. Empty Weighment (Vehicle Tare)</h3>
              {emptyError && <div className="text-red-600 text-xs mb-2 bg-red-50 border border-red-200 rounded p-2">{emptyError}</div>}
              {emptyNotice && <div className="text-amber-800 text-xs mb-2 bg-amber-50 border border-amber-300 rounded p-2">📸 {emptyNotice}</div>}
              <div className="flex items-center gap-3 mb-3">
                <input
                  ref={emptyFileRef}
                  type="file"
                  accept="application/pdf,image/jpeg,image/png,image/webp"
                  onChange={handleEmptyWeighmentFile}
                  disabled={emptyParsing}
                  className="block text-xs text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-brand-primary file:text-white hover:file:bg-teal-700 file:cursor-pointer"
                />
                {emptyParsing && <span className="text-xs text-gray-500">Reading…</span>}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">Serial No.</label>
                  <input className="form-input text-sm" value={emptyWeighment.serial_no}
                    onChange={e => setEmptyWeighment(w => ({ ...w, serial_no: e.target.value }))} />
                </div>
                <div>
                  <label className="form-label">Vehicle No.</label>
                  <input className="form-input text-sm" placeholder="e.g. TN18AC7492" value={emptyWeighment.vehicle_no}
                    onChange={e => setEmptyWeighment(w => ({ ...w, vehicle_no: e.target.value }))} />
                </div>
                <div>
                  <label className="form-label">Date</label>
                  <input type="date" className="form-input text-sm" value={emptyWeighment.date}
                    onChange={e => setEmptyWeighment(w => ({ ...w, date: e.target.value }))} />
                </div>
                <div>
                  <label className="form-label">Time</label>
                  <input className="form-input text-sm" placeholder="HH:MM:SS" value={emptyWeighment.time}
                    onChange={e => setEmptyWeighment(w => ({ ...w, time: e.target.value }))} />
                </div>
                <div className="col-span-2">
                  <label className="form-label">Vehicle Weight (Tare, kg)</label>
                  <input type="number" step="0.001" min="0" className="form-input text-sm" value={emptyWeighment.weight_kg}
                    onChange={e => setEmptyWeighment(w => ({ ...w, weight_kg: e.target.value }))} />
                </div>
              </div>
            </div>

            {/* Loaded (Gross) ticket */}
            <div className="border border-gray-200 rounded-lg p-4">
              <h3 className="font-semibold text-gray-800 mb-1">2. Loaded Weighment (Vehicle + Scrap)</h3>
              {loadedError && <div className="text-red-600 text-xs mb-2 bg-red-50 border border-red-200 rounded p-2">{loadedError}</div>}
              {loadedNotice && <div className="text-amber-800 text-xs mb-2 bg-amber-50 border border-amber-300 rounded p-2">📸 {loadedNotice}</div>}
              <div className="flex items-center gap-3 mb-3">
                <input
                  ref={loadedFileRef}
                  type="file"
                  accept="application/pdf,image/jpeg,image/png,image/webp"
                  onChange={handleLoadedWeighmentFile}
                  disabled={loadedParsing}
                  className="block text-xs text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-brand-primary file:text-white hover:file:bg-teal-700 file:cursor-pointer"
                />
                {loadedParsing && <span className="text-xs text-gray-500">Reading…</span>}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">Serial No.</label>
                  <input className="form-input text-sm" value={loadedWeighment.serial_no}
                    onChange={e => setLoadedWeighment(w => ({ ...w, serial_no: e.target.value }))} />
                </div>
                <div>
                  <label className="form-label">Vehicle No.</label>
                  <input className="form-input text-sm" placeholder="e.g. TN18AC7492" value={loadedWeighment.vehicle_no}
                    onChange={e => setLoadedWeighment(w => ({ ...w, vehicle_no: e.target.value }))} />
                </div>
                <div>
                  <label className="form-label">Date</label>
                  <input type="date" className="form-input text-sm" value={loadedWeighment.date}
                    onChange={e => setLoadedWeighment(w => ({ ...w, date: e.target.value }))} />
                </div>
                <div>
                  <label className="form-label">Time</label>
                  <input className="form-input text-sm" placeholder="HH:MM:SS" value={loadedWeighment.time}
                    onChange={e => setLoadedWeighment(w => ({ ...w, time: e.target.value }))} />
                </div>
                <div className="col-span-2">
                  <label className="form-label">Material</label>
                  <input className="form-input text-sm" value={loadedWeighment.material}
                    onChange={e => setLoadedWeighment(w => ({ ...w, material: e.target.value }))} />
                </div>
                <div>
                  <label className="form-label">Gross (kg)</label>
                  <input type="number" step="0.001" min="0" className="form-input text-sm" value={loadedWeighment.gross_kg}
                    onChange={e => setLoadedWeighment(w => ({ ...w, gross_kg: e.target.value }))} />
                </div>
                <div>
                  <label className="form-label">Tare (kg)</label>
                  <input type="number" step="0.001" min="0" className="form-input text-sm" value={loadedWeighment.tare_kg}
                    onChange={e => setLoadedWeighment(w => ({ ...w, tare_kg: e.target.value }))} />
                </div>
                <div className="col-span-2">
                  <label className="form-label">Nett / Scrap Weight (kg)</label>
                  <input type="number" step="0.001" min="0" className="form-input text-sm" value={loadedWeighment.net_kg}
                    onChange={e => setLoadedWeighment(w => ({ ...w, net_kg: e.target.value }))} />
                </div>
              </div>
            </div>
          </div>

          {computedNetKg != null && (
            <p className="text-sm mt-4 text-gray-600">
              Net Scrap Weight: <span className="font-semibold text-brand-primary">{fmtKg(computedNetKg)}</span>
            </p>
          )}

          {weighmentSaveMsg && <p className="text-sm mt-3 text-green-700">{weighmentSaveMsg}</p>}
          {weighmentSaveError && <p className="text-sm mt-3 text-red-600">{weighmentSaveError}</p>}

          <div className="flex justify-end gap-3 mt-3">
            <button
              type="button"
              onClick={handleDownloadWeighmentPdf}
              disabled={!emptyWeighment.weight_kg && !loadedWeighment.gross_kg && !loadedWeighment.net_kg}
              className="btn-secondary text-sm disabled:opacity-50"
            >
              📄 Download Weighment Certificate (PDF)
            </button>
            <button
              type="button"
              onClick={handleSaveWeighmentOnly}
              disabled={savingWeighmentOnly || (!emptyWeighment.weight_kg && !loadedWeighment.gross_kg && !loadedWeighment.net_kg)}
              className="btn-primary text-sm disabled:opacity-50"
            >
              {savingWeighmentOnly ? 'Saving…' : '✓ Save Weighment'}
            </button>
          </div>
        </div>

        {/* ── PDF upload mode ──────────────────────────────────────────────── */}
        {mode === 'pdf' && (<>
        {/* Upload */}
        <div className="card">
          <h2 className="font-semibold text-gray-900 mb-3">Upload Invoice PDF</h2>
          {parseError && <div className="text-red-600 text-sm mb-3 bg-red-50 border border-red-200 rounded p-3">{parseError}</div>}
          <div className="flex items-center gap-3">
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf"
              onChange={handleFile}
              disabled={parsing}
              className="block text-sm text-gray-600 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-brand-primary file:text-white hover:file:bg-teal-700 file:cursor-pointer"
            />
            {parsing && <span className="text-sm text-gray-500">Parsing…</span>}
          </div>
        </div>

        {/* Parsed preview */}
        {draft && (
          <div className="card">
            <h2 className="font-semibold text-gray-900 mb-4">Review &amp; Confirm</h2>
            {draft.header.ocr && (
              <div className="text-amber-800 text-sm mb-3 bg-amber-50 border border-amber-300 rounded p-3">
                📸 This was a scanned PDF read via OCR — please double-check every field (especially the date and quantities) before confirming.
              </div>
            )}
            {saveError && (
              <div className="text-red-700 text-sm mb-3 bg-red-50 border border-red-300 rounded p-3">
                <p className="font-semibold mb-0.5">⚠ Disposal not possible</p>
                <p>{saveError}</p>
              </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
              <div><label className="form-label">Invoice No.</label><input className="form-input" value={draft.header.invoice_no || ''} onChange={e => setHeader('invoice_no', e.target.value)} /></div>
              <div><label className="form-label">Invoice Date</label><input type="date" className="form-input" value={draft.header.invoice_date || ''} onChange={e => handleDateChange(e.target.value)} /></div>
              <div><label className="form-label">Vendor</label><input className="form-input" value={draft.header.vendor_name || ''} onChange={e => setHeader('vendor_name', e.target.value)} /></div>
              <div><label className="form-label">GSTIN</label><input className="form-input" value={draft.header.vendor_gstin || ''} onChange={e => setHeader('vendor_gstin', e.target.value)} /></div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
                <thead>
                  <tr>
                    <th className="table-header">Material (from invoice)</th>
                    <th className="table-header">Matched Category</th>
                    <th className="table-header">Qty (kg)</th>
                    <th className="table-header">In Stock</th>
                  </tr>
                </thead>
                <tbody>
                  {draft.items.map((it, i) => {
                    const short = it.available_stock != null && Number(it.qty_kg) > it.available_stock;
                    return (
                      <tr key={i} className={i % 2 === 1 ? 'bg-gray-50' : ''}>
                        <td className="table-cell">{it.material_description}</td>
                        <td className="table-cell">
                          <select
                            className={`form-select text-xs py-1 ${!it.category ? 'border-red-300 text-red-600' : ''}`}
                            value={it.category || ''}
                            onChange={e => handleCategoryChange(i, e.target.value || null)}
                          >
                            <option value="">— select —</option>
                            {allCategories.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
                          </select>
                          {it.match_confidence != null && it.category && (
                            <span className="ml-2 text-[11px] text-gray-400">{Math.round(it.match_confidence * 100)}% match</span>
                          )}
                        </td>
                        <td className="table-cell">
                          <input type="number" step="0.001" className={`form-input text-xs py-1 w-28 ${short ? 'border-amber-400 text-amber-700' : ''}`} value={it.qty_kg} onChange={e => setItem(i, 'qty_kg', e.target.value)} />
                        </td>
                        <td className="table-cell">
                          {it._stockLoading ? (
                            <span className="text-gray-400 text-xs">checking…</span>
                          ) : it.available_stock == null ? (
                            <span className="text-gray-400">—</span>
                          ) : (
                            <span className={short ? 'text-amber-700 font-semibold' : 'text-gray-600'}>
                              {fmtKg(it.available_stock)}{short && ' ⚠'}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-50 font-semibold">
                    <td className="table-cell text-right" colSpan={2}>Total to subtract</td>
                    <td className="table-cell">{fmtKg(draftTotal)}</td>
                    <td className="table-cell" />
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="flex justify-end gap-3 mt-4">
              <button onClick={() => setDraft(null)} className="btn-secondary">Cancel</button>
              <button onClick={handleSave} disabled={saving} className="btn-primary">
                {saving ? 'Recording…' : 'Confirm & Subtract from Stock'}
              </button>
            </div>
          </div>
        )}
        </>)}

        {/* ── Manual entry mode ────────────────────────────────────────────── */}
        {mode === 'manual' && (
          <div className="card">
            <h2 className="font-semibold text-gray-900 mb-1">Manual Disposal Entry</h2>
            <p className="text-sm text-gray-500 mb-4">Record a disposal by hand — pick the date, then add each category and the quantity dispatched.</p>

            {mError && (
              <div className="text-red-700 text-sm mb-3 bg-red-50 border border-red-300 rounded p-3">
                <p className="font-semibold mb-0.5">⚠ Disposal not possible</p>
                <p>{mError}</p>
              </div>
            )}
            {mSuccess && (
              <div className="text-green-800 text-sm mb-3 bg-green-50 border border-green-300 rounded p-3">{mSuccess}</div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-5">
              <div>
                <label className="form-label">Disposal Date *</label>
                <input type="date" className="form-input" value={mHeader.invoice_date} onChange={e => handleManualDate(e.target.value)} />
              </div>
              <div>
                <label className="form-label">Vendor (optional)</label>
                <input className="form-input" placeholder="e.g. ABC Recyclers" value={mHeader.vendor_name} onChange={e => setMHeader(h => ({ ...h, vendor_name: e.target.value }))} />
              </div>
              <div>
                <label className="form-label">Reference / Invoice No. (optional)</label>
                <input className="form-input" placeholder="auto-generated if blank" value={mHeader.invoice_no} onChange={e => setMHeader(h => ({ ...h, invoice_no: e.target.value }))} />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
                <thead>
                  <tr>
                    <th className="table-header">Category</th>
                    <th className="table-header">Qty (kg)</th>
                    <th className="table-header">In Stock</th>
                    <th className="table-header w-12"></th>
                  </tr>
                </thead>
                <tbody>
                  {mItems.map((it, i) => {
                    const short = it.available_stock != null && Number(it.qty_kg) > it.available_stock;
                    return (
                      <tr key={i} className={i % 2 === 1 ? 'bg-gray-50' : ''}>
                        <td className="table-cell">
                          <select
                            className={`form-select text-xs py-1 ${!it.category ? 'border-gray-300' : ''}`}
                            value={it.category}
                            onChange={e => handleManualCategory(i, e.target.value)}
                          >
                            <option value="">— select category —</option>
                            {allCategories.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
                          </select>
                        </td>
                        <td className="table-cell">
                          <input type="number" step="0.001" min="0" className={`form-input text-xs py-1 w-28 ${short ? 'border-amber-400 text-amber-700' : ''}`} value={it.qty_kg} onChange={e => setMItemFields(i, { qty_kg: e.target.value })} />
                        </td>
                        <td className="table-cell">
                          {it._stockLoading ? (
                            <span className="text-gray-400 text-xs">checking…</span>
                          ) : it.available_stock == null ? (
                            <span className="text-gray-400">—</span>
                          ) : (
                            <span className={short ? 'text-amber-700 font-semibold' : 'text-gray-600'}>
                              {fmtKg(it.available_stock)}{short && ' ⚠'}
                            </span>
                          )}
                        </td>
                        <td className="table-cell text-center">
                          <button onClick={() => removeManualRow(i)} className="text-gray-400 hover:text-red-600 text-lg leading-none" title="Remove row">×</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-50 font-semibold">
                    <td className="table-cell text-right">Total to subtract</td>
                    <td className="table-cell">{fmtKg(manualTotal)}</td>
                    <td className="table-cell" colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="flex justify-between items-center mt-4">
              <button onClick={addManualRow} className="btn-secondary text-sm">+ Add Row</button>
              <button onClick={handleManualSave} disabled={mSaving} className="btn-primary">
                {mSaving ? 'Recording…' : 'Record Disposal & Subtract from Stock'}
              </button>
            </div>
          </div>
        )}

        {/* Recorded disposals */}
        <div className="card">
          <button
            type="button"
            onClick={() => setDisposalsOpen(o => !o)}
            className="w-full flex items-center justify-between font-semibold text-gray-900 mb-1"
          >
            <span>Recorded Disposals {invoices.length ? `(${invoices.length})` : ''}</span>
            <span className="text-gray-400 text-sm">{disposalsOpen ? '▲ Collapse' : '▼ Expand'}</span>
          </button>
          {listError && <ErrorAlert message={listError} onRetry={fetchInvoices} />}
          {disposalsOpen && (loading ? <LoadingSpinner /> : (
            <div className="overflow-x-auto mt-3">
              <table className="min-w-full text-sm">
                <thead>
                  <tr>
                    {['Invoice No.', 'Date', 'Vendor', 'Materials', 'Total Qty', 'Scrap Left', 'Vehicle', 'Recorded By', 'Recorded At'].map(h => <th key={h} className="table-header">{h}</th>)}
                    {isAdmin && <th className="table-header text-right">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv, i) => {
                    const total = (inv.items || []).reduce((s, it) => s + Number(it.qty_kg || 0), 0);
                    return (
                      <Fragment key={inv.id}>
                      <tr className={i % 2 === 1 ? 'bg-gray-50' : ''}>
                        <td className="table-cell font-mono text-xs">{inv.invoice_no}</td>
                        <td className="table-cell">{formatDate(inv.invoice_date)}</td>
                        <td className="table-cell font-medium">{inv.vendor_name}</td>
                        <td className="table-cell text-xs text-gray-600">
                          {isAdmin ? (
                            <button onClick={() => toggleExpand(inv.id)} className="text-brand-primary hover:underline text-left">
                              {(inv.items || []).map(it => `${it.category} (${fmtKg(it.qty_kg)})`).join(', ')}
                              {' '}{expandedInvoiceId === inv.id ? '▲' : '▼'}
                            </button>
                          ) : (
                            (inv.items || []).map(it => `${it.category} (${fmtKg(it.qty_kg)})`).join(', ')
                          )}
                        </td>
                        <td className="table-cell">{fmtKg(total)}</td>
                        <td className="table-cell text-xs text-gray-600">
                          {(inv.items || []).map(it => `${it.category}: ${it.remaining_stock_kg != null ? fmtKg(it.remaining_stock_kg) : '—'}`).join(', ')}
                        </td>
                        <td className="table-cell text-xs">
                          {inv.vehicle_no ? (
                            <>
                              <span className="font-mono">{inv.vehicle_no}</span>
                              {inv.gross_weight_kg != null && (
                                <span className="block text-gray-400">G {fmtKg(inv.gross_weight_kg)} · T {fmtKg(inv.tare_weight_kg)} · N {fmtKg(inv.net_weight_kg)}</span>
                              )}
                              {inv.weighment && (
                                <button
                                  onClick={() => downloadWeighmentPdf({
                                    empty: { serial_no: inv.weighment.empty_serial_no, vehicle_no: inv.weighment.empty_vehicle_no, date: inv.weighment.empty_weighed_date, time: inv.weighment.empty_weighed_time, weight_kg: inv.weighment.empty_weight_kg },
                                    loaded: { serial_no: inv.weighment.loaded_serial_no, vehicle_no: inv.weighment.loaded_vehicle_no, date: inv.weighment.loaded_weighed_date, time: inv.weighment.loaded_weighed_time, material: inv.weighment.loaded_material, gross_kg: inv.weighment.loaded_gross_weight_kg, tare_kg: inv.weighment.loaded_tare_weight_kg, net_kg: inv.weighment.loaded_net_weight_kg },
                                    invoice_no: inv.invoice_no,
                                  })}
                                  className="block text-brand-primary hover:underline mt-0.5"
                                >
                                  📄 Weighment PDF
                                </button>
                              )}
                            </>
                          ) : '—'}
                        </td>
                        <td className="table-cell">{inv.creator?.name || '—'}</td>
                        <td className="table-cell text-xs text-gray-500">{formatDateTime(inv.created_at)}</td>
                        {isAdmin && (
                          <td className="table-cell text-right">
                            <button
                              onClick={() => handleDelete(inv)}
                              disabled={deletingId === inv.id}
                              className="text-red-600 hover:text-red-800 text-xs font-medium disabled:opacity-50"
                            >
                              {deletingId === inv.id ? 'Deleting…' : 'Delete'}
                            </button>
                          </td>
                        )}
                      </tr>
                      {isAdmin && expandedInvoiceId === inv.id && (
                        <tr key={`${inv.id}-items`} className="bg-blue-50/40">
                          <td colSpan={10} className="px-4 py-3">
                            <table className="min-w-full text-xs border border-gray-200 rounded overflow-hidden bg-white">
                              <thead>
                                <tr>
                                  <th className="table-header">Material</th>
                                  <th className="table-header">Category</th>
                                  <th className="table-header">Qty (kg)</th>
                                  <th className="table-header">Unit Price</th>
                                  <th className="table-header text-right">Actions</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(inv.items || []).map(it => {
                                  const isEditingIt = editingItem?.invoiceId === inv.id && editingItem?.itemId === it.id;
                                  if (isEditingIt) {
                                    return (
                                      <tr key={it.id}>
                                        <td className="table-cell">
                                          <input className="form-input text-xs py-1" value={itemEdits.material_description}
                                            onChange={e => setItemEdits(s => ({ ...s, material_description: e.target.value }))} />
                                        </td>
                                        <td className="table-cell">
                                          <select className="form-select text-xs py-1" value={itemEdits.category}
                                            onChange={e => setItemEdits(s => ({ ...s, category: e.target.value }))}>
                                            {allCategories.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
                                          </select>
                                        </td>
                                        <td className="table-cell">
                                          <input type="number" step="0.001" className="form-input text-xs py-1 w-24" value={itemEdits.qty_kg}
                                            onChange={e => setItemEdits(s => ({ ...s, qty_kg: e.target.value }))} />
                                        </td>
                                        <td className="table-cell">
                                          <input type="number" step="0.01" className="form-input text-xs py-1 w-20" value={itemEdits.unit_price}
                                            onChange={e => setItemEdits(s => ({ ...s, unit_price: e.target.value }))} />
                                        </td>
                                        <td className="table-cell text-right whitespace-nowrap">
                                          <button onClick={saveEditItem} disabled={itemSaving} className="text-green-700 hover:text-green-900 font-medium disabled:opacity-50 mr-2">
                                            {itemSaving ? 'Saving…' : 'Save'}
                                          </button>
                                          <button onClick={cancelEditItem} disabled={itemSaving} className="text-gray-500 hover:text-gray-700 font-medium disabled:opacity-50">
                                            Cancel
                                          </button>
                                        </td>
                                      </tr>
                                    );
                                  }
                                  return (
                                    <tr key={it.id}>
                                      <td className="table-cell">{it.material_description}</td>
                                      <td className="table-cell">{it.category}</td>
                                      <td className="table-cell">{fmtKg(it.qty_kg)}</td>
                                      <td className="table-cell">{it.unit_price ?? '—'}</td>
                                      <td className="table-cell text-right whitespace-nowrap">
                                        <button onClick={() => startEditItem(inv, it)} className="text-brand-primary hover:text-teal-800 font-medium mr-3">
                                          Edit
                                        </button>
                                        <button onClick={() => handleDeleteItem(inv, it)} disabled={deletingItemId === it.id} className="text-red-600 hover:text-red-800 font-medium disabled:opacity-50">
                                          {deletingItemId === it.id ? 'Removing…' : 'Remove'}
                                        </button>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </td>
                        </tr>
                      )}
                      </Fragment>
                    );
                  })}
                  {!invoices.length && <tr><td colSpan={isAdmin ? 10 : 9} className="table-cell text-center text-gray-400 py-8">No disposals recorded yet</td></tr>}
                </tbody>
              </table>
            </div>
          ))}
        </div>

        {/* Recorded weighments — tracked separately so they can be edited/deleted on their own */}
        <div className="card">
          <button
            type="button"
            onClick={() => setWeighmentsOpen(o => !o)}
            className="w-full flex items-center justify-between font-semibold text-gray-900 mb-1"
          >
            <span>Recorded Weighments {weighmentRecords.length ? `(${weighmentRecords.length})` : ''}</span>
            <span className="text-gray-400 text-sm">{weighmentsOpen ? '▲ Collapse' : '▼ Expand'}</span>
          </button>
          <p className="text-sm text-gray-500 mb-1">Every empty/loaded weighbridge ticket pair, tracked independently of the disposal it was recorded against.</p>
          {weighmentRecordsError && <ErrorAlert message={weighmentRecordsError} onRetry={fetchWeighmentRecords} />}
          {weighmentsOpen && (weighmentRecordsLoading ? <LoadingSpinner /> : (
            <div className="overflow-x-auto mt-3">
              <table className="min-w-full text-sm">
                <thead>
                  <tr>
                    {['Vehicle', 'Empty (Tare)', 'Loaded (Gross/Nett)', 'Linked Disposal', 'Recorded By', 'Recorded At'].map(h => <th key={h} className="table-header">{h}</th>)}
                    {isAdmin && <th className="table-header text-right">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {weighmentRecords.map((rec, i) => {
                    const isEditingRec = editingWeighmentId === rec.id;
                    if (isEditingRec) {
                      return (
                        <tr key={rec.id} className={i % 2 === 1 ? 'bg-gray-50' : ''}>
                          <td className="table-cell text-xs" colSpan={isAdmin ? 7 : 6}>
                            <div className="grid md:grid-cols-2 gap-4 py-2">
                              <div className="border border-gray-200 rounded-lg p-3">
                                <h4 className="font-semibold text-gray-700 mb-2 text-xs">Empty (Tare)</h4>
                                <div className="grid grid-cols-2 gap-2">
                                  <input className="form-input text-xs py-1" placeholder="Serial No." value={weighmentRecordEdits.empty_serial_no}
                                    onChange={e => setWeighmentRecordEdits(s => ({ ...s, empty_serial_no: e.target.value }))} />
                                  <input className="form-input text-xs py-1" placeholder="Vehicle No." value={weighmentRecordEdits.empty_vehicle_no}
                                    onChange={e => setWeighmentRecordEdits(s => ({ ...s, empty_vehicle_no: e.target.value }))} />
                                  <input type="date" className="form-input text-xs py-1" value={weighmentRecordEdits.empty_weighed_date}
                                    onChange={e => setWeighmentRecordEdits(s => ({ ...s, empty_weighed_date: e.target.value }))} />
                                  <input className="form-input text-xs py-1" placeholder="Time" value={weighmentRecordEdits.empty_weighed_time}
                                    onChange={e => setWeighmentRecordEdits(s => ({ ...s, empty_weighed_time: e.target.value }))} />
                                  <input type="number" step="0.001" className="form-input text-xs py-1 col-span-2" placeholder="Tare Weight (kg)" value={weighmentRecordEdits.empty_weight_kg}
                                    onChange={e => setWeighmentRecordEdits(s => ({ ...s, empty_weight_kg: e.target.value }))} />
                                </div>
                              </div>
                              <div className="border border-gray-200 rounded-lg p-3">
                                <h4 className="font-semibold text-gray-700 mb-2 text-xs">Loaded (Gross/Nett)</h4>
                                <div className="grid grid-cols-2 gap-2">
                                  <input className="form-input text-xs py-1" placeholder="Serial No." value={weighmentRecordEdits.loaded_serial_no}
                                    onChange={e => setWeighmentRecordEdits(s => ({ ...s, loaded_serial_no: e.target.value }))} />
                                  <input className="form-input text-xs py-1" placeholder="Vehicle No." value={weighmentRecordEdits.loaded_vehicle_no}
                                    onChange={e => setWeighmentRecordEdits(s => ({ ...s, loaded_vehicle_no: e.target.value }))} />
                                  <input type="date" className="form-input text-xs py-1" value={weighmentRecordEdits.loaded_weighed_date}
                                    onChange={e => setWeighmentRecordEdits(s => ({ ...s, loaded_weighed_date: e.target.value }))} />
                                  <input className="form-input text-xs py-1" placeholder="Time" value={weighmentRecordEdits.loaded_weighed_time}
                                    onChange={e => setWeighmentRecordEdits(s => ({ ...s, loaded_weighed_time: e.target.value }))} />
                                  <input className="form-input text-xs py-1 col-span-2" placeholder="Material" value={weighmentRecordEdits.loaded_material}
                                    onChange={e => setWeighmentRecordEdits(s => ({ ...s, loaded_material: e.target.value }))} />
                                  <input type="number" step="0.001" className="form-input text-xs py-1" placeholder="Gross (kg)" value={weighmentRecordEdits.loaded_gross_weight_kg}
                                    onChange={e => setWeighmentRecordEdits(s => ({ ...s, loaded_gross_weight_kg: e.target.value }))} />
                                  <input type="number" step="0.001" className="form-input text-xs py-1" placeholder="Tare (kg)" value={weighmentRecordEdits.loaded_tare_weight_kg}
                                    onChange={e => setWeighmentRecordEdits(s => ({ ...s, loaded_tare_weight_kg: e.target.value }))} />
                                  <input type="number" step="0.001" className="form-input text-xs py-1 col-span-2" placeholder="Nett / Scrap (kg)" value={weighmentRecordEdits.loaded_net_weight_kg}
                                    onChange={e => setWeighmentRecordEdits(s => ({ ...s, loaded_net_weight_kg: e.target.value }))} />
                                </div>
                              </div>
                            </div>
                            <div className="flex justify-end gap-3 pb-2">
                              <button onClick={cancelEditWeighmentRecord} disabled={weighmentRecordSaving} className="btn-secondary text-xs disabled:opacity-50">Cancel</button>
                              <button onClick={saveEditWeighmentRecord} disabled={weighmentRecordSaving} className="btn-primary text-xs disabled:opacity-50">
                                {weighmentRecordSaving ? 'Saving…' : 'Save'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    }
                    return (
                      <tr key={rec.id} className={i % 2 === 1 ? 'bg-gray-50' : ''}>
                        <td className="table-cell font-mono text-xs">{rec.vehicle_no || '—'}</td>
                        <td className="table-cell text-xs text-gray-600">
                          {rec.empty_serial_no || '—'} · {fmtKg(rec.empty_weight_kg)}
                        </td>
                        <td className="table-cell text-xs text-gray-600">
                          {rec.loaded_serial_no || '—'} · G {fmtKg(rec.loaded_gross_weight_kg)} · N {fmtKg(rec.loaded_net_weight_kg)}
                        </td>
                        <td className="table-cell text-xs font-mono">{rec.invoice?.invoice_no || '—'}</td>
                        <td className="table-cell">{rec.creator?.name || '—'}</td>
                        <td className="table-cell text-xs text-gray-500">{formatDateTime(rec.created_at)}</td>
                        {isAdmin && (
                          <td className="table-cell text-right whitespace-nowrap">
                            <button onClick={() => downloadWeighmentPdf({
                              empty: { serial_no: rec.empty_serial_no, vehicle_no: rec.empty_vehicle_no, date: rec.empty_weighed_date, time: rec.empty_weighed_time, weight_kg: rec.empty_weight_kg },
                              loaded: { serial_no: rec.loaded_serial_no, vehicle_no: rec.loaded_vehicle_no, date: rec.loaded_weighed_date, time: rec.loaded_weighed_time, material: rec.loaded_material, gross_kg: rec.loaded_gross_weight_kg, tare_kg: rec.loaded_tare_weight_kg, net_kg: rec.loaded_net_weight_kg },
                              invoice_no: rec.invoice?.invoice_no,
                            })} className="text-brand-primary hover:text-teal-800 font-medium mr-3">
                              PDF
                            </button>
                            <button onClick={() => startEditWeighmentRecord(rec)} className="text-brand-primary hover:text-teal-800 font-medium mr-3">
                              Edit
                            </button>
                            <button onClick={() => handleDeleteWeighmentRecord(rec)} disabled={deletingWeighmentId === rec.id} className="text-red-600 hover:text-red-800 font-medium disabled:opacity-50">
                              {deletingWeighmentId === rec.id ? 'Deleting…' : 'Delete'}
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                  {!weighmentRecords.length && <tr><td colSpan={isAdmin ? 7 : 6} className="table-cell text-center text-gray-400 py-8">No weighments recorded yet</td></tr>}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      </div>
    </Layout>
  );
}
