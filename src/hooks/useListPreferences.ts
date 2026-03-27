import { useState, useCallback } from 'react';

export interface ListPreferences {
  filters: Record<string, string[]>;
  groupBy: string;
  /** Multi-level groupBy: [primary, secondary, tertiary] */
  groupByLevels?: string[];
}

const STORAGE_PREFIX = 'list_prefs_v2_';

function load(key: string): ListPreferences {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { filters: {}, groupBy: '', groupByLevels: [] };
}

function save(key: string, prefs: ListPreferences) {
  try {
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(prefs));
  } catch {}
}

export function useListPreferences(listKey: string) {
  const [prefs, setPrefs] = useState<ListPreferences>(() => load(listKey));

  const setFilter = useCallback((filterKey: string, values: string[]) => {
    setPrefs(prev => {
      const next = { ...prev, filters: { ...prev.filters, [filterKey]: values } };
      save(listKey, next);
      return next;
    });
  }, [listKey]);

  const toggleFilterValue = useCallback((filterKey: string, value: string) => {
    setPrefs(prev => {
      const current = prev.filters[filterKey] ?? [];
      const next = current.includes(value)
        ? current.filter(v => v !== value)
        : [...current, value];
      const updated = { ...prev, filters: { ...prev.filters, [filterKey]: next } };
      save(listKey, updated);
      return updated;
    });
  }, [listKey]);

  const setGroupBy = useCallback((groupBy: string) => {
    setPrefs(prev => {
      const next = { ...prev, groupBy, groupByLevels: groupBy ? [groupBy] : [] };
      save(listKey, next);
      return next;
    });
  }, [listKey]);

  /** Set multi-level groupBy: level 0=primary, 1=secondary, 2=tertiary */
  const setGroupByLevel = useCallback((level: number, value: string) => {
    setPrefs(prev => {
      const levels = [...(prev.groupByLevels ?? [])];
      if (value) {
        levels[level] = value;
        // Trim levels after this one if changing
        levels.length = level + 1;
      } else {
        // Clear this level and all after
        levels.length = level;
      }
      const next = { ...prev, groupBy: levels[0] ?? '', groupByLevels: levels };
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
    groupByLevels: prefs.groupByLevels ?? (prefs.groupBy ? [prefs.groupBy] : []),
    setFilter,
    toggleFilterValue,
    setGroupBy,
    setGroupByLevel,
    clearFilters,
  };
}

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

/** Extract date group label based on format */
export function dateGroupLabel(fecha: string | null | undefined, format: 'fecha' | 'fecha_anio_mes' | 'fecha_anio' | 'fecha_mes'): string {
  if (!fecha) return 'Sin fecha';
  // fecha is typically YYYY-MM-DD or date string
  const d = new Date(fecha + (fecha.length === 10 ? 'T12:00:00' : ''));
  if (isNaN(d.getTime())) return 'Sin fecha';
  const y = d.getFullYear();
  const m = d.getMonth();
  const day = d.getDate();
  switch (format) {
    case 'fecha_anio_mes': return `${y} - ${MESES[m]}`;
    case 'fecha_anio': return `${y}`;
    case 'fecha_mes': return MESES[m];
    case 'fecha':
    default: return `${day.toString().padStart(2, '0')}/${(m + 1).toString().padStart(2, '0')}/${y}`;
  }
}

/** Generic client-side grouping utility with optional sub-grouping */
export interface GroupNode<T> {
  label: string;
  items: T[];
  subGroups?: GroupNode<T>[];
}

function buildGroups<T>(
  data: T[],
  keys: string[],
  labelFn: (item: T, key: string) => string,
): GroupNode<T>[] {
  if (keys.length === 0) return [{ label: '', items: data }];
  const [currentKey, ...restKeys] = keys;
  const buckets: Record<string, T[]> = {};
  for (const item of data) {
    const label = labelFn(item, currentKey);
    if (!buckets[label]) buckets[label] = [];
    buckets[label].push(item);
  }
  return Object.entries(buckets)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, items]) => {
      const node: GroupNode<T> = { label: label || 'Sin asignar', items };
      if (restKeys.length > 0) {
        node.subGroups = buildGroups(items, restKeys, labelFn);
      }
      return node;
    });
}

export function groupData<T>(
  data: T[],
  groupBy: string,
  labelFn: (item: T, key: string) => string,
  groupByLevels?: string[],
): GroupNode<T>[] {
  const keys = (groupByLevels && groupByLevels.length > 0) ? groupByLevels : (groupBy ? [groupBy] : []);
  if (keys.length === 0) return [{ label: '', items: data }];
  return buildGroups(data, keys, labelFn);
}
