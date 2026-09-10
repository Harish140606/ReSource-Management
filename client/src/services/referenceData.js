import api from './api.js';

export const getReferenceData = (type) =>
  api.get('/reference-data', { params: { type } }).then(r => r.data.data);

// Admin view — includes inactive items so they can be reactivated
export const getAdminReferenceData = (type) =>
  api.get('/reference-data', { params: { type, include_inactive: true } }).then(r => r.data.data);

export const getAllReferenceData = () =>
  api.get('/reference-data').then(r => r.data.data);

export const createReferenceItem = (data) =>
  api.post('/reference-data', data).then(r => r.data.data);

export const updateReferenceItem = (id, data) =>
  api.patch(`/reference-data/${id}`, data).then(r => r.data.data);

export const deleteReferenceItem = (id) =>
  api.delete(`/reference-data/${id}`).then(r => r.data.data);

export const hardDeleteReferenceItem = (id) =>
  api.delete(`/reference-data/${id}/hard`).then(r => r.data.data);
