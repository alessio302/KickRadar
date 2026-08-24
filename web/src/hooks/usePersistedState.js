import { useEffect, useState } from 'react';

// No user accounts in scope yet -- favorite club, quick filters, and theme
// preference are per-device only (localStorage), not synced anywhere.
export function usePersistedState(key, initialValue) {
  const [value, setValue] = useState(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw !== null ? JSON.parse(raw) : initialValue;
    } catch {
      return initialValue;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Storage unavailable (private mode, quota, etc.) -- state still
      // works for the current session, just won't persist.
    }
  }, [key, value]);

  return [value, setValue];
}
