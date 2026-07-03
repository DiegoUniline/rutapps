import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

/**
 * Suscribe a cambios Realtime de una tabla filtrada por empresa_id e
 * invalida los queryKeys indicados cuando llega un evento.
 *
 * Reemplaza el patrón refetchInterval para no consumir red mientras
 * no hay cambios reales en la base de datos.
 *
 * IMPORTANTE (costo/egress): las invalidaciones se AGRUPAN con un pequeño
 * debounce. Si llega una ráfaga de N eventos (p. ej. un ajuste de inventario
 * que toca muchas filas, o varias ventas seguidas), se dispara UN solo
 * refetch al final de la ventana, no N. Así "todo en vivo" no multiplica el
 * tráfico de datos.
 */
export function useRealtimeInvalidate(opts: {
  table: string;
  empresaId: string | undefined;
  queryKeys: (readonly unknown[])[];
  enabled?: boolean;
  /** Ventana de agrupamiento en ms (default 400). */
  debounceMs?: number;
}) {
  const { table, empresaId, queryKeys, enabled = true, debounceMs = 400 } = opts;
  const qc = useQueryClient();
  const keysSig = JSON.stringify(queryKeys);

  // Mantener la última referencia de queryKeys sin re-suscribir el canal.
  const keysRef = useRef(queryKeys);
  keysRef.current = queryKeys;

  useEffect(() => {
    if (!enabled || !empresaId) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    const flush = () => {
      timer = null;
      keysRef.current.forEach((k) => qc.invalidateQueries({ queryKey: k }));
    };
    const schedule = () => {
      if (timer != null) return; // ya hay un flush programado en esta ventana
      timer = setTimeout(flush, debounceMs);
    };

    const channel = supabase
      .channel(`rti-${table}-${empresaId}-${Math.random().toString(36).slice(2, 7)}`)
      .on(
        "postgres_changes" as any,
        { event: "*", schema: "public", table, filter: `empresa_id=eq.${empresaId}` },
        schedule
      )
      .subscribe();

    return () => {
      if (timer != null) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, empresaId, enabled, keysSig, debounceMs]);
}
