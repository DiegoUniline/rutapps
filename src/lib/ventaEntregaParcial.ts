/**
 * Detecta si una venta tiene entregas parcialmente surtidas.
 * Se considera parcial cuando la venta NO está en estado 'entregado'/'cancelado'/'facturado'
 * y existe al menos una entrega en status 'hecho' con al menos una línea entregada,
 * pero la suma entregada es menor a la pedida (o hay líneas no surtidas).
 *
 * Cuando la venta ya está 'entregado', también puede ser parcial si alguna entrega hecha
 * tiene líneas con cantidad_entregada < cantidad_pedida (cierre a menor cantidad).
 */
export function isVentaEntregadaParcial(venta: any): boolean {
  const status = venta?.status;
  if (status === 'cancelado' || status === 'borrador') return false;
  const entregas = (venta?.entregas ?? []) as Array<{ status: string; entrega_lineas?: Array<{ cantidad_pedida: number; cantidad_entregada: number }> }>;
  if (!entregas.length) return false;

  let hayHechoConAlgo = false;
  let hayFaltante = false;
  for (const e of entregas) {
    if (e.status !== 'hecho') {
      // hay entregas activas pendientes -> aún no es parcial "terminada"
      if (e.status !== 'cancelado' && e.status !== 'no_entregado') return false;
      continue;
    }
    for (const l of e.entrega_lineas ?? []) {
      const ped = Number(l.cantidad_pedida ?? 0);
      const ent = Number(l.cantidad_entregada ?? 0);
      if (ent > 0) hayHechoConAlgo = true;
      if (ent + 0.0001 < ped) hayFaltante = true;
    }
  }
  return hayHechoConAlgo && hayFaltante;
}
