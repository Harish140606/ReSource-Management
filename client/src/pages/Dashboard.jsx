import { useMemo } from 'react';
import dayjs from 'dayjs';
import Layout from '../components/Layout.jsx';
import MetricCard from '../components/MetricCard.jsx';
import WasteBarChart from '../components/WasteBarChart.jsx';
import MaterialBarChart from '../components/MaterialBarChart.jsx';
import TrendChart from '../components/TrendChart.jsx';
import DonutChart from '../components/DonutChart.jsx';
import { useSummary, useTrends, useCircularity, useLedgerData } from '../hooks/useDashboard.js';
import { usePersistedState } from '../hooks/usePersistedState.js';
import { fmtNum, fmtKgShort } from '../utils/formatters.js';
import { today, weekAgo } from '../utils/dateHelpers.js';
import MaterialSelect from '../components/MaterialSelect.jsx';
import { resolveCategories, materialLabel, GROUP_PREFIX } from '../constants/wasteCategories.js';
import { useReferenceData, buildSubgroups, categoryCodesFor } from '../hooks/useReferenceData.js';

const TREND_RANGES = [
  { label: '30 Days',  shortLabel: '30D', days: 30 },
  { label: '3 Months', shortLabel: '3M',  days: 90 },
  { label: '6 Months', shortLabel: '6M',  days: 180 },
  { label: '1 Year',   shortLabel: '1Y',  days: 365 },
];

