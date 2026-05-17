import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

/**
 * Suscribe a cambios Realtime de una tabla filtrada por empresa_id e
 * invalida los queryKeys indicados cuando llega un evento.
 *
 * Reemplaza el patrón refetchInterval para no consumir red mientras
 * no hay cambios reales en la base de datos.
 */
export function useRealtimeInvalidate(opts: {
  table: string;
  empresaId: string | undefined;
  queryKeys: (readonly unknown[])[];
  enabled?: boolean;
}) {
  const { table, empresaId, queryKeys, enabled = true } = opts;
  const qc = useQueryClient();
  const keysSig = JSON.stringify(queryKeys);

  useEffect(() => {
    if (!enabled || !empresaId) return;
    const channel = supabase
      .channel(`rti-${table}-${empresaId}-${Math.random().toString(36).slice(2, 7)}`)
      .on(
        "postgres_changes" as any,
        { event: "*", schema: "public", table, filter: `empresa_id=eq.${empresaId}` },
        () => {
          queryKeys.forEach((k) => qc.invalidateQueries({ queryKey: k }));
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, empresaId, enabled, keysSig]);
}
