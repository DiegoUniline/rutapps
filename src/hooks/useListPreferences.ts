import { useState, useCallback } from 'react';

export interface ListFilter {
  key: string;
  value: string;
}

export interface ListPreferences {
  filters: Record<string, string>;
  groupBy: string;
}

const STORAGE_PREFIX = 'list_prefs_';

function load(key: string): ListPreferences {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { filters: {}, groupBy: '' };
}

function save(key: string, prefs: ListPreferences) {
  try {
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(prefs));
  } catch {}
}

export function useListPreferences(listKey: string) {
  const [prefs, setPrefs] = useState<ListPreferences>(() => load(listKey));

  const setFilter = useCallback((filterKey: string, value: string) => {
    setPrefs(prev => {
      const next = { ...prev, filters: { ...prev.filters, [filterKey]: value } };
      save(listKey, next);
      return next;
    });
  }, [listKey]);

  const setGroupBy = useCallback((groupBy: string) => {
    setPrefs(prev => {
      const next = { ...prev, groupBy };
      save(listKey, next);
      return next;
    });
  }, [listKey]);

  const clearFilters = useCallback(() => {
    setPrefs(prev => {
      const next = { ...prev, filters: {} };
      save(listKey, next);
      return next;
    });
  }, [listKey]);

  return {
    filters: prefs.filters,
    groupBy: prefs.groupBy,
    setFilter,
    setGroupBy,
    clearFilters,
  };
}

/** Generic client-side grouping utility */
export function groupData<T>(
  data: T[],
  groupBy: string,
  labelFn: (item: T, key: string) => string
): { label: string; items: T[] }[] {
  if (!groupBy) return [{ label: '', items: data }];

  const groups: Record<string, T[]> = {};
  for (const item of data) {
    const label = labelFn(item, groupBy);
    if (!groups[label]) groups[label] = [];
    groups[label].push(item);
  }

  return Object.entries(groups)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, items]) => ({ label: label || 'Sin asignar', items }));
}
