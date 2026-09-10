import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LabelList,
} from 'recharts';
import { fmtKgShort } from '../utils/formatters.js';

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-md px-4 py-3 text-sm">
      <p className="font-semibold text-gray-800 mb-2">{label}</p>
      {payload.map(p => (
        <div key={p.name} className="flex items-center gap-2 text-xs">
          <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: p.fill }} />
          <span className="text-gray-600">{p.name}:</span>
          <span className="font-semibold text-gray-900">{fmtKgShort(p.value)}</span>
        </div>
      ))}
    </div>
  );
};

const renderValueLabel = (color) => (props) => {
  const { x, y, width, height, value } = props;
  if (!value) return null;
  return (
    <text x={x + width + 6} y={y + height / 2} dy={4} fontSize={10} fontWeight={600} fill={color}>
      {fmtKgShort(value)}
    </text>
  );
};

export default function WasteBarChart({ data = [], loading }) {
  if (loading) return (
    <div className="h-72 bg-gray-50 rounded-xl animate-pulse flex items-center justify-center text-gray-400 text-sm">
      Loading chart…
    </div>
  );
  if (!data.length) return (
    <div className="h-72 flex flex-col items-center justify-center text-gray-400 bg-gray-50 rounded-xl">
      <svg className="w-10 h-10 mb-2 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
      <span className="text-sm">No data for selected range</span>
    </div>
  );

  // Dynamic height: 64px per category row (3 lanes: BAT/SOFT/Leftover), min 300
  const rowHeight = 64;
  const chartHeight = Math.max(300, data.length * rowHeight);

  return (
    <ResponsiveContainer width="100%" height={chartHeight}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 4, right: 96, left: 8, bottom: 4 }}
        barCategoryGap="30%"
        barGap={3}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" horizontal={false} />
        <XAxis
          type="number"
          tickFormatter={fmtKgShort}
          tick={{ fontSize: 11, fill: '#6B7A99' }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="category"
          width={160}
          tick={{ fontSize: 11, fill: '#374151' }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: '#E8F5F3' }} />
        <Legend
          wrapperStyle={{ paddingTop: 16, fontSize: 12 }}
          formatter={(v) => <span style={{ color: '#374151', fontWeight: 500 }}>{v}</span>}
        />
        {/* Same shared scale/axis as BAT & SOFT so recharts lanes all three bars
            side by side per category instead of letting two axes overlap. */}
        <Bar dataKey="BAT"  name="BAT Production"  fill="#00838F" radius={[0, 4, 4, 0]} maxBarSize={14}>
          <LabelList dataKey="BAT" content={renderValueLabel('#00838F')} />
        </Bar>
        <Bar dataKey="SOFT" name="Soft Production"  fill="#7CB342" radius={[0, 4, 4, 0]} maxBarSize={14}>
          <LabelList dataKey="SOFT" content={renderValueLabel('#7CB342')} />
        </Bar>
        <Bar dataKey="leftover" name="Left in Factory" fill="#7C3AED" fillOpacity={0.55} radius={[0, 4, 4, 0]} maxBarSize={14}>
          <LabelList dataKey="leftover" content={renderValueLabel('#7C3AED')} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
