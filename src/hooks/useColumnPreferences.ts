import { useState, useCallback, useEffect } from 'react';
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

  return { visible, isVisible, toggleColumn, setAll, applyPreset, reset };
}
