import { supabase } from '@/lib/supabase';
import { getOfflineTable } from '@/lib/offlineDb';

export interface LoteDisponible {
  lote_id: string;
  codigo: string;
  fecha_caducidad: string | null;
  cantidad: number;
  apartado: number;
  disponible: number;
}

const fefoSort = (a: LoteDisponible, b: LoteDisponible) =>
  (a.fecha_caducidad ?? '9999-12-31').localeCompare(b.fecha_caducidad ?? '9999-12-31')
  || a.codigo.localeCompare(b.codigo);

/**
 * Lotes con existencia de un producto en un almacén, ordenados FEFO (caduca
 * primero arriba) y ya netos de lo que otros pedidos tienen apartado.
 *
 * Funciona online (RPC `fn_disponible_lotes`) y offline (caché de IndexedDB),
 * para que el vendedor en ruta pueda apartar el lote sin señal.
 */
export async function getLotesDisponibles(params: {
  empresaId: string;
  almacenId: string;
  productoId: string;
  /** Pedido en edición: su propio apartado no se descuenta. */
  excluirVentaId?: string | null;
}): Promise<LoteDisponible[]> {
  const { empresaId, almacenId, productoId, excluirVentaId } = params;
  if (!empresaId || !almacenId || !productoId) return [];

  if (navigator.onLine) {
    try {
      const { data, error } = await (supabase.rpc as any)('fn_disponible_lotes', {
        p_almacen_id: almacenId,
        p_producto_id: productoId,
        p_excluir_venta_id: excluirVentaId ?? null,
      });
      if (error) throw error;
      return ((data ?? []) as any[])
        .map(r => ({
          lote_id: r.lote_id,
          codigo: r.codigo ?? '—',
          fecha_caducidad: r.fecha_caducidad ?? null,
          cantidad: Number(r.cantidad) || 0,
          apartado: Number(r.apartado) || 0,
          disponible: Number(r.disponible) || 0,
        }))
        .sort(fefoSort);
    } catch {
      /* cae al modo offline */
    }
  }

  return getLotesDisponiblesOffline(params);
}

/** Misma lista, resuelta solo con la caché local (sin red). */
export async function getLotesDisponiblesOffline(params: {
  empresaId: string;
  almacenId: string;
  productoId: string;
  excluirVentaId?: string | null;
}): Promise<LoteDisponible[]> {
  const { empresaId, almacenId, productoId, excluirVentaId } = params;
  try {
    const stockTable = getOfflineTable('stock_lotes');
    const lotesTable = getOfflineTable('lotes');
    const apartTable = getOfflineTable('stock_apartado');
    if (!stockTable || !lotesTable) return [];

    const stock = (await stockTable.where('producto_id').equals(productoId).toArray())
      .filter((r: any) => r.empresa_id === empresaId && r.almacen_id === almacenId && (Number(r.cantidad) || 0) > 0);
    if (stock.length === 0) return [];

    const lotes = await lotesTable.where('producto_id').equals(productoId).toArray();
    const loteById = new Map<string, any>(lotes.map((l: any) => [l.id, l]));

    const apartados = apartTable
      ? (await apartTable.where('producto_id').equals(productoId).toArray())
        .filter((a: any) => a.almacen_id === almacenId && a.lote_id && (!excluirVentaId || a.venta_id !== excluirVentaId))
      : [];
    const apartadoPorLote = new Map<string, number>();
    for (const a of apartados as any[]) {
      apartadoPorLote.set(a.lote_id, (apartadoPorLote.get(a.lote_id) ?? 0) + (Number(a.cantidad) || 0));
    }

    return (stock as any[])
      .filter(r => loteById.get(r.lote_id)?.activo !== false)
      .map(r => {
        const l = loteById.get(r.lote_id);
        const cantidad = Number(r.cantidad) || 0;
        const apartado = apartadoPorLote.get(r.lote_id) ?? 0;
        return {
          lote_id: r.lote_id,
          codigo: l?.codigo ?? '—',
          fecha_caducidad: l?.fecha_caducidad ?? null,
          cantidad,
          apartado,
          disponible: cantidad - apartado,
        } as LoteDisponible;
      })
      .sort(fefoSort);
  } catch {
    return [];
  }
}

/** Lote FEFO sugerido: el primero que alcanza para la cantidad; si ninguno alcanza, el primero con disponible. */
export function pickFefo(lotes: LoteDisponible[], cantidad = 0): LoteDisponible | null {
  if (lotes.length === 0) return null;
  return lotes.find(l => l.disponible >= cantidad && l.disponible > 0)
    ?? lotes.find(l => l.disponible > 0)
    ?? lotes[0];
}

export const fmtCaducidad = (d: string | null) =>
  d ? new Date(d + 'T00:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' }) : 'sin caducidad';