export default function Dashboard() {
  const { data: summary, loading: sumLoading } = useSummary();
  const { data: allCategories } = useReferenceData('WASTE_CATEGORY');
  const generalSubgroups  = useMemo(() => buildSubgroups(allCategories, 'SOFT', 'GENERAL'),   [allCategories]);
  const hazardousCodes    = useMemo(() => categoryCodesFor(allCategories, 'SOFT', 'HAZARDOUS'), [allCategories]);
  const ewasteCodes       = useMemo(() => categoryCodesFor(allCategories, 'SOFT', 'EWASTE'),    [allCategories]);
  const [material, setMaterial] = usePersistedState('dash_material', '');

  const [trendDays, setTrendDays] = usePersistedState('dash_trendDays', 30);
  const [trendDateFrom, setTrendDateFrom] = usePersistedState('dash_trendDateFrom', '');
  const [trendDateTo, setTrendDateTo] = usePersistedState('dash_trendDateTo', '');
  const trendCustomRange = trendDateFrom && trendDateTo ? { date_from: trendDateFrom, date_to: trendDateTo } : null;
  const { data: trends, loading: trendLoading } = useTrends(trendDays, material, generalSubgroups, trendCustomRange);
  const trendRange = TREND_RANGES.find(r => r.days === trendDays) ?? TREND_RANGES[0];

  const [circDateFrom, setCircDateFrom] = usePersistedState('dash_circDateFrom', '');
  const [circDateTo, setCircDateTo] = usePersistedState('dash_circDateTo', '');
  const circCustomRange = circDateFrom && circDateTo ? { date_from: circDateFrom, date_to: circDateTo } : undefined;
  const { data: circularity, loading: circLoading } = useCircularity(circCustomRange);

  const [dateFrom, setDateFrom] = usePersistedState('dash_dateFrom', weekAgo());
  const [dateTo, setDateTo] = usePersistedState('dash_dateTo', today());
  const [source, setSource] = usePersistedState('dash_source', 'ALL');

  const { data: ledger, loading: ledgerLoading } = useLedgerData({
    date_from: dateFrom,
    date_to: dateTo,
    source: source === 'ALL' ? undefined : source,
  });

  const resolvedCategories = useMemo(() => resolveCategories(material, generalSubgroups), [material, generalSubgroups]);
  const matLabel = materialLabel(material);

  // Daily BAT/SOFT breakdown for the chosen material/group, derived from raw ledger rows.
  // Also carries `leftover` — the stock of that material still on hand at the end of
  // each day (summed closing_stock across BAT+SOFT), so each bar can show what's left.
  const materialChartData = useMemo(() => {
    if (!material || !ledger?.raw) return [];
    const byDate = {};
    ledger.raw
      .filter(l => resolvedCategories.includes(l.category))
      .forEach(l => {
        const d = dayjs(l.date).format('YYYY-MM-DD');
        if (!byDate[d]) byDate[d] = { date: d, BAT: 0, SOFT: 0, leftover: 0 };
        byDate[d][l.source] = (byDate[d][l.source] || 0) + Number(l.waste_for_day);
        byDate[d].leftover += Number(l.closing_stock ?? 0);
      });
    return Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date));
  }, [material, ledger, resolvedCategories]);

  // Leftover stock per category as of the latest date present in the selected range
  // (sums closing_stock across sources for that category's most recent ledger date).
  const leftoverByCategory = useMemo(() => {
    if (!ledger?.raw) return {};
    const byCat = {};
    ledger.raw.forEach(l => {
      const d = dayjs(l.date).format('YYYY-MM-DD');
      const entry = byCat[l.category];
      if (!entry || d > entry.maxDate) {
        byCat[l.category] = { maxDate: d, total: Number(l.closing_stock ?? 0) };
      } else if (d === entry.maxDate) {
        entry.total += Number(l.closing_stock ?? 0);
      }
    });
    const result = {};
    Object.entries(byCat).forEach(([cat, v]) => { result[cat] = v.total; });
    return result;
  }, [ledger]);

  // BAT vs SOFT totals for the chosen material/group across the selected date range, for the donut
  const materialSourceSplit = useMemo(() => {
    if (!material || !ledger?.raw) return null;
    const totals = { BAT: 0, SOFT: 0 };
    ledger.raw
      .filter(l => resolvedCategories.includes(l.category))
      .forEach(l => { totals[l.source] = (totals[l.source] || 0) + Number(l.waste_for_day); });
    return totals;
  }, [material, ledger, resolvedCategories]);

  // No filter: aggregate by_category into sub-group totals for the top-level view
  const subgroupChartData = useMemo(() => {
    if (!ledger?.by_category) return [];
    const rows = ledger.by_category;
    const result = [];

    const leftoverFor = (cats) => cats.reduce((s, c) => s + (leftoverByCategory[c] || 0), 0);

    for (const [group, cats] of Object.entries(generalSubgroups)) {
      const matched = rows.filter(r => cats.includes(r.category));
      const BAT  = matched.reduce((s, r) => s + Number(r.BAT  || 0), 0);
      const SOFT = matched.reduce((s, r) => s + Number(r.SOFT || 0), 0);
      if (BAT > 0 || SOFT > 0) result.push({ category: group, BAT, SOFT, leftover: leftoverFor(cats) });
    }

    const hazMatched = rows.filter(r => hazardousCodes.includes(r.category));
    const hazBAT  = hazMatched.reduce((s, r) => s + Number(r.BAT  || 0), 0);
    const hazSOFT = hazMatched.reduce((s, r) => s + Number(r.SOFT || 0), 0);
    if (hazBAT > 0 || hazSOFT > 0) result.push({ category: 'Hazardous', BAT: hazBAT, SOFT: hazSOFT, leftover: leftoverFor(hazardousCodes) });

    const ewMatched = rows.filter(r => ewasteCodes.includes(r.category));
    const ewBAT  = ewMatched.reduce((s, r) => s + Number(r.BAT  || 0), 0);
    const ewSOFT = ewMatched.reduce((s, r) => s + Number(r.SOFT || 0), 0);
    if (ewBAT > 0 || ewSOFT > 0) result.push({ category: 'E-Waste', BAT: ewBAT, SOFT: ewSOFT, leftover: leftoverFor(ewasteCodes) });

    return result;
  }, [ledger, generalSubgroups, hazardousCodes, ewasteCodes, leftoverByCategory]);

  // Group selected: show individual categories within that group (per-category bars, not timeline)
  const groupCategoryData = useMemo(() => {
    if (!material?.startsWith(GROUP_PREFIX) || !ledger?.by_category) return [];
    return ledger.by_category
      .filter(r => resolvedCategories.includes(r.category))
      .map(r => ({ ...r, leftover: leftoverByCategory[r.category] || 0 }));
  }, [material, ledger, resolvedCategories, leftoverByCategory]);

  const isGroup = material.startsWith(GROUP_PREFIX);

  return (
    <Layout>
      <div className="space-y-4 md:space-y-6 max-w-screen-xl mx-auto">

        {/* Page heading */}
        <div>
          <h1 className="section-title">Dashboard</h1>
          <p className="section-subtitle hidden sm:block">Real-time resource overview · Manufacturing</p>
        </div>

        {/* Metric cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3 sm:gap-4">
          <MetricCard
            title="Total Waste Today"
            value={fmtNum(summary?.today_total_kg ?? 0)}
            unit="kg"
            accent="blue"
            loading={sumLoading}
            icon="⚖️"
            subtitle="Across all categories"
          />
          <MetricCard
            title="This Week"
            value={fmtNum(summary?.week_total_kg ?? 0)}
            unit="kg"
            accent="teal"
            loading={sumLoading}
            icon="📅"
            subtitle="Last 7 days total"
          />
          <MetricCard
            title="Scrap Left in Factory"
            value={fmtNum(summary?.stock_remaining_kg ?? 0)}
            unit="kg"
            accent="purple"
            loading={sumLoading}
            icon="🏭"
            subtitle="Current stock on hand"
          />
          <MetricCard
            title="Pending Approvals"
            value={summary?.pending_approvals ?? 0}
            accent="orange"
            loading={sumLoading}
            icon="⏳"
            subtitle="Awaiting action"
          />
          <MetricCard
            title="Completed Declarations"
            value={summary?.completed_declarations ?? 0}
            accent="green"
            loading={sumLoading}
            icon="✅"
            subtitle="Fully processed"
          />
        </div>

        {/* Bar chart */}
        <div className="card">
          <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-3 mb-4 sm:mb-5">
            <div>
              <h2 className="font-semibold text-gray-900">
                {!material
                  ? 'Waste by Sub-division'
                  : isGroup
                    ? `${matLabel} — by Category`
                    : `Material Trend — ${matLabel}`}
              </h2>
              <p className="text-xs text-brand-muted mt-0.5">
                {!material
                  ? 'BAT vs SOFT — grouped by sub-division'
                  : isGroup
                    ? `Individual categories within "${matLabel}"`
                    : `Daily BAT vs SOFT generation for "${matLabel}"`}
              </p>
            </div>
            <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
              <div className="flex items-center gap-1.5">
                <input
                  type="date" className="form-input text-xs py-1.5 w-[130px] sm:w-auto"
                  value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                />
                <span className="text-gray-400 text-xs">to</span>
                <input
                  type="date" className="form-input text-xs py-1.5 w-[130px] sm:w-auto"
                  value={dateTo} onChange={e => setDateTo(e.target.value)}
                />
              </div>
              <select
                className="form-select w-auto text-xs py-1.5"
                value={source} onChange={e => setSource(e.target.value)}
              >
                <option value="ALL">All Sources</option>
                <option value="BAT">BAT only</option>
                <option value="SOFT">SOFT only</option>
              </select>
              <MaterialSelect value={material} onChange={setMaterial} />
              {material && (
                <button onClick={() => setMaterial('')} className="btn-secondary text-xs py-1.5">✕ Clear</button>
              )}
            </div>
          </div>
          {!material
            ? <WasteBarChart data={subgroupChartData} loading={ledgerLoading} />
            : isGroup
              ? <WasteBarChart data={groupCategoryData} loading={ledgerLoading} />
              : <MaterialBarChart data={materialChartData} loading={ledgerLoading} materialName={matLabel} />}
        </div>

        {/* Trend + Donut */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-3 sm:gap-4">
          <div className="card lg:col-span-3">
            <div className="flex flex-wrap items-start justify-between gap-3 mb-1">
              <div>
                <h2 className="font-semibold text-gray-900">
                  {trendCustomRange ? 'Custom Range' : trendRange.label} Trend{material ? ` — ${matLabel}` : ''}
                </h2>
                <p className="text-xs text-brand-muted mt-0.5">
                  {material ? `Daily BAT vs SOFT generation for "${matLabel}"` : 'Daily waste generation — BAT vs SOFT'}
                </p>
              </div>
              <div className="inline-flex items-center gap-1 bg-gray-100 rounded-lg p-1">
                {TREND_RANGES.map(r => (
                  <button
                    key={r.days}
                    onClick={() => { setTrendDays(r.days); setTrendDateFrom(''); setTrendDateTo(''); }}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                      !trendCustomRange && trendDays === r.days ? 'bg-white text-brand-primary shadow-sm' : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {r.shortLabel}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-1.5">
                <input
                  type="date" className="form-input text-xs py-1.5 w-[130px] sm:w-auto"
                  value={trendDateFrom} onChange={e => setTrendDateFrom(e.target.value)}
                />
                <span className="text-gray-400 text-xs">to</span>
                <input
                  type="date" className="form-input text-xs py-1.5 w-[130px] sm:w-auto"
                  value={trendDateTo} onChange={e => setTrendDateTo(e.target.value)}
                />
                {trendCustomRange && (
                  <button onClick={() => { setTrendDateFrom(''); setTrendDateTo(''); }} className="btn-secondary text-xs py-1.5">✕ Clear</button>
                )}
              </div>
              <MaterialSelect value={material} onChange={setMaterial} />
            </div>
            <TrendChart data={trends} loading={trendLoading} />
          </div>
          <div className="card lg:col-span-2">
            <div className="flex flex-wrap items-start justify-between gap-3 mb-1">
              <div>
                <h2 className="font-semibold text-gray-900">{material ? `Source Split — ${matLabel}` : 'By Waste Type'}</h2>
                <p className="text-xs text-brand-muted mt-0.5">
                  {material ? `${dateFrom} to ${dateTo}` : circCustomRange ? `${circDateFrom} to ${circDateTo}` : 'Distribution this week'}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-1.5">
                <input
                  type="date" className="form-input text-xs py-1.5 w-[130px] sm:w-auto"
                  value={circDateFrom} onChange={e => setCircDateFrom(e.target.value)}
                />
                <span className="text-gray-400 text-xs">to</span>
                <input
                  type="date" className="form-input text-xs py-1.5 w-[130px] sm:w-auto"
                  value={circDateTo} onChange={e => setCircDateTo(e.target.value)}
                />
                {circCustomRange && (
                  <button onClick={() => { setCircDateFrom(''); setCircDateTo(''); }} className="btn-secondary text-xs py-1.5">✕ Clear</button>
                )}
              </div>
              <MaterialSelect value={material} onChange={setMaterial} />
            </div>
            <DonutChart
              data={circularity?.by_type}
              byCategory={circularity?.by_function}
              loading={circLoading || (!!material && ledgerLoading)}
              materialView={material ? { label: matLabel, totals: materialSourceSplit } : null}
            />
          </div>
        </div>

        {/* Circularity table */}
        <div className="card">
          <div className="mb-4">
            <h2 className="font-semibold text-gray-900">{circCustomRange ? 'Circularity Matrix' : 'Weekly Circularity Matrix'}</h2>
            <p className="text-xs text-brand-muted mt-0.5">
              Waste per category × type {circCustomRange ? `(${circDateFrom} to ${circDateTo})` : 'this week'}
            </p>
          </div>
          {circLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => <div key={i} className="h-10 bg-gray-100 rounded-lg animate-pulse" />)}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="min-w-full">
                <thead>
                  <tr>
                    <th className="table-header rounded-tl-lg">Category</th>
                    <th className="table-header">General (kg)</th>
                    <th className="table-header">Hazardous (kg)</th>
                    <th className="table-header">E-Waste (kg)</th>
                    <th className="table-header rounded-tr-lg">Left in Factory</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const rows = circularity?.by_function || [];
                    const maxLeftover = Math.max(1, ...rows.map(r => Number(r.leftover ?? 0)));
                    return rows.map((row, i) => (
                      <tr key={row.category} className={i % 2 === 1 ? 'bg-gray-50/70' : 'bg-white'}>
                        <td className="table-cell font-medium text-gray-900">{row.category}</td>
                        <td className="table-cell text-brand-primary font-medium">{fmtNum(row.GENERAL ?? 0)}</td>
                        <td className="table-cell text-orange-600 font-medium">{fmtNum(row.HAZARDOUS ?? 0)}</td>
                        <td className="table-cell text-brand-cyan font-medium">{fmtNum(row.EWASTE ?? 0)}</td>
                        <td className="table-cell">
                          <div className="flex items-center gap-2 min-w-[140px]">
                            <div className="flex-1 h-2 rounded-full bg-purple-100 overflow-hidden">
                              <div
                                className="h-full bg-purple-500 rounded-full"
                                style={{ width: `${(Number(row.leftover ?? 0) / maxLeftover) * 100}%` }}
                              />
                            </div>
                            <span className="text-purple-700 font-medium text-xs whitespace-nowrap">
                              {fmtKgShort(row.leftover ?? 0)}
                            </span>
                          </div>
                        </td>
                      </tr>
                    ));
                  })()}
                  {!circularity?.by_function?.length && (
                    <tr>
                      <td colSpan={5} className="table-cell text-center text-gray-400 py-8">
                        No waste data recorded {circCustomRange ? 'in the selected range' : 'this week'} yet
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
