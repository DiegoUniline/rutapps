import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { programarRefrescoRemoto } from "@/lib/refresco/refrescoRemoto";

/**
 * Suscribe a cambios Realtime de una tabla filtrada por empresa_id e
 * invalida los queryKeys indicados cuando llega un evento.
 *
 * Reemplaza el patrón refetchInterval para no consumir red mientras
 * no hay cambios reales en la base de datos.
 *
 * Además de `queryKeys`, se refrescan TODAS las consultas que leen la tabla (y lo que cambian sus
 * triggers) según el mapa central (src/lib/refresco): un cambio hecho en otro dispositivo se ve en
 * cualquier pantalla abierta, no solo en la que abrió el canal.
 *
 * IMPORTANTE (costo/egress): las invalidaciones se AGRUPAN en el refresco remoto central
 * (programarRefrescoRemoto): una ráfaga de N eventos produce una sola recarga, como máximo una
 * cada pocos segundos, y solo de las consultas visibles.
 */
export function useRealtimeInvalidate(opts: {
  table: string;
  empresaId: string | undefined;
  queryKeys: (readonly unknown[])[];
  enabled?: boolean;
  /** @deprecated El agrupamiento lo hace el refresco remoto central; se ignora. */
  debounceMs?: number;
  /** Columna por la cual filtrar por tenant. Default 'empresa_id'. Si la tabla no tiene esa columna, pasa null para no filtrar. */
  tenantColumn?: string | null;
  /** Filtro Realtime explícito (p. ej. `user_id=eq.<id>`); reemplaza al de tenant. */
  filter?: string;
}) {
  const { table, empresaId, queryKeys, enabled = true, tenantColumn = 'empresa_id', filter } = opts;
  const qc = useQueryClient();
  const keysSig = JSON.stringify(queryKeys);

  // Mantener la última referencia de queryKeys sin re-suscribir el canal.
  const keysRef = useRef(queryKeys);
  keysRef.current = queryKeys;

  useEffect(() => {
    if (!enabled || !empresaId) return;

    const schedule = () => programarRefrescoRemoto(qc, { tablas: [table], claves: keysRef.current });

    const cfg: any = { event: '*', schema: 'public', table };
    if (filter) cfg.filter = filter;
    else if (tenantColumn) cfg.filter = `${tenantColumn}=eq.${empresaId}`;

    const channel = supabase
      .channel(`rti-${table}-${empresaId}-${Math.random().toString(36).slice(2, 7)}`)
      .on('postgres_changes' as any, cfg, schedule)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, empresaId, enabled, keysSig, tenantColumn, filter]);
}
