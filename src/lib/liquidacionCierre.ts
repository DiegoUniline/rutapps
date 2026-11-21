/**
 * F3 (D-049): liquidación cerrada.
 *
 * - Al aprobar, la BD congela el desglose del efectivo esperado en
 *   `descarga_ruta.esperado_desglose` (función `fn_liquidacion_desglose`, que a su vez
 *   usa la fórmula única `fn_liquidacion_esperado`). Aprobada = se muestra lo congelado.
 * - Pendiente = mismo desglose calculado en vivo.
 * - Aprobar, rechazar y reabrir son RPC con permiso `logistica.descargas` (la BD ya no
 *   acepta cambios de estado sueltos).
 */
import { supabase } from '@/lib/supabase';

export interface LiquidacionDesglose {
  cobrosEfectivo: number;
  cobrosTransferencia: number;
  cobrosTarjeta: number;
  /** Todos los métodos con dinero real (efectivo, transferencia, tarjeta, otros). */
  cobrosPorMetodo: Record<string, number>;
  cobrosTotal: number;
  cobrosSaldosAnteriores: number;
  gastos: number;
  devolucionesDinero: number;
  reembolsos: number;
  /** devoluciones de dinero + reembolsos de cancelación sin turno. */
  dineroDevuelto: number;
  ventasContado: number;
  ventasContadoN: number;
  ventasCredito: number;
  ventasCreditoN: number;
  esperado: number;
  efectivoEntregado: number;
  diferencia: number;
  calculadoAt: string | null;
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

/** Lee el jsonb de `fn_liquidacion_desglose` / `esperado_desglose` (numeric pueden venir como texto). */
export function parseLiquidacionDesglose(raw: unknown): LiquidacionDesglose | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const metodosRaw = (o.cobros_por_metodo && typeof o.cobros_por_metodo === 'object') ? o.cobros_por_metodo as Record<string, unknown> : {};
  const cobrosPorMetodo: Record<string, number> = {};
  for (const [k, v] of Object.entries(metodosRaw)) cobrosPorMetodo[k] = num(v);
  const devolucionesDinero = num(o.devoluciones_dinero);
  const reembolsos = num(o.reembolsos);
  return {
    cobrosEfectivo: num(o.cobros_efectivo),
    cobrosTransferencia: num(o.cobros_transferencia ?? cobrosPorMetodo.transferencia),
    cobrosTarjeta: num(o.cobros_tarjeta ?? cobrosPorMetodo.tarjeta),
    cobrosPorMetodo,
    cobrosTotal: num(o.cobros_total),
    cobrosSaldosAnteriores: num(o.cobros_saldos_anteriores),
    gastos: num(o.gastos),
    devolucionesDinero,
    reembolsos,
    dineroDevuelto: o.dinero_devuelto != null ? num(o.dinero_devuelto) : r2(devolucionesDinero + reembolsos),
    ventasContado: num(o.ventas_contado),
    ventasContadoN: num(o.ventas_contado_n),
    ventasCredito: num(o.ventas_credito),
    ventasCreditoN: num(o.ventas_credito_n),
    esperado: num(o.esperado),
    efectivoEntregado: num(o.efectivo_entregado),
    diferencia: num(o.diferencia),
    calculadoAt: typeof o.calculado_at === 'string' ? o.calculado_at : null,
  };
}

export interface CambioPosterior {
  concepto: string;
  congelado: number;
  actual: number;
}

const CONCEPTOS: Array<[keyof LiquidacionDesglose, string]> = [
  ['esperado', 'Efectivo esperado'],
  ['cobrosEfectivo', 'Cobros en efectivo'],
  ['cobrosTransferencia', 'Cobros por transferencia'],
  ['cobrosTarjeta', 'Cobros con tarjeta'],
  ['gastos', 'Gastos'],
  ['dineroDevuelto', 'Dinero devuelto a clientes'],
  ['ventasContado', 'Ventas de contado'],
  ['ventasCredito', 'Ventas a crédito'],
  ['cobrosSaldosAnteriores', 'Cobros de saldos anteriores'],
];

/**
 * Compara lo congelado al aprobar contra el cálculo actual (informativo): devuelve los
 * conceptos que cambiaron por movimientos registrados después de aprobar. Lo aprobado
 * no cambia; esto solo avisa.
 */
export function cambiosDespuesDeAprobar(
  congelado: LiquidacionDesglose | null,
  vivo: LiquidacionDesglose | null,
): CambioPosterior[] {
  if (!congelado || !vivo) return [];
  const out: CambioPosterior[] = [];
  for (const [k, concepto] of CONCEPTOS) {
    const a = r2(congelado[k] as number);
    const b = r2(vivo[k] as number);
    if (Math.abs(a - b) >= 0.005) out.push({ concepto, congelado: a, actual: b });
  }
  return out;
}

type RpcConDatos = (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
const rpc = () => supabase.rpc.bind(supabase) as unknown as RpcConDatos;

export async function fetchLiquidacionDesglose(descargaId: string): Promise<LiquidacionDesglose | null> {
  const { data, error } = await rpc()('fn_liquidacion_desglose', { p_descarga_id: descargaId });
  if (error) throw new Error(error.message);
  return parseLiquidacionDesglose(data);
}

export async function aprobarLiquidacion(args: { descargaId: string; notas?: string | null; almacenDestinoId?: string | null }) {
  const { data, error } = await rpc()('aprobar_liquidacion', {
    p_descarga_id: args.descargaId,
    p_notas: args.notas?.trim() || null,
    p_almacen_destino_id: args.almacenDestinoId || null,
  });
  if (error) throw new Error(error.message);
  return parseLiquidacionDesglose(data);
}

export async function rechazarLiquidacion(descargaId: string, motivo: string) {
  if (!motivo.trim()) throw new Error('Escribe el motivo del rechazo');
  const { error } = await rpc()('rechazar_liquidacion', { p_descarga_id: descargaId, p_motivo: motivo.trim() });
  if (error) throw new Error(error.message);
}

export async function reabrirLiquidacion(descargaId: string, motivo: string) {
  if (!motivo.trim()) throw new Error('Escribe el motivo para reabrir la liquidación');
  const { error } = await rpc()('reabrir_liquidacion', { p_descarga_id: descargaId, p_motivo: motivo.trim() });
  if (error) throw new Error(error.message);
}

export interface EventoLiquidacion {
  id: string;
  accion: 'aprobada' | 'rechazada' | 'reabierta';
  motivo: string | null;
  usuario_nombre: string | null;
  created_at: string;
}

export const ACCION_EVENTO_LABEL: Record<EventoLiquidacion['accion'], string> = {
  aprobada: 'Aprobada',
  rechazada: 'Rechazada',
  reabierta: 'Reabierta',
};
