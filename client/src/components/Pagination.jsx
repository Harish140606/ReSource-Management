export default function Pagination({ page, pages, onPage }) {
  if (!pages || pages <= 1) return null;

  const btn =
    'px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-300 bg-white text-gray-700 ' +
    'shadow-sm hover:bg-gray-100 hover:text-gray-900 transition-colors ' +
    'disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white';

  return (
    <div className="flex items-center justify-between mt-4">
      <p className="text-sm text-white/70">Page {page} of {pages}</p>
      <div className="flex gap-2">
        <button onClick={() => onPage(page - 1)} disabled={page <= 1} className={btn}>
          ← Prev
        </button>
        <button onClick={() => onPage(page + 1)} disabled={page >= pages} className={btn}>
          Next →
        </button>
      </div>
    </div>
  );
}
