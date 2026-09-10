import { useState, useEffect } from 'react';
import * as svc from '../services/dashboard.js';
import { resolveCategories } from '../constants/wasteCategories.js';

function useFetch(fn, deps = []) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fn()
      .then(res => { if (!cancelled) setData(res); })
      .catch(err => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, deps);

  return { data, loading, error };
}

export const useSummary = () => useFetch(svc.getSummary);

// subgroups passed in from Dashboard which has access to the dynamic data.
// `range` ({date_from, date_to}) overrides `days` when both endpoints are set.
export const useTrends = (days = 30, material, subgroups, range) => {
  const cats = resolveCategories(material, subgroups);
  const params = range?.date_from && range?.date_to
    ? { date_from: range.date_from, date_to: range.date_to }
    : { days };
  if (cats.length === 1) params.category = cats[0];
  else if (cats.length > 1) params.categories = cats;
  return useFetch(() => svc.getTrends(params), [days, material, range?.date_from, range?.date_to]);
};

export const useCircularity = (range) =>
  useFetch(() => svc.getCircularity(range), [range?.date_from, range?.date_to]);
export const useLedgerData = (params) => useFetch(() => svc.getLedger(params), [JSON.stringify(params)]);
