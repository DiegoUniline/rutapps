import { useState, useCallback, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';

const PREFIX = 'col_prefs_v1_';

function load(key: string, defaults: Record<string, boolean>): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw) {
      const parsed = JSON.parse(raw);
      // Merge with defaults so newly added columns appear
      return { ...defaults, ...parsed };
    }
  } catch {}
  return { ...defaults };
}

function save(key: string, value: Record<string, boolean>) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {}
}

/**
 * Per-user column visibility preferences persisted in localStorage.
 * @param listKey unique key for the list (e.g. "ventas")
 * @param defaults default visibility map { columnKey: boolean }
 */
export function useColumnPreferences(listKey: string, defaults: Record<string, boolean>) {
  const { user } = useAuth();
  const userId = user?.id ?? 'anon';
  const fullKey = `${userId}_${listKey}`;

  const [visible, setVisible] = useState<Record<string, boolean>>(() => load(fullKey, defaults));

  // Reload when the user changes
  useEffect(() => {
    setVisible(load(fullKey, defaults));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullKey]);

  const toggleColumn = useCallback((key: string) => {
    setVisible(prev => {
      const next = { ...prev, [key]: !prev[key] };
      save(fullKey, next);
      return next;
    });
  }, [fullKey]);

  const setAll = useCallback((value: boolean) => {
    setVisible(prev => {
      const next: Record<string, boolean> = {};
      for (const k of Object.keys(prev)) next[k] = value;
      save(fullKey, next);
      return next;
    });
  }, [fullKey]);

  const reset = useCallback(() => {
    setVisible(defaults);
    save(fullKey, defaults);
  }, [fullKey, defaults]);

  const isVisible = useCallback((key: string) => visible[key] ?? false, [visible]);

  return { visible, isVisible, toggleColumn, setAll, reset };
}
