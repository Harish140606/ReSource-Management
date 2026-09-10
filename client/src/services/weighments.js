import api from './api.js';

// List recorded weighment records (empty + loaded ticket pairs).
export const getWeighmentRecords = (params) =>
  api.get('/weighments', { params }).then(r => r.data.data);

// Save a weighment on its own, without attaching it to a disposal invoice yet.
export const createWeighmentRecord = (payload) =>
  api.post('/weighments', payload).then(r => r.data.data);

// Edit a recorded weighment (admin only) — also re-syncs the linked disposal's summary fields.
export const editWeighmentRecord = (id, updates) =>
  api.patch(`/weighments/${id}`, updates).then(r => r.data.data);

// Delete a recorded weighment (admin only) — clears the linked disposal's summary fields.
export const deleteWeighmentRecord = (id) =>
  api.delete(`/weighments/${id}`).then(r => r.data.data);
