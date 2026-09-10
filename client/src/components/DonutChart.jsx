import { useState } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';

const COLORS = {
  GENERAL:   '#00838F',
  HAZARDOUS: '#F97316',
  EWASTE:    '#7CB342',
};

const LABELS = {
  GENERAL: 'General',
  HAZARDOUS: 'Hazardous',
  EWASTE: 'E-Waste',
};

const DRILL_PALETTE = [
  '#00838F', '#00A7B5', '#7CB342', '#F97316', '#F4B400',
  '#A855F7', '#EC4899', '#14B8A6', '#6366F1', '#84CC16',
  '#EF4444', '#0EA5E9', '#D946EF', '#F59E0B',
];

const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0];
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-md px-4 py-3 text-sm max-w-[230px]">
      <div className="flex items-center gap-2">
        <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: d.payload.fill }} />
        <span className="font-semibold text-gray-900 leading-tight">{LABELS[d.name] || d.name}</span>
      </div>
      <p className="text-gray-600 text-xs mt-1">{Number(d.value).toFixed(2)} kg · {(d.payload.percent * 100).toFixed(1)}%</p>
    </div>
  );
};

const renderCustomLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }) => {
  if (percent < 0.06) return null;
  const RADIAN = Math.PI / 180;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={700}>
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
};

/**
 * `byCategory` is the circularity matrix (one row per material category, with
 * GENERAL/HAZARDOUS/EWASTE kg columns) — used to build the drill-down view
 * when a top-level waste-type slice is clicked.
 */
export default function DonutChart({ data, byCategory = [], loading, materialView }) {
  const [selectedType, setSelectedType] = useState(null);

  if (loading) return <div className="h-56 bg-gray-50 rounded-xl animate-pulse" />;

  // Material-filtered mode: show a simple BAT vs SOFT split for the chosen material
  if (materialView) {
    const { label, totals } = materialView;
    const matEntries = [
      { name: 'BAT',  value: Number(totals?.BAT  || 0), fill: '#00838F' },
      { name: 'SOFT', value: Number(totals?.SOFT || 0), fill: '#7CB342' },
    ].filter(e => e.value > 0);

    if (!matEntries.length) return (
      <div className="h-56 flex items-center justify-center text-gray-400 bg-gray-50 rounded-xl text-sm text-center px-4">
        No waste recorded for "{label}" in the selected range
      </div>
    );

    return (
      <div>
        <p className="text-[11px] text-gray-400 text-center mb-1">BAT vs SOFT split for "{label}"</p>
        <div key={`material-${label}`} className="donut-zoom-enter">
          <ResponsiveContainer width="100%" height={224}>
            <PieChart>
              <Pie
                data={matEntries}
                cx="50%" cy="50%"
                innerRadius={58} outerRadius={88}
                dataKey="value"
                labelLine={false}
                label={renderCustomLabel}
                isAnimationActive
                animationDuration={550}
                animationEasing="ease-out"
              >
                {matEntries.map((e, i) => <Cell key={i} fill={e.fill} stroke="white" strokeWidth={2} />)}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
              <Legend formatter={(v) => <span style={{ color: '#374151', fontSize: 12, fontWeight: 500 }}>{v}</span>} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const topEntries = Object.entries(data)
    .map(([name, value]) => ({ name, value: Number(value), fill: COLORS[name] || '#6B7280' }))
    .filter(e => e.value > 0);

  const drillEntries = selectedType
    ? byCategory
        .filter(row => Number(row[selectedType]) > 0)
        .map((row, i) => ({ name: row.category, value: Number(row[selectedType]), fill: DRILL_PALETTE[i % DRILL_PALETTE.length] }))
    : [];

  const showingDrill = !!selectedType && drillEntries.length > 0;
  const entries = showingDrill ? drillEntries : topEntries;

  if (!entries.length) return (
    <div className="h-56 flex items-center justify-center text-gray-400 bg-gray-50 rounded-xl text-sm">
      No waste recorded this week
    </div>
  );

  function handleSliceClick(entry) {
    if (showingDrill) return;
    if (COLORS[entry.name]) setSelectedType(entry.name);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1 min-h-[22px]">
        {showingDrill ? (
          <button
            onClick={() => setSelectedType(null)}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-primary hover:text-brand-cyan transition-colors"
          >
            ← Back to overview
          </button>
        ) : <span />}
        <p className="text-[11px] text-gray-400 text-right">
          {showingDrill ? `Materials within ${LABELS[selectedType] || selectedType} waste` : 'Click a slice to view its materials'}
        </p>
      </div>
      <div key={showingDrill ? `drill-${selectedType}` : 'top'} className="donut-zoom-enter">
        <ResponsiveContainer width="100%" height={224}>
          <PieChart>
            <Pie
              data={entries}
              cx="50%" cy="50%"
              innerRadius={58} outerRadius={88}
              dataKey="value"
              labelLine={false}
              label={renderCustomLabel}
              onClick={handleSliceClick}
              isAnimationActive
              animationDuration={550}
              animationEasing="ease-out"
            >
              {entries.map((e, i) => (
                <Cell
                  key={i}
                  fill={e.fill}
                  stroke="white"
                  strokeWidth={2}
                  style={{ cursor: showingDrill ? 'default' : 'pointer' }}
                />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
            <Legend
              formatter={(v) => <span style={{ color: '#374151', fontSize: 12, fontWeight: 500 }}>{LABELS[v] || v}</span>}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
