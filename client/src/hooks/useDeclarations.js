import { useState, useEffect, useCallback } from 'react';
import * as svc from '../services/declarations.js';

export function useDeclarations(initialParams = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [params, setParams] = useState(initialParams);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await svc.getDeclarations(params);
      setData(result);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [JSON.stringify(params)]);

  useEffect(() => { fetch(); }, [fetch]);

  return { data, loading, error, refetch: fetch, setParams };
}

export function useDeclaration(id) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetch = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const result = await svc.getDeclaration(id);
      setData(result);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetch(); }, [fetch]);

  return { data, loading, error, refetch: fetch };
}
