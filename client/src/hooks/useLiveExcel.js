import { useState, useEffect } from 'react';
import * as svc from '../services/liveExcel.js';

export function useExportLog() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetch = async () => {
    setLoading(true);
    try {
      const result = await svc.getExportLog({ limit: 10 });
      setData(result);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to load export log');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetch(); }, []);

  return { data, loading, error, refetch: fetch };
}
