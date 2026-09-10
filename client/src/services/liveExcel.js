import api from './api.js';

export const getExportLog = (params) => api.get('/admin/excel/export-log', { params }).then(r => r.data.data);
export const getVendorPickups = (params) => api.get('/vendor-pickups', { params }).then(r => r.data.data);
export const createVendorPickup = (body) => api.post('/vendor-pickups', body).then(r => r.data.data);
export const downloadVendorInvoice = (params) =>
  api.get('/vendor-pickups/export/invoice', { params, responseType: 'blob' }).then(r => r.data);
