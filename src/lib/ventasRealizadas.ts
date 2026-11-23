/**
 * Base de "lo realmente vendido" para Dashboard y Reportes → Utilidad (D-060).
 *
 * Cuenta SOLO:
 *  - `venta_directa` con status confirmado / entregado / facturado, por `fecha`.
 *  - `pedido` con status entregado / facturado, por fecha de entrega
 *    (`fecha_entrega`; si es null, `fecha`). Un pedido levantado en octubre y
 *    entregado en noviembre cuenta en noviembre.
 * Nunca borradores, cancelados ni pedidos sin entregar. Siempre
 * `es_saldo_inicial = false` y filtrado por empresa.
 *
 * D-061 «según uso de Entregas»: si la empresa tiene el ajuste
 * `empresas.pedidos_cuentan_al_confirmar = true` (no usa Entregas), el pedido
 * confirmado / entregado / facturado cuenta por `fecha` del pedido. Con el ajuste
 * en false (default) se queda la regla D-060 de arriba.
 *
 * La misma regla vive en SQL (RPC dashboard_costo_ventas, dashboard_top_productos,
 * dashboard_evolucion_mensual; migraciones 20261123050000_dashboard_utilidad_entregado.sql
 * y 20261123060000_pedidos_cuentan_al_confirmar.sql). Si cambia aquí, cambia allá.
 */
import { fetchAllPages } from './supabasePaginate';

export const STATUS_VENTA_DIRECTA_REALIZADA = ['confirmado', 'entregado', 'facturado'] as const;
export const STATUS_PEDIDO_REALIZADO = ['entregado', 'facturado'] as const;
/** D-061: status de pedido que cuentan cuando la empresa no usa Entregas. */
export const STATUS_PEDIDO_AL_CONFIRMAR = ['confirmado', 'entregado', 'facturado'] as const;

/** Ajuste de la empresa que cambia la regla (D-061). */
export interface AjusteVentasRealizadas {
  /** `empresas.pedidos_cuentan_al_confirmar`: true = pedidos cuentan al confirmarse, por `fecha`. */
  pedidosAlConfirmar?: boolean | null;
}

export interface VentaRealizadaCampos {
  tipo?: string | null;
  status?: string | null;
  fecha?: string | null;
  fecha_entrega?: string | null;
  es_saldo_inicial?: boolean | null;
}

const soloFecha = (f: string | null | undefined): string | null => (f ? String(f).slice(0, 10) : null);

/** Status de pedido que cuentan según el ajuste de la empresa. */
export function statusPedidoRealizado(ajuste?: AjusteVentasRealizadas): readonly string[] {
  return ajuste?.pedidosAlConfirmar ? STATUS_PEDIDO_AL_CONFIRMAR : STATUS_PEDIDO_REALIZADO;
}

/** ¿La operación cuenta como venta realizada (sin importar la fecha)? */
export function esVentaRealizada(v: VentaRealizadaCampos, ajuste?: AjusteVentasRealizadas): boolean {
  if (v.es_saldo_inicial) return false;
  const status = String(v.status ?? '');
  if (v.tipo === 'venta_directa') return (STATUS_VENTA_DIRECTA_REALIZADA as readonly string[]).includes(status);
  if (v.tipo === 'pedido') return statusPedidoRealizado(ajuste).includes(status);
  return false;
}

/**
 * Fecha en que la operación cuenta como venta: directas por fecha; pedidos por entrega
 * (fallback fecha) o, con el ajuste D-061, por fecha del pedido.
 */
export function fechaVentaRealizada(v: VentaRealizadaCampos, ajuste?: AjusteVentasRealizadas): string | null {
  if (v.tipo === 'pedido' && !ajuste?.pedidosAlConfirmar) return soloFecha(v.fecha_entrega) ?? soloFecha(v.fecha);
  return soloFecha(v.fecha);
}

/** ¿Cuenta como venta realizada dentro de [desde, hasta] (fechas YYYY-MM-DD inclusivas)? */
export function ventaRealizadaEnRango(v: VentaRealizadaCampos, desde: string, hasta: string, ajuste?: AjusteVentasRealizadas): boolean {
  if (!esVentaRealizada(v, ajuste)) return false;
  const f = fechaVentaRealizada(v, ajuste);
  return f != null && f >= desde && f <= hasta;
}

/** Une listas quitando repetidos por id (conserva la primera aparición). */
export function unirSinDuplicados<T extends { id?: string | null }>(...listas: T[][]): T[] {
  const vistos = new Set<string>();
  const out: T[] = [];
  for (const lista of listas) {
    for (const fila of lista) {
      const id = fila.id ?? '';
      if (id && vistos.has(id)) continue;
      if (id) vistos.add(id);
      out.push(fila);
    }
  }
  return out;
}

