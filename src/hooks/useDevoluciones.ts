import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { todayInTimezone } from '@/lib/utils';
import { queueOperations } from '@/lib/syncQueue';
import { deterministicUuid } from '@/lib/deterministicId';
import { getOfflineTable } from '@/lib/offlineDb';
import { toast } from 'sonner';
import { accionDevolucionODefault, esCantidadDevolucionValida, registrarDevolucionRpc } from '@/lib/devolucionGuardado';

export function useSaveDevolucion() {
  const qc = useQueryClient();
  const { empresa, profile } = useAuth();
  return useMutation({
    mutationFn: async ({ devolucion, lineas }: {
      devolucion: { vendedor_id?: string; cliente_id?: string; carga_id?: string; venta_id?: string; almacen_destino_id?: string; reembolso_efectivo?: boolean; reembolso_metodo?: string; tipo: string; fecha?: string; notas?: string; user_id: string };
      lineas: { producto_id: string; cantidad: number; motivo: string; notas?: string; accion?: string; monto_credito?: number }[];
    }) => {
      if (!empresa?.id) throw new Error('Sin empresa');
      if (lineas.length === 0) throw new Error('Agrega al menos un producto');
      const malaCantidad = lineas.find(l => !esCantidadDevolucionValida(l.cantidad));
      if (malaCantidad) throw new Error('La cantidad a devolver debe ser mayor a cero');
      const fecha = devolucion.fecha ?? todayInTimezone(empresa.zona_horaria);
      // H1: accion es NOT NULL en la BD. Sin elección de dinero (pantalla Devolución,
      // «Al almacén» / «En tienda») va 'reposicion' — el default de la columna, que no
      // genera nota de crédito ni devolución de dinero. Antes se mandaba null y el
      // renglón se rechazaba: encabezado huérfano y cola offline atorada.
      const lineasOk = lineas.map(l => ({ ...l, accion: accionDevolucionODefault(l.accion) }));

      // OFFLINE-SAFE: sin conexión encola todo (antes fallaba y no guardaba
      // nada). El reingreso a inventario lo hace el trigger de BD al sincronizar
      // la línea. carga_lineas se ajusta con la caché local.
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        // Id DETERMINÍSTICO por contenido: reenviar la MISMA devolución (doble-
        // toque, resync) coincide en id → el upsert no la duplica.
        const firmaDev = lineas.map(l => `${l.producto_id}:${l.cantidad}:${l.accion ?? ''}:${l.motivo}`).sort().join(',');
        const devId = await deterministicUuid('devhook', empresa.id, devolucion.cliente_id ?? '', devolucion.carga_id ?? '', devolucion.venta_id ?? '', fecha, firmaDev);
        const ops: any[] = [
          { table: 'devoluciones', operation: 'insert', data: { id: devId, ...devolucion, empresa_id: empresa.id, tipo: devolucion.tipo, fecha } },
          ...await Promise.all(lineasOk.map(async (l, i) => ({
            table: 'devolucion_lineas',
            operation: 'insert' as const,
            data: { id: await deterministicUuid('devlinea', devId, i), devolucion_id: devId, producto_id: l.producto_id, cantidad: l.cantidad, motivo: l.motivo, notas: l.notas || null, accion: l.accion, monto_credito: l.monto_credito ?? 0 },
          }))),
        ];
        if (devolucion.carga_id && lineas.length > 0) {
          const clTable = getOfflineTable('carga_lineas');
          if (clTable) {
            const allCl = (await clTable.toArray().catch(() => [])) as any[];
            for (const l of lineas) {
              const cl = allCl.find(c => c.carga_id === devolucion.carga_id && c.producto_id === l.producto_id);
              if (cl) ops.push({ table: 'carga_lineas', operation: 'update', data: { id: cl.id, cantidad_devuelta: (cl.cantidad_devuelta ?? 0) + (l.cantidad ?? 0) } });
            }
          }
        }
        await queueOperations(ops);
        return { id: devId };
      }

      // En línea: UNA transacción en la BD (registrar_devolucion) — encabezado,
      // renglones y cantidad devuelta de la carga; si algo falla no queda nada a medias.
      // Fecha en zona horaria de la empresa (no CURRENT_DATE UTC del server).
      // El reingreso al inventario lo siguen aplicando los triggers de devolucion_lineas.
      const devId = await registrarDevolucionRpc(
        { ...devolucion, empresa_id: empresa.id, fecha },
        lineasOk.map(l => ({ producto_id: l.producto_id, cantidad: l.cantidad, motivo: l.motivo, notas: l.notas || null, accion: l.accion, monto_credito: l.monto_credito ?? 0 })),
      );
      return { id: devId };
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
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Error inesperado');
    },
  });
}
