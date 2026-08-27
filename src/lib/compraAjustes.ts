export type DescuentoCompraTipo = 'porcentaje' | 'monto';

export const roundCompra = (value: number) =>
  Math.round((Number(value) + Number.EPSILON) * 100) / 100;

export function calcularTotalesCompra(params: {
  subtotalLineas: number;
  totalLineas: number;
  descuentoExtra?: number | null;
  descuentoExtraTipo?: string | null;
  ajusteTotal?: number | null;
}) {
  const subtotal = roundCompra(Math.max(0, Number(params.subtotalLineas) || 0));
  const totalAntesAjustes = roundCompra(Math.max(0, Number(params.totalLineas) || 0));
  const impuestos = roundCompra(Math.max(0, totalAntesAjustes - subtotal));
  const descuentoCapturado = Math.max(0, Number(params.descuentoExtra) || 0);
  const tipo: DescuentoCompraTipo = params.descuentoExtraTipo === 'porcentaje' ? 'porcentaje' : 'monto';
  const descuentoTotal = roundCompra(Math.min(
    totalAntesAjustes,
    tipo === 'porcentaje'
      ? totalAntesAjustes * Math.min(100, descuentoCapturado) / 100
      : descuentoCapturado,
  ));
  const ajusteTotal = roundCompra(Number(params.ajusteTotal) || 0);
  const total = roundCompra(Math.max(0, totalAntesAjustes - descuentoTotal + ajusteTotal));

  return {
    subtotal,
    iva_total: impuestos,
    total_antes_ajustes: totalAntesAjustes,
    descuento_total: descuentoTotal,
    ajuste_total: ajusteTotal,
    total,
  };
}

export interface LineaCompraProrrateable {
  total: number;
}

/**
 * Distribuye descuento y ajuste del encabezado entre las partidas. La última
 * línea absorbe los centavos residuales para que la suma siempre sea exacta.
 */
export function prorratearAjustesCompra<T extends LineaCompraProrrateable>(
  lineas: T[],
  descuentoTotal: number,
  ajusteTotal: number,
) {
  const totalBruto = roundCompra(lineas.reduce((sum, linea) => sum + Math.max(0, Number(linea.total) || 0), 0));
  const descuentoObjetivo = roundCompra(Math.max(0, Number(descuentoTotal) || 0));
  const ajusteObjetivo = roundCompra(Number(ajusteTotal) || 0);
  let descuentoAsignado = 0;
  let ajusteAsignado = 0;

  return lineas.map((linea, index) => {
    const bruto = roundCompra(Math.max(0, Number(linea.total) || 0));
    const ultima = index === lineas.length - 1;
    const proporcion = totalBruto > 0 ? bruto / totalBruto : 0;
    const descuento_prorrateado = ultima
      ? roundCompra(descuentoObjetivo - descuentoAsignado)
      : roundCompra(descuentoObjetivo * proporcion);
    const ajuste_prorrateado = ultima
      ? roundCompra(ajusteObjetivo - ajusteAsignado)
      : roundCompra(ajusteObjetivo * proporcion);
    descuentoAsignado = roundCompra(descuentoAsignado + descuento_prorrateado);
    ajusteAsignado = roundCompra(ajusteAsignado + ajuste_prorrateado);

    return {
      ...linea,
      descuento_prorrateado,
      ajuste_prorrateado,
      total_neto_linea: roundCompra(Math.max(0, bruto - descuento_prorrateado + ajuste_prorrateado)),
    };
  });
}
