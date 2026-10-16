/**
 * Promociones de una venta YA GUARDADA, tomadas de lo persistido
 * (`promocion_aplicada` y, de respaldo, el desglose de `venta_lineas`).
 *
 * Nunca se reevalúa el motor con la configuración actual: una reimpresión o
 * consulta histórica siempre coincide con lo que se cobró, aunque después se
 * edite o desactive la promoción.
 */
import type { PromoResult } from '@/hooks/usePromociones';

type LineaPersistida = {
  id?: string | null;
  producto_id?: string | null;
  cantidad?: number | null;
  promocion_id?: string | null;
  promocion_nombre?: string | null;
  descuento_promocion_monto?: number | null;
  cantidad_bonificada?: number | null;
};

type PromoAplicadaPersistida = {
  venta_linea_id?: string | null;
  promocion_id?: string | null;
  descripcion?: string | null;
  descuento_aplicado?: number | null;
  promocion_nombre?: string | null;
  tipo?: string | null;
  cantidad_gratis?: number | null;
};

const r2 = (n: number) => Math.round(n * 100) / 100;

export function promosPersistidasDeVenta(
  lineas: LineaPersistida[],
  aplicadas?: PromoAplicadaPersistida[] | null,
): PromoResult[] {
  const lineaPorId = new Map<string, LineaPersistida>();
  for (const l of lineas ?? []) if (l?.id) lineaPorId.set(l.id, l);

  const out: PromoResult[] = [];
  for (const a of aplicadas ?? []) {
    const monto = r2(Number(a?.descuento_aplicado) || 0);
    if (monto <= 0 || !a?.promocion_id) continue;
    const linea = a.venta_linea_id ? lineaPorId.get(a.venta_linea_id) : undefined;
    // Filas anteriores al snapshot no traen tipo/cantidad: se infieren de la línea.
    const bonificada = Number(a.cantidad_gratis ?? linea?.cantidad_bonificada) || 0;
    const tipo = (a.tipo as PromoResult['tipo']) || (bonificada > 0 ? 'producto_gratis' : 'descuento_monto');
    out.push({
      promocion_id: a.promocion_id,
      nombre: a.promocion_nombre ?? linea?.promocion_nombre ?? a.descripcion ?? 'Promoción',
      tipo,
      producto_id: linea?.producto_id ?? undefined,
      ...(a.venta_linea_id ? { linea_key: a.venta_linea_id } : {}),
      descuento: monto,
      descripcion: a.descripcion ?? a.promocion_nombre ?? 'Promoción',
      ...(tipo === 'producto_gratis' ? { producto_gratis_id: linea?.producto_id ?? undefined, cantidad_gratis: bonificada } : {}),
    });
  }
  if (out.length > 0) return out;

  // Respaldo: desglose informativo guardado en la propia línea.
  for (const l of lineas ?? []) {
    const monto = r2(Number(l?.descuento_promocion_monto) || 0);
    if (monto <= 0.005 || !l?.promocion_nombre) continue;
    const bonificada = Number(l.cantidad_bonificada) || 0;
    const tipo: PromoResult['tipo'] = bonificada > 0 ? 'producto_gratis' : 'descuento_monto';
    out.push({
      promocion_id: l.promocion_id ?? l.promocion_nombre,
      nombre: l.promocion_nombre,
      tipo,
      producto_id: l.producto_id ?? undefined,
      ...(l.id ? { linea_key: l.id } : {}),
      descuento: monto,
      descripcion: l.promocion_nombre,
      ...(tipo === 'producto_gratis' ? { producto_gratis_id: l.producto_id ?? undefined, cantidad_gratis: bonificada } : {}),
    });
  }
  return out;
}
