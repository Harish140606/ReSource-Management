import { useState, useEffect, useRef } from 'react';
import Layout from '../components/Layout.jsx';
import LoadingSpinner from '../components/LoadingSpinner.jsx';
import ErrorAlert from '../components/ErrorAlert.jsx';
import Pagination from '../components/Pagination.jsx';
import { getDocuments, uploadDocument, viewDocument, downloadDocument, deleteDocument } from '../services/documents.js';
import { useAuth } from '../hooks/useAuth.jsx';
import { formatDateTime } from '../utils/dateHelpers.js';

const fmtSize = (bytes) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export default function Documents() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const fileRef = useRef(null);

  const [documents, setDocuments] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState('');

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');

  const [deletingId, setDeletingId] = useState(null);

  async function fetchDocuments() {
    setLoading(true);
    try {
      const result = await getDocuments({ page, limit: 20, search: search || undefined });
      setDocuments(result.documents || []);
      setTotal(result.total || 0);
      setPages(result.pages || 1);
    } catch (err) {
      setListError(err.response?.data?.error?.message || 'Failed to load documents');
    } finally { setLoading(false); }
  }

  useEffect(() => { fetchDocuments(); }, [page, search]);

  async function handleUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError('');
    setUploading(true);
    try {
      await uploadDocument(file, title, category);
      setTitle('');
      setCategory('');
      setPage(1);
      fetchDocuments();
    } catch (err) {
      setUploadError(err.response?.data?.error?.message || 'Upload failed');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function handleView(doc) {
    try {
      await viewDocument(doc.id);
    } catch {
      setListError('Failed to open document');
    }
  }

  async function handleDownload(doc) {
    try {
      await downloadDocument(doc.id, doc.filename);
    } catch {
      setListError('Failed to download document');
    }
  }

  async function handleDelete(doc) {
    if (!window.confirm(`Delete "${doc.title}"? This cannot be undone.`)) return;
    setDeletingId(doc.id);
    try {
      await deleteDocument(doc.id);
      fetchDocuments();
    } catch (err) {
      setListError(err.response?.data?.error?.message || 'Delete failed');
    } finally { setDeletingId(null); }
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="page-title">Documents</h1>
          <p className="page-subtitle">Store and access SOPs, manuals, and policy documents — PDF, Word, Excel, PowerPoint.</p>
        </div>

        <div className="card">
          <h2 className="font-semibold text-gray-900 mb-3">Upload Document</h2>
          {uploadError && <div className="text-red-600 text-sm mb-3 bg-red-50 border border-red-200 rounded p-3">{uploadError}</div>}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
            <div>
              <label className="form-label">Title (optional)</label>
              <input className="form-input" placeholder="e.g. Scrap Handling SOP" value={title} onChange={e => setTitle(e.target.value)} />
            </div>
            <div>
              <label className="form-label">Category (optional)</label>
              <input className="form-input" placeholder="e.g. SOP, Policy, Manual" value={category} onChange={e => setCategory(e.target.value)} />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt"
              onChange={handleUpload}
              disabled={uploading}
              className="block text-sm text-gray-600 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-brand-primary file:text-white hover:file:bg-teal-700 file:cursor-pointer"
            />
            {uploading && <span className="text-sm text-gray-500">Uploading…</span>}
          </div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900">All Documents ({total})</h2>
            <input
              className="form-input w-64 text-sm"
              placeholder="Search title or filename…"
              value={search}
              onChange={e => { setPage(1); setSearch(e.target.value); }}
            />
          </div>
          {listError && <ErrorAlert message={listError} onRetry={fetchDocuments} />}
          {loading ? <LoadingSpinner /> : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr>
                    {['Title', 'Category', 'Filename', 'Size', 'Uploaded By', 'Uploaded At'].map(h => <th key={h} className="table-header">{h}</th>)}
                    <th className="table-header text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {documents.map((doc, i) => (
                    <tr key={doc.id} className={i % 2 === 1 ? 'bg-gray-50' : ''}>
                      <td className="table-cell font-medium">{doc.title}</td>
                      <td className="table-cell text-xs text-gray-600">{doc.category || '—'}</td>
                      <td className="table-cell text-xs text-gray-500">{doc.filename}</td>
                      <td className="table-cell text-xs text-gray-500">{fmtSize(doc.size_bytes)}</td>
                      <td className="table-cell">{doc.uploader?.name || '—'}</td>
                      <td className="table-cell text-xs text-gray-500">{formatDateTime(doc.created_at)}</td>
                      <td className="table-cell text-right space-x-3">
                        <button onClick={() => handleView(doc)} className="text-gray-600 hover:text-gray-900 text-xs font-medium">
                          View
                        </button>
                        <button onClick={() => handleDownload(doc)} className="text-brand-primary hover:text-teal-800 text-xs font-medium">
                          Download
                        </button>
                        {isAdmin && (
                          <button
                            onClick={() => handleDelete(doc)}
                            disabled={deletingId === doc.id}
                            className="text-red-600 hover:text-red-800 text-xs font-medium disabled:opacity-50"
                          >
                            {deletingId === doc.id ? 'Deleting…' : 'Delete'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {!documents.length && <tr><td colSpan={7} className="table-cell text-center text-gray-400 py-8">No documents uploaded yet</td></tr>}
                </tbody>
              </table>
            </div>
          )}
          <Pagination page={page} pages={pages} onPage={setPage} />
        </div>
      </div>
    </Layout>
  );
}
