export default function MetricCard({ title, value, unit = '', subtitle, accent = 'blue', loading, icon }) {
  const accents = {
    blue:   { bar: 'bg-brand-primary',  text: 'text-brand-primary',  bg: 'bg-brand-light' },
    green:  { bar: 'bg-brand-lime', text: 'text-brand-lime', bg: 'bg-green-50' },
    teal:   { bar: 'bg-brand-cyan',  text: 'text-brand-cyan',  bg: 'bg-cyan-50' },
    orange: { bar: 'bg-orange-500',  text: 'text-orange-600',  bg: 'bg-orange-50' },
    purple: { bar: 'bg-purple-500',  text: 'text-purple-600',  bg: 'bg-purple-50' },
  };
  const a = accents[accent] || accents.blue;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className={`h-1 w-full ${a.bar}`} />
      <div className="p-3 sm:p-5">
        <div className="flex items-start justify-between mb-2 sm:mb-3">
          <p className="text-[10px] sm:text-xs font-semibold text-gray-500 uppercase tracking-wider leading-tight pr-1">
            {title}
          </p>
          {icon && (
            <span className={`hidden sm:flex w-8 h-8 rounded-lg ${a.bg} ${a.text} items-center justify-center text-base flex-shrink-0`}>
              {icon}
            </span>
          )}
        </div>
        {loading ? (
          <div className="space-y-2">
            <div className="h-7 bg-gray-100 rounded-lg animate-pulse w-3/4" />
            <div className="h-3 bg-gray-100 rounded animate-pulse w-1/2" />
          </div>
        ) : (
          <>
            <p className="text-xl sm:text-3xl font-bold text-gray-900 tracking-tight">
              {value}
              {unit && <span className="text-xs sm:text-sm font-medium text-gray-500 ml-1">{unit}</span>}
            </p>
            {subtitle && <p className="text-[10px] sm:text-xs text-brand-muted mt-1 leading-tight">{subtitle}</p>}
          </>
        )}
      </div>
    </div>
  );
}
