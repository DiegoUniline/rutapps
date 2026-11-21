import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { todayInTimezone } from '@/lib/utils';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import type { TarifaLineaRule } from '@/lib/priceResolver';
import { fetchAllPages } from '@/lib/supabasePaginate';
import { precioDevolucionCliente, type ProductoPrecioDevolucion } from '@/lib/devolucionPrecio';
import { esCantidadDevolucionValida, registrarDevolucionRpc, encolarDevolucion, lineasParaRpc, cancelarDevolucionRpc, type DevolucionLineaF1 } from '@/lib/devolucionGuardado';

export function useSaveDevolucion() {
  const qc = useQueryClient();
  const { empresa } = useAuth();
  return useMutation({
    mutationFn: async ({ devolucion, lineas }: {
      devolucion: {
        id?: string; vendedor_id?: string; cliente_id?: string; carga_id?: string; venta_id?: string;
        almacen_destino_id?: string; reembolso_metodo?: string; registrar_gasto?: boolean;
        tipo: string; fecha?: string; notas?: string; reemplaza_id?: string; motivo_edicion?: string;
      };
      lineas: DevolucionLineaF1[];
    }) => {
      if (!empresa?.id) throw new Error('Sin empresa');
      if (lineas.length === 0) throw new Error('Agrega al menos un producto');
      if (lineas.some(l => !esCantidadDevolucionValida(l.cantidad))) throw new Error('La cantidad a devolver debe ser mayor a cero');
      if (lineas.some(l => l.destino !== 'vendible' && l.destino !== 'merma')) throw new Error('Elige el destino (vendible o merma) de cada producto');
      // Fecha en zona horaria de la empresa (no CURRENT_DATE UTC del server).
      const fecha = devolucion.fecha ?? todayInTimezone(empresa.zona_horaria);
      // Id estable: reintentar (doble toque, cola) no duplica la devolución.
      const payload = { ...devolucion, id: devolucion.id ?? crypto.randomUUID(), empresa_id: empresa.id, fecha };

      // D-049: una sola vía. En línea, la RPC transaccional; sin conexión, UNA operación
      // idempotente en la cola (la misma RPC). Inventario, nota aplicada y caja: en la BD.
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        return { id: await encolarDevolucion(payload, lineas) };
      }
      return { id: await registrarDevolucionRpc(payload, lineasParaRpc(lineas)) };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['devoluciones'] });
      qc.invalidateQueries({ queryKey: ['venta-devoluciones'] });
      qc.invalidateQueries({ queryKey: ['venta-pagos'] });
      qc.invalidateQueries({ queryKey: ['venta'] });
      qc.invalidateQueries({ queryKey: ['carga-activa'] });
      qc.invalidateQueries({ queryKey: ['carga'] });
      qc.invalidateQueries({ queryKey: ['cargas'] });
      qc.invalidateQueries({ queryKey: ['productos'] });
      qc.invalidateQueries({ queryKey: ['stock_almacen'] });
      qc.invalidateQueries({ queryKey: ['saldo-favor'] });
      qc.invalidateQueries({ queryKey: ['cliente-estado-cuenta'] });
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Error inesperado');
    },
  });
}

/** F2: cancelar una devolución con motivo (revierte inventario, nota, cobro aplicado, caja y gasto). */
export function useCancelarDevolucion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, motivo }: { id: string; motivo: string }) => {
      if (!motivo.trim()) throw new Error('Escribe el motivo de la cancelación');
      await cancelarDevolucionRpc(id, motivo.trim());
    },
    onSuccess: () => {
      for (const k of ['devoluciones', 'venta-devoluciones', 'venta-pagos', 'venta', 'productos', 'stock_almacen', 'saldo-favor', 'cliente-estado-cuenta', 'gastos']) {
        qc.invalidateQueries({ queryKey: [k] });
      }
      toast.success('Devolución cancelada');
    },
    onError: (error: Error) => {
      toast.error(error?.message || 'No se pudo cancelar la devolución');
    },
  });
}

/**
 * «Configurar mermas» (devolucion_motivo_config): qué motivos sugieren merma. Solo SUGIERE
 * el destino; sin conexión o sin configuración se usa el default (dañado/vencido/caducado).
 */
export function useMermaMotivoConfig() {
  const { empresa } = useAuth();
  return useQuery({
    queryKey: ['devolucion-motivo-config', empresa?.id],
    enabled: !!empresa?.id && (typeof navigator === 'undefined' || navigator.onLine),
    staleTime: 30 * 60 * 1000,
    queryFn: async (): Promise<Record<string, boolean>> => {
      const { data, error } = await supabase
        .from('devolucion_motivo_config')
        .select('motivo, a_mermas')
        .eq('empresa_id', empresa!.id);
      if (error) throw error;
      const map: Record<string, boolean> = {};
      for (const r of (data ?? []) as { motivo: string; a_mermas: boolean | null }[]) map[r.motivo] = !!r.a_mermas;
      return map;
    },
  });
}

const SELECT_REGLAS = 'aplica_a, producto_ids, clasificacion_ids, grupos, tipo_calculo, precio, precio_minimo, margen_pct, descuento_pct, redondeo, base_precio, lista_precio_id';

/**
 * Escritorio: precio de devolución = lista de precios del cliente (D-049). Tarifa del
 * cliente o, si no tiene, la tarifa general; lista = clientes.lista_precio_id (mismo
 * criterio que la venta de ruta).
 */
export function usePrecioDevolucionCliente(clienteId?: string | null) {
  const { empresa } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ['precio-devolucion-cliente', empresa?.id, clienteId],
    enabled: !!empresa?.id,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      let tarifaId: string | null = null;
      let listaId: string | null = null;
      if (clienteId) {
        const { data: cli, error } = await supabase.from('clientes').select('tarifa_id, lista_precio_id').eq('id', clienteId).maybeSingle();
        if (error) throw error;
        tarifaId = (cli as { tarifa_id: string | null } | null)?.tarifa_id ?? null;
        listaId = (cli as { lista_precio_id: string | null } | null)?.lista_precio_id ?? null;
      }
      if (!tarifaId) {
        const { data: gen, error } = await supabase.from('tarifas').select('id').eq('empresa_id', empresa!.id).eq('tipo', 'general').eq('activa', true).limit(1).maybeSingle();
        if (error) throw error;
        tarifaId = (gen as { id: string } | null)?.id ?? null;
      }
      let rules: TarifaLineaRule[] = [];
      if (tarifaId) {
        const tid = tarifaId;
        rules = await fetchAllPages<TarifaLineaRule>((from, to) => supabase.from('tarifa_lineas')
          .select(SELECT_REGLAS).eq('tarifa_id', tid).order('created_at').order('id').range(from, to));
      }
      return { rules, listaId };
    },
  });
  const precio = (producto: ProductoPrecioDevolucion) =>
    precioDevolucionCliente(data?.rules ?? [], producto, data?.listaId ?? null);
  return { precio, cargando: isLoading };
}
