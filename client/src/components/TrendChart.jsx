import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, Area, AreaChart,
} from 'recharts';
import dayjs from 'dayjs';
import { fmtKgShort } from '../utils/formatters.js';

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-md px-4 py-3 text-sm">
      <p className="font-semibold text-gray-700 mb-2 text-xs">{label}</p>
      {payload.map(p => (
        <div key={p.name} className="flex items-center gap-2 text-xs">
          <span className="w-2.5 h-2.5 rounded-sm" style={{ background: p.stroke }} />
          <span className="text-gray-600">{p.name}:</span>
          <span className="font-semibold text-gray-900">{fmtKgShort(p.value)}</span>
        </div>
      ))}
    </div>
  );
};

// Used instead of an LabelList: with up to 365 daily points, text on every
// bar/point would overlap. A dashed line on a secondary axis keeps the daily
// leftover-stock trend readable alongside the BAT/SOFT generation areas.

export default function TrendChart({ data = [], loading }) {
  if (loading) return (
    <div className="h-56 bg-gray-50 rounded-xl animate-pulse" />
  );
  if (!data.length) return (
    <div className="h-56 flex items-center justify-center text-gray-400 text-sm bg-gray-50 rounded-xl">
      No trend data available
    </div>
  );

  // Use a coarser date format and skip ticks once the range gets long, so labels stay readable
  const longRange = data.length > 60;
  const formatted = data.map(d => ({
    ...d,
    date: dayjs(d.date).format(longRange ? 'MMM YY' : 'DD MMM'),
  }));
  const tickInterval = Math.max(0, Math.ceil(data.length / 12) - 1);

  return (
    <ResponsiveContainer width="100%" height={224}>
      <AreaChart data={formatted} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
        <defs>
          <linearGradient id="batGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#00838F" stopOpacity={0.15} />
            <stop offset="95%" stopColor="#00838F" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="softGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#7CB342" stopOpacity={0.15} />
            <stop offset="95%" stopColor="#7CB342" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 10, fill: '#6B7A99' }}
          axisLine={false}
          tickLine={false}
          interval={tickInterval}
          minTickGap={24}
        />
        <YAxis yAxisId="left" tickFormatter={fmtKgShort} tick={{ fontSize: 11, fill: '#6B7A99' }} width={64} axisLine={false} tickLine={false} />
        <YAxis yAxisId="right" orientation="right" tickFormatter={fmtKgShort} tick={{ fontSize: 11, fill: '#7C3AED' }} width={64} axisLine={false} tickLine={false} />
        <Tooltip content={<CustomTooltip />} />
        <Legend wrapperStyle={{ fontSize: 12 }} formatter={(v) => <span style={{ color: '#374151', fontWeight: 500 }}>{v}</span>} />
        <Area yAxisId="left" type="monotone" dataKey="BAT" name="BAT" stroke="#00838F" strokeWidth={2} fill="url(#batGrad)" dot={false} activeDot={{ r: 4, fill: '#00838F' }} />
        <Area yAxisId="left" type="monotone" dataKey="SOFT" name="SOFT" stroke="#7CB342" strokeWidth={2} fill="url(#softGrad)" dot={false} activeDot={{ r: 4, fill: '#7CB342' }} />
        <Line yAxisId="right" type="monotone" dataKey="leftover" name="Left in Factory" stroke="#7C3AED" strokeWidth={2} strokeDasharray="4 3" dot={false} activeDot={{ r: 4, fill: '#7C3AED' }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