export interface FiltroVentasRealizadas extends AjusteVentasRealizadas {
  empresaId: string;
  desde: string;
  hasta: string;
  /** Columnas a traer. Se agregan siempre id, tipo, status, fecha, fecha_entrega y es_saldo_inicial. */
  select: string;
  vendedorIds?: string[];
  tipo?: 'pedido' | 'venta_directa';
  signal?: AbortSignal;
  /** Filtro extra opcional sobre ambas consultas (p. ej. `.not('vendedor_id','is',null)`). */
  extra?: (q: any) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

const COLUMNAS_BASE = ['id', 'tipo', 'status', 'fecha', 'fecha_entrega', 'es_saldo_inicial'];

/** Asegura que el select traiga las columnas que usa la regla (sin duplicarlas). */
export function selectConColumnasBase(select: string): string {
  // Solo columnas de primer nivel (lo que va entre paréntesis es de tablas relacionadas).
  let nivel = 0;
  let primerNivel = '';
  for (const ch of select) {
    if (ch === '(') nivel++;
    else if (ch === ')') nivel = Math.max(0, nivel - 1);
    else if (nivel === 0) primerNivel += ch;
  }
  const actuales = new Set(primerNivel.split(',').map(s => s.trim()));
  const faltan = COLUMNAS_BASE.filter(c => !actuales.has(c));
  return faltan.length ? `${faltan.join(', ')}, ${select}` : select;
}

/**
 * Filtro PostgREST para pedidos entregados en el rango: por fecha_entrega, o por
 * fecha cuando fecha_entrega es null.
 */
export function filtroPedidosPorEntrega(desde: string, hasta: string): string {
  return `and(fecha_entrega.gte.${desde},fecha_entrega.lte.${hasta}),and(fecha_entrega.is.null,fecha.gte.${desde},fecha.lte.${hasta})`;
}

/**
 * Trae, paginado, las ventas realizadas del rango según D-060: dos consultas
 * (directas por fecha; pedidos entregados por fecha de entrega con respaldo en
 * fecha), unidas y sin repetidos. Con `pedidosAlConfirmar` (D-061) la consulta de
 * pedidos trae confirmados/entregados/facturados por `fecha`. Al final se vuelve a
 * aplicar la regla en memoria como red de seguridad.
 */
export async function fetchVentasRealizadas<T extends VentaRealizadaCampos & { id?: string | null }>(
  client: { from: (tabla: string) => any }, // eslint-disable-line @typescript-eslint/no-explicit-any
  f: FiltroVentasRealizadas,
): Promise<T[]> {
  if (f.tipo !== undefined && f.tipo !== 'pedido' && f.tipo !== 'venta_directa') return [];
  const select = selectConColumnasBase(f.select);
  const vendedores = f.vendedorIds && f.vendedorIds.length > 0 ? f.vendedorIds : null;

  const comun = (q: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    let r = q.eq('empresa_id', f.empresaId).eq('es_saldo_inicial', false);
    if (vendedores) r = vendedores.length === 1 ? r.eq('vendedor_id', vendedores[0]) : r.in('vendedor_id', vendedores);
    if (f.extra) r = f.extra(r);
    return r;
  };
  const conSignal = (q: any) => (f.signal ? q.abortSignal(f.signal) : q); // eslint-disable-line @typescript-eslint/no-explicit-any

  const directas = f.tipo === 'pedido'
    ? Promise.resolve([] as T[])
    : fetchAllPages<T>((from, to) => conSignal(
        comun(client.from('ventas').select(select))
          .eq('tipo', 'venta_directa')
          .in('status', [...STATUS_VENTA_DIRECTA_REALIZADA])
          .gte('fecha', f.desde)
          .lte('fecha', f.hasta)
          .order('id')
          .range(from, to),
      ));

  const ajuste: AjusteVentasRealizadas = { pedidosAlConfirmar: !!f.pedidosAlConfirmar };
  const pedidos = f.tipo === 'venta_directa'
    ? Promise.resolve([] as T[])
    : fetchAllPages<T>((from, to) => {
        const base = comun(client.from('ventas').select(select))
          .eq('tipo', 'pedido')
          .in('status', [...statusPedidoRealizado(ajuste)]);
        const porFecha = ajuste.pedidosAlConfirmar
          ? base.gte('fecha', f.desde).lte('fecha', f.hasta)
          : base.or(filtroPedidosPorEntrega(f.desde, f.hasta));
        return conSignal(porFecha.order('id').range(from, to));
      });

  const [d, p] = await Promise.all([directas, pedidos]);
  return unirSinDuplicados(d, p).filter(v => ventaRealizadaEnRango(v, f.desde, f.hasta, ajuste));
}
