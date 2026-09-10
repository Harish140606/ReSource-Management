import api from './api.js';

export const getDocuments = (params) =>
  api.get('/documents', { params }).then(r => r.data.data);

export const uploadDocument = (file, title, category) => {
  const fd = new FormData();
  fd.append('file', file);
  if (title) fd.append('title', title);
  if (category) fd.append('category', category);
  return api.post('/documents', fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then(r => r.data.data);
};

// Open a document in a new tab so the browser renders it inline (PDF, images)
// instead of forcing a download. Opens the tab synchronously first (before the
// async fetch resolves) so popup blockers don't treat it as an unsolicited popup.
export const viewDocument = async (id) => {
  const win = window.open('', '_blank');
  try {
    const res = await api.get(`/documents/${id}/download`, { responseType: 'blob' });
    const url = window.URL.createObjectURL(res.data);
    if (win) win.location.href = url;
    else window.open(url, '_blank');
  } catch (err) {
    if (win) win.close();
    throw err;
  }
};

export const downloadDocument = async (id, filename) => {
  const res = await api.get(`/documents/${id}/download`, { responseType: 'blob' });
  const url = window.URL.createObjectURL(new Blob([res.data]));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
};

export const deleteDocument = (id) =>
  api.delete(`/documents/${id}`).then(r => r.data.data);
