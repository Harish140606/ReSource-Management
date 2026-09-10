import api from './api.js';

// Upload a PDF for parsing — returns { header, items } (nothing saved yet).
export const parseDisposalInvoice = (file) => {
  const fd = new FormData();
  fd.append('file', file);
  return api.post('/disposal-invoices/parse', fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then(r => r.data.data);
};

// OCR an uploaded weighment certificate (photo/scan) — returns extracted
// vehicle/weight fields. Nothing saved.
export const parseWeighmentCertificate = (file) => {
  const fd = new FormData();
  fd.append('file', file);
  return api.post('/disposal-invoices/parse-weighment', fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then(r => r.data.data);
};

// Confirm a parsed invoice — persists it and subtracts quantities from the ledger.
export const createDisposalInvoice = (body) =>
  api.post('/disposal-invoices', body).then(r => r.data.data);

export const getDisposalInvoices = (params) =>
  api.get('/disposal-invoices', { params }).then(r => r.data.data);

// Delete a recorded disposal (admin only) — adds its quantities back to stock.
export const deleteDisposalInvoice = (id) =>
  api.delete(`/disposal-invoices/${id}`).then(r => r.data.data);

// Remove a single item from a recorded disposal (admin only) without touching the rest.
export const deleteDisposalItem = (id, itemId) =>
  api.delete(`/disposal-invoices/${id}/items/${itemId}`).then(r => r.data.data);

// Edit a single disposal invoice item's values (admin only) without touching the rest.
export const editDisposalItem = (id, itemId, updates) =>
  api.patch(`/disposal-invoices/${id}/items/${itemId}`, updates).then(r => r.data.data);

// Live stock lookup for a category on a given date.
export const getDisposalStock = (category, date) =>
  api.get('/disposal-invoices/stock', { params: { category, date } }).then(r => r.data.data);
