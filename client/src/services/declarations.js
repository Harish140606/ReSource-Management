import api from './api.js';

export const getNextReferenceNo = (source) => api.get('/declarations/next-reference', { params: { source } }).then(r => r.data.data);
export const createDeclaration = (body) => api.post('/declarations', body).then(r => r.data.data);
export const updateDeclaration = (id, body) => api.patch(`/declarations/${id}`, body).then(r => r.data.data);
export const deleteDeclaration = (id) => api.delete(`/declarations/${id}`).then(r => r.data.data);
export const deleteLineItem = (id, lineItemId) => api.delete(`/declarations/${id}/line-items/${lineItemId}`).then(r => r.data.data);
export const editLineItem = (id, lineItemId, updates) => api.patch(`/declarations/${id}/line-items/${lineItemId}`, updates).then(r => r.data.data);
export const getDeclarations = (params) => api.get('/declarations', { params }).then(r => r.data.data);
export const getDeclaration = (id) => api.get(`/declarations/${id}`).then(r => r.data.data);
export const submitDeclaration = (id) => api.patch(`/declarations/${id}/submit`).then(r => r.data.data);
export const approveDeclaration = (id) => api.patch(`/declarations/${id}/approve`).then(r => r.data.data);
export const updateStorageLocations = (id, items) => api.patch(`/declarations/${id}/storage-location`, { items }).then(r => r.data.data);
