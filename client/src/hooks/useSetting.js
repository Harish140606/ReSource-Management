import { useState, useEffect, useCallback } from 'react';
import { getSetting } from '../services/settings.js';

export function useSetting(key) {
  const [value, setValue] = useState(null);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(() => {
    setLoading(true);
    getSetting(key)
      .then(setValue)
      .catch(() => setValue(null))
      .finally(() => setLoading(false));
  }, [key]);

  useEffect(() => { refetch(); }, [refetch]);

  return { value, loading, refetch };
}
