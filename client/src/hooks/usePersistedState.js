import { useState, useEffect } from 'react';

// Like useState, but backed by sessionStorage so the value survives navigating
// away to another page and back, without persisting forever across browser sessions.
export function usePersistedState(key, initialValue) {
  const [state, setState] = useState(() => {
    try {
      const stored = sessionStorage.getItem(key);
      return stored !== null ? JSON.parse(stored) : initialValue;
    } catch {
      return initialValue;
    }
  });

  useEffect(() => {
    try {
      sessionStorage.setItem(key, JSON.stringify(state));
    } catch {
      // sessionStorage unavailable (private mode, quota) — fall back to in-memory only
    }
  }, [key, state]);

  return [state, setState];
}
