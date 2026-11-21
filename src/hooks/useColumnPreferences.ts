import { useState, useCallback, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';

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

// ── Orden de columnas (por usuario) ─────────────────────────────────────────
const ORDER_PREFIX = 'col_order_v1_';

/**
 * Orden efectivo: las claves guardadas que aún existen (en su orden), y al final
 * las columnas nuevas que no estaban en lo guardado (en su orden por omisión).
 * Ignora claves que ya no existen, duplicadas o que no son texto.
 */
export function mergeColumnOrder(saved: unknown, keys: string[]): string[] {
  const valid = new Set(keys);
  const seen = new Set<string>();
  const out: string[] = [];
  if (Array.isArray(saved)) {
    for (const k of saved) {
      if (typeof k === 'string' && valid.has(k) && !seen.has(k)) { out.push(k); seen.add(k); }
    }
  }
  for (const k of keys) if (!seen.has(k)) { out.push(k); seen.add(k); }
  return out;
}

/** Sube (delta < 0) o baja (delta > 0) una columna; en los extremos no cambia nada. */
export function moveColumnKey(order: string[], key: string, delta: number): string[] {
  const from = order.indexOf(key);
  if (from < 0) return order;
  const to = Math.max(0, Math.min(order.length - 1, from + delta));
  if (to === from) return order;
  const next = [...order];
  next.splice(from, 1);
  next.splice(to, 0, key);
  return next;
}

/** Mueve `fromKey` al lugar que ocupa `toKey` (arrastrar y soltar). */
export function moveColumnToKey(order: string[], fromKey: string, toKey: string): string[] {
  const from = order.indexOf(fromKey);
  const to = order.indexOf(toKey);
  if (from < 0 || to < 0 || from === to) return order;
  const next = [...order];
  next.splice(from, 1);
  next.splice(to, 0, fromKey);
  return next;
}

export function loadColumnOrder(key: string): string[] | null {
  try {
    const raw = localStorage.getItem(ORDER_PREFIX + key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.filter((k): k is string => typeof k === 'string');
    }
  } catch (e) {
    console.warn('[columnas] no se pudo leer el orden guardado', e);
  }
  return null;
}

export function saveColumnOrder(key: string, order: string[] | null) {
  try {
    if (order) localStorage.setItem(ORDER_PREFIX + key, JSON.stringify(order));
    else localStorage.removeItem(ORDER_PREFIX + key);
  } catch (e) {
    console.warn('[columnas] no se pudo guardar el orden', e);
  }
}

type RpcError = { message: string } | null;
// IMPORTANTE: `supabase.rpc` necesita su `this`; desestructurarlo rompe el cliente.
const callRpc = ((fn: string, args: Record<string, unknown>) =>
  (supabase as any).rpc(fn, args)) as (
  fn: string,
  args: Record<string, unknown>,
) => PromiseLike<{ error: RpcError }>;

/**
 * Per-user column visibility preferences.
 *
 * Persistencia en dos capas:
 *  - localStorage: copia instantánea y offline (siempre disponible).
 *  - perfil del usuario en la BD (profiles.ui_prefs): sincroniza la selección
 *    entre dispositivos. Al iniciar sesión se adopta lo que haya en la BD.
 *
 * @param listKey unique key for the list (e.g. "ventas")
 * @param defaults default visibility map { columnKey: boolean }
 */
export function useColumnPreferences(listKey: string, defaults: Record<string, boolean>) {
  const { user, profile } = useAuth();
  const userId = user?.id ?? 'anon';
  const fullKey = `${userId}_${listKey}`;
  const prefKey = `cols_${listKey}`;
  const dbPref = (profile?.ui_prefs && typeof profile.ui_prefs === 'object')
    ? (profile.ui_prefs as Record<string, any>)[prefKey]
    : undefined;
  const dbPrefSig = dbPref && typeof dbPref === 'object' ? JSON.stringify(dbPref) : '';

  const [visible, setVisible] = useState<Record<string, boolean>>(() => load(fullKey, defaults));

  // Reload when the user changes
  useEffect(() => {
    setVisible(load(fullKey, defaults));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullKey]);

  // Adoptar la preferencia guardada en el perfil (BD) → sincroniza entre
  // dispositivos. Solo cuando existe (un usuario que nunca la tocó conserva
  // sus defaults / lo que tenga en localStorage).
  useEffect(() => {
    if (dbPrefSig) {
      const merged = { ...defaults, ...JSON.parse(dbPrefSig) };
      setVisible(merged);
      save(fullKey, merged);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullKey, dbPrefSig]);

  // Guarda en localStorage (instantáneo) y sincroniza a la BD (fire-and-forget:
  // si falla o está offline, localStorage mantiene la selección).
  const persist = useCallback((next: Record<string, boolean>) => {
    // Se llama desde updaters de setState (que React puede ejecutar durante el
    // render): diferimos el efecto para no escribir durante el render.
    queueMicrotask(() => {
      save(fullKey, next);
      if (userId !== 'anon') {
        try {
          callRpc('set_ui_pref', { p_key: prefKey, p_value: next })
            .then(({ error }) => { if (error) console.warn('set_ui_pref:', error.message); });
        } catch (e) {
          console.warn('set_ui_pref:', e);
        }
      }
    });
  }, [fullKey, prefKey, userId]);

  const toggleColumn = useCallback((key: string) => {
    setVisible(prev => {
      const next = { ...prev, [key]: !prev[key] };
      persist(next);
      return next;
    });
  }, [persist]);

  const setAll = useCallback((value: boolean) => {
    setVisible(prev => {
      const next: Record<string, boolean> = {};
      for (const k of Object.keys(prev)) next[k] = value;
      persist(next);
      return next;
    });
  }, [persist]);

  /** Enciende exactamente las columnas de `onKeys` y apaga el resto (para presets/vistas). */
  const applyPreset = useCallback((onKeys: string[]) => {
    const on = new Set(onKeys);
    setVisible(prev => {
      const next: Record<string, boolean> = {};
      for (const k of Object.keys(prev)) next[k] = on.has(k);
      persist(next);
      return next;
    });
  }, [persist]);

  const reset = useCallback(() => {
    setVisible(defaults);
    persist(defaults);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persist]);

  const isVisible = useCallback((key: string) => visible[key] ?? false, [visible]);

  // ── Orden de columnas: misma persistencia (localStorage + profiles.ui_prefs) ──
  // `savedOrder` es lo que el usuario eligió (null = orden por omisión). El orden
  // efectivo se calcula contra las columnas actuales (`defaults`): las nuevas van
  // al final y las que ya no existen se ignoran.
  const orderPrefKey = `colsorder_${listKey}`;
  const keysSig = Object.keys(defaults).join('|');
  const uiPrefs = (profile?.ui_prefs && typeof profile.ui_prefs === 'object')
    ? (profile.ui_prefs as Record<string, any>)
    : undefined;
  // '' = sin preferencia en la BD; 'null' = el usuario restableció el orden.
  const dbOrderSig = uiPrefs && orderPrefKey in uiPrefs
    ? JSON.stringify(Array.isArray(uiPrefs[orderPrefKey]) ? uiPrefs[orderPrefKey] : null)
    : '';

  const [savedOrder, setSavedOrder] = useState<string[] | null>(() => loadColumnOrder(fullKey));

  useEffect(() => {
    setSavedOrder(loadColumnOrder(fullKey));
  }, [fullKey]);

  useEffect(() => {
    if (dbOrderSig) {
      const parsed = JSON.parse(dbOrderSig) as string[] | null;
      setSavedOrder(parsed);
      saveColumnOrder(fullKey, parsed);
    }
  }, [fullKey, dbOrderSig]);

  const columnOrder = useMemo(
    () => mergeColumnOrder(savedOrder, keysSig ? keysSig.split('|') : []),
    [savedOrder, keysSig],
  );

  const persistOrder = useCallback((next: string[] | null) => {
    queueMicrotask(() => {
      saveColumnOrder(fullKey, next);
      if (userId !== 'anon') {
        try {
          callRpc('set_ui_pref', { p_key: orderPrefKey, p_value: next })
            .then(({ error }) => { if (error) console.warn('set_ui_pref:', error.message); });
        } catch (e) {
          console.warn('set_ui_pref:', e);
        }
      }
    });
  }, [fullKey, orderPrefKey, userId]);

  const updateOrder = useCallback((fn: (order: string[]) => string[]) => {
    setSavedOrder(prev => {
      const base = mergeColumnOrder(prev, keysSig ? keysSig.split('|') : []);
      const next = fn(base);
      if (next === base) return prev;
      persistOrder(next);
      return next;
    });
  }, [keysSig, persistOrder]);

  /** Sube (delta -1) o baja (delta +1) una columna. */
  const moveColumn = useCallback((key: string, delta: number) => {
    updateOrder(order => moveColumnKey(order, key, delta));
  }, [updateOrder]);

  /** Coloca `fromKey` en el lugar de `toKey` (arrastrar y soltar). */
  const moveColumnTo = useCallback((fromKey: string, toKey: string) => {
    updateOrder(order => moveColumnToKey(order, fromKey, toKey));
  }, [updateOrder]);

  /** Vuelve al orden por omisión. */
  const resetOrder = useCallback(() => {
    setSavedOrder(null);
    persistOrder(null);
  }, [persistOrder]);

  return { visible, isVisible, toggleColumn, setAll, applyPreset, reset, columnOrder, moveColumn, moveColumnTo, resetOrder };
}
