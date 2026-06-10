import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { fetchAllPages } from '@/lib/supabasePaginate';
import type { DateRange } from '@/hooks/useDashboardData';

const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

export type CamionRow = {
  almacenId: string; nombre: string; valor: number; uds: number;
};
export type MermaItem = { id: string; folio: string | null; fecha: string; total_costo: number; total_venta: number; motivo?: string };

export function useDashboardInventarioCamion(range: DateRange) {
  const { empresa } = useAuth();
  return useQuery({
    queryKey: ['dashboard-inv-camion', empresa?.id, fmt(range.from), fmt(range.to)],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const eId = empresa!.id;
      const [almacenesRes, stockRes, productosRes, mermasRes] = await Promise.all([
        supabase.from('almacenes').select('id, nombre, tipo').eq('empresa_id', eId).eq('activo', true),
        fetchAllPages((from, to) => supabase.from('stock_almacen').select('almacen_id, producto_id, cantidad').eq('empresa_id', eId).range(from, to)),
        supabase.from('productos').select('id, costo, precio_principal').eq('empresa_id', eId),
        fetchAllPages((from, to) => supabase.from('mermas')
          .select('id, folio, fecha, total_costo, total_venta, cancelada, merma_motivos(nombre)')
          .eq('empresa_id', eId)
          .gte('fecha', fmt(range.from)).lte('fecha', fmt(range.to))
          .eq('cancelada', false)
          .range(from, to)),
      ]);

      const productMap = new Map<string, { costo: number; precio: number }>();
      (productosRes.data ?? []).forEach((p: any) => productMap.set(p.id, { costo: Number(p.costo || 0), precio: Number(p.precio_principal || 0) }));

      const almacenes = (almacenesRes.data ?? []) as any[];
      const camiones: CamionRow[] = almacenes.map((a) => {
        const items = (stockRes ?? []).filter((s: any) => s.almacen_id === a.id);
        const valor = items.reduce((sum, s: any) => sum + Number(s.cantidad || 0) * (productMap.get(s.producto_id)?.costo ?? 0), 0);
        const uds = items.reduce((sum, s: any) => sum + Number(s.cantidad || 0), 0);
        return { almacenId: a.id, nombre: a.nombre + (a.tipo === 'ruta' ? '' : ''), valor, uds };
      });

      const mermasTotal = (mermasRes ?? []).reduce((s, m: any) => s + Number(m.total_costo || 0), 0);
      const mermasUdsAprox = mermasRes?.length || 0;
      const mermasList: MermaItem[] = (mermasRes ?? []).map((m: any) => ({
        id: m.id, folio: m.folio, fecha: m.fecha,
        total_costo: Number(m.total_costo || 0),
        total_venta: Number(m.total_venta || 0),
        motivo: m.merma_motivos?.nombre,
      }));

      return { camiones, mermasTotal, mermasCount: mermasUdsAprox, mermasList };
    },
  });
}
