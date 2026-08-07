import { useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { offlineDb } from '@/lib/offlineDb';
import { COLUMN_SELECTS } from '@/lib/offlineSync';
import { hasRealConnection } from '@/lib/connectivity';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Traspasos → vista móvil en tiempo real.
 *
 * Antes, al confirmar o cancelar un traspaso el stock cambiaba en el servidor
 * pero la app móvil seguía leyendo su copia local (IndexedDB) hasta que el
 * vendedor pulsaba "Sincronizar".
 *
 * Este hook escucha por Realtime los cambios de `traspasos` de la empresa y,
 * cuando alguno toca el almacén/ruta del usuario, refresca SOLO las existencias
 * de ese almacén (`stock_almacen` y `stock_lotes`) en la copia local y emite
 * `uniline:sync-complete`, que es el evento que ya usan las pantallas offline
 * para releer sus datos. No sustituye ni altera el botón "Sincronizar".
 */
export function useTraspasosRealtime() {
  const { empresa, profile } = useAuth();
  const empresaId = empresa?.id;
  const almacenId = profile?.almacen_id as string | undefined;
  const runningRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!empresaId || !almacenId) return;

    const refreshStock = async () => {
      if (runningRef.current) return;
      runningRef.current = true;
      try {
        if (!(await hasRealConnection())) return;

        const [{ data: sa }, { data: sl }] = await Promise.all([
          supabase
            .from('stock_almacen')
            .select(COLUMN_SELECTS.stock_almacen)
            .eq('empresa_id', empresaId)
            .eq('almacen_id', almacenId),
          supabase
            .from('stock_lotes')
            .select(COLUMN_SELECTS.stock_lotes)
            .eq('empresa_id', empresaId)
            .eq('almacen_id', almacenId),
        ]);

        if (sa?.length) await offlineDb.stock_almacen.bulkPut(sa as any);
        if (sl?.length) await offlineDb.stock_lotes.bulkPut(sl as any);

        window.dispatchEvent(new CustomEvent('uniline:sync-complete'));
      } catch (e) {
        console.warn('[traspasos-realtime] refresco de stock falló', e);
      } finally {
        runningRef.current = false;
      }
    };

    const schedule = (payload: any) => {
      const row = payload?.new ?? payload?.old ?? {};
      const tocaMiAlmacen =
        row.almacen_origen_id === almacenId || row.almacen_destino_id === almacenId;
      if (!tocaMiAlmacen) return;
      // Agrupa ráfagas (varios traspasos seguidos) en un solo refresco.
      if (timerRef.current != null) return;
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        refreshStock();
      }, 800);
    };

    const channel = supabase
      .channel(`traspasos-ruta-${empresaId}-${almacenId}`)
      .on(
        'postgres_changes' as any,
        { event: '*', schema: 'public', table: 'traspasos', filter: `empresa_id=eq.${empresaId}` },
        schedule,
      )
      .subscribe();

    return () => {
      if (timerRef.current != null) clearTimeout(timerRef.current);
      supabase.removeChannel(channel);
    };
  }, [empresaId, almacenId]);
}
