export default function LoadingSpinner({ text = 'Loading…' }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-brand-muted">
      <div className="relative w-10 h-10">
        <div className="absolute inset-0 rounded-full border-2 border-gray-200" />
        <div className="absolute inset-0 rounded-full border-2 border-brand-primary border-t-transparent animate-spin" />
      </div>
      <span className="text-sm font-medium">{text}</span>
    </div>
  );
}
