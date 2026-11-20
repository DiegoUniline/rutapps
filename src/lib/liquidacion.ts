/**
 * Efectivo esperado de la liquidación de ruta — UNA sola fórmula (F0, H6/H8).
 *
 *   esperado = cobros en efectivo − gastos − dinero devuelto por devoluciones
 *              − reembolsos de cancelación/corrección sin turno de caja (D-032)
 *
 * La fuente de verdad es la función SQL `fn_liquidacion_esperado` (teléfono en línea,
 * escritorio y lista). `calcularEfectivoEsperado` es su espejo para el teléfono sin
 * conexión (lee IndexedDB) y para las pruebas.
 */
import { supabase } from '@/lib/supabase';

export interface LiquidacionEsperado {
  cobrosEfectivo: number;
  gastos: number;
  devolucionesDinero: number;
  reembolsos: number;
  esperado: number;
}

const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

export function calcularEfectivoEsperado(p: {
  cobrosEfectivo: number;
  gastos: number;
  devolucionesDinero?: number;
  reembolsos?: number;
}): number {
  return r2(r2(p.cobrosEfectivo) - r2(p.gastos) - r2(p.devolucionesDinero ?? 0) - r2(p.reembolsos ?? 0));
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Convierte la respuesta de `fn_liquidacion_esperado` (jsonb) o de un renglón de `fn_liquidaciones_esperado`. */
export function parseLiquidacionEsperado(raw: unknown): LiquidacionEsperado | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  return {
    cobrosEfectivo: num(o.cobros_efectivo),
    gastos: num(o.gastos),
    devolucionesDinero: num(o.devoluciones_dinero),
    reembolsos: num(o.reembolsos),
    esperado: num(o.esperado),
  };
}

type RpcConDatos = (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
const rpc = () => supabase.rpc.bind(supabase) as unknown as RpcConDatos;

export async function fetchLiquidacionEsperado(args: {
  empresaId: string;
  vendedorId: string | null;
  desde: string;
  hasta: string;
  /** Respaldo de quién cobró si el vendedor no tiene usuario (descarga.user_id). */
  userId?: string | null;
}): Promise<LiquidacionEsperado> {
  const { data, error } = await rpc()('fn_liquidacion_esperado', {
    p_empresa_id: args.empresaId,
    p_vendedor_id: args.vendedorId,
    p_desde: args.desde,
    p_hasta: args.hasta,
    p_user_id: args.userId ?? null,
  });
  if (error) throw new Error(error.message);
  const parsed = parseLiquidacionEsperado(data);
  if (!parsed) throw new Error('No se pudo calcular el efectivo esperado');
  return parsed;
}

/** Cuadre de varias liquidaciones (lista). Por bloques para no pedir miles de cálculos de golpe. */
export async function fetchLiquidacionesEsperado(ids: string[], bloque = 100): Promise<Map<string, LiquidacionEsperado>> {
  const out = new Map<string, LiquidacionEsperado>();
  for (let i = 0; i < ids.length; i += bloque) {
    const { data, error } = await rpc()('fn_liquidaciones_esperado', { p_descarga_ids: ids.slice(i, i + bloque) });
    if (error) throw new Error(error.message);
    for (const row of (Array.isArray(data) ? data : [])) {
      const id = (row as { descarga_id?: unknown }).descarga_id;
      const parsed = parseLiquidacionEsperado(row);
      if (typeof id === 'string' && parsed) out.set(id, parsed);
    }
  }
  return out;
}
