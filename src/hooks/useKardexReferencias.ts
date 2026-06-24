import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface KardexRefInfo {
  // por referencia_id
  ventaCliente?: Record<string, { nombre: string; folio?: string | null }>;
  compraProveedor?: Record<string, { nombre: string; folio?: string | null }>;
  entregaCliente?: Record<string, { nombre: string }>;
  almacenes?: Record<string, string>; // id -> nombre
  productos?: Record<string, { nombre: string; codigo?: string | null }>;
  usuarios?: Record<string, string>; // user_id -> nombre
}

/**
 * Fetches contextual info (cliente/proveedor/almacen/producto/usuario names)
 * for kardex rows so we can show origen/destino, producto and usuario.
 */
export function useKardexReferencias(rows: any[] | undefined) {
  const { empresa } = useAuth();

  return useQuery({
    queryKey: [
      'kardex-referencias',
      empresa?.id,
      // stable hash of refs
      (rows ?? []).map(r => `${r.referencia_tipo}:${r.referencia_id}:${r.producto_id}:${r.user_id}`).join('|'),
    ],
    enabled: !!empresa?.id && !!rows && rows.length > 0,
    queryFn: async (): Promise<KardexRefInfo> => {
      const ventaIds = new Set<string>();
      const compraIds = new Set<string>();
      const entregaIds = new Set<string>();
      const almacenIds = new Set<string>();
      const productoIds = new Set<string>();
      const userIds = new Set<string>();

      for (const r of rows ?? []) {
        if (r.referencia_id) {
          if (['venta', 'venta_ruta', 'cancelacion_venta'].includes(r.referencia_tipo)) {
            ventaIds.add(r.referencia_id);
          } else if (r.referencia_tipo === 'compra') {
            compraIds.add(r.referencia_id);
          } else if (r.referencia_tipo === 'entrega') {
            entregaIds.add(r.referencia_id);
          }
        }
        if (r.almacen_origen_id) almacenIds.add(r.almacen_origen_id);
        if (r.almacen_destino_id) almacenIds.add(r.almacen_destino_id);
        if (r.producto_id) productoIds.add(r.producto_id);
        if (r.user_id) userIds.add(r.user_id);
      }

      const result: KardexRefInfo = {
        ventaCliente: {},
        compraProveedor: {},
        entregaCliente: {},
        almacenes: {},
        productos: {},
        usuarios: {},
      };

      const tasks: Promise<any>[] = [];

      if (ventaIds.size) {
        tasks.push(
          (async () => {
            const { data } = await supabase
              .from('ventas')
              .select('id, folio, cliente:clientes(nombre)')
              .eq('empresa_id', empresa!.id)
              .in('id', Array.from(ventaIds));
            (data ?? []).forEach((v: any) => {
              result.ventaCliente![v.id] = {
                nombre: v.cliente?.nombre ?? '—',
                folio: v.folio,
              };
            });
          })()
        );
      }

      if (compraIds.size) {
        tasks.push(
          (async () => {
            const { data } = await supabase
              .from('compras')
              .select('id, folio, proveedor:proveedores(nombre)')
              .eq('empresa_id', empresa!.id)
              .in('id', Array.from(compraIds));
            (data ?? []).forEach((c: any) => {
              result.compraProveedor![c.id] = {
                nombre: c.proveedor?.nombre ?? '—',
                folio: c.folio,
              };
            });
          })()
        );
      }

      if (entregaIds.size) {
        tasks.push(
          (async () => {
            const { data } = await supabase
              .from('entregas')
              .select('id, cliente:clientes(nombre)')
              .eq('empresa_id', empresa!.id)
              .in('id', Array.from(entregaIds));
            (data ?? []).forEach((e: any) => {
              result.entregaCliente![e.id] = { nombre: e.cliente?.nombre ?? '—' };
            });
          })()
        );
      }

      if (almacenIds.size) {
        tasks.push(
          (async () => {
            const { data } = await supabase
              .from('almacenes')
              .select('id, nombre')
              .eq('empresa_id', empresa!.id)
              .in('id', Array.from(almacenIds));
            (data ?? []).forEach((a: any) => {
              result.almacenes![a.id] = a.nombre;
            });
          })()
        );
      }

      if (productoIds.size) {
        tasks.push(
          (async () => {
            const { data } = await supabase
              .from('productos')
              .select('id, nombre, codigo')
              .eq('empresa_id', empresa!.id)
              .in('id', Array.from(productoIds));
            (data ?? []).forEach((p: any) => {
              result.productos![p.id] = { nombre: p.nombre, codigo: p.codigo };
            });
          })()
        );
      }

      if (userIds.size) {
        tasks.push(
          (async () => {
            const { data } = await supabase
              .from('profiles')
              .select('user_id, nombre')
              .in('user_id', Array.from(userIds));
            (data ?? []).forEach((u: any) => {
              if (u.user_id) result.usuarios![u.user_id] = u.nombre || u.user_id.slice(0, 8);
            });
          })()
        );
      }


      await Promise.all(tasks);
      return result;
    },
    staleTime: 30_000,
  });
}
