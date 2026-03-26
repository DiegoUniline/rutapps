import { todayLocal } from '@/lib/utils';
import { useState, useCallback } from 'react';

const STORAGE_KEY = 'ruta-date-filter';

interface StoredFilter {
  desde: string;
  hasta: string;
  storedDate: string; // date when filter was saved
}

function todayStr(): string {
  return todayLocal();
}

function loadFilter(): { desde: string; hasta: string } {
  const today = todayStr();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed: StoredFilter = JSON.parse(raw);
      if (parsed.storedDate === today) {
        return { desde: parsed.desde, hasta: parsed.hasta };
      }
    }
  } catch { /* ignore */ }
  return { desde: today, hasta: today };
}

function saveFilter(desde: string, hasta: string) {
  const stored: StoredFilter = { desde, hasta, storedDate: todayStr() };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
}

export function useDateFilter() {
  const initial = loadFilter();
  const [desde, setDesdeState] = useState(initial.desde);
  const [hasta, setHastaState] = useState(initial.hasta);

  const setDesde = useCallback((v: string) => {
    setDesdeState(v);
    saveFilter(v, hasta);
  }, [hasta]);

  const setHasta = useCallback((v: string) => {
    setHastaState(v);
    saveFilter(desde, v);
  }, [desde]);

  const filterByDate = useCallback(<T extends { fecha?: string; created_at?: string }>(
    items: T[],
    dateField: 'fecha' | 'created_at' = 'fecha'
  ): T[] => {
    return items.filter(item => {
      const d = dateField === 'fecha'
        ? (item.fecha ?? '')
        : (item.created_at?.slice(0, 10) ?? '');
      return d >= desde && d <= hasta;
    });
  }, [desde, hasta]);

  return { desde, hasta, setDesde, setHasta, filterByDate };
}
