export interface VentaFacturacionSource {
  requiere_factura?: boolean | null;
  clientes?: {
    requiere_factura?: boolean | null;
    rfc?: string | null;
    facturama_rfc?: string | null;
  } | null;
}

export type EstadoFacturacionVenta = 'no_requiere' | 'lista' | 'rfc_pendiente';

/**
 * Determina la señal operativa de facturación de una venta.
 *
 * La intención explícita (`requiere_factura`) es la fuente de verdad; tener RFC
 * capturado no implica por sí mismo que el cliente haya solicitado factura. La
 * bandera guardada en la venta conserva el dato histórico y la del cliente
 * permite identificar ventas anteriores cuyo encabezado no lo almacenó.
 */
export function getVentaFacturacion(venta: VentaFacturacionSource): {
  requiereFactura: boolean;
  rfc: string | null;
  estado: EstadoFacturacionVenta;
} {
  const requiereFactura = venta.requiere_factura === true
    || venta.clientes?.requiere_factura === true;
  const rfc = normalizarRfc(venta.clientes?.facturama_rfc)
    ?? normalizarRfc(venta.clientes?.rfc);

  return {
    requiereFactura,
    rfc,
    estado: !requiereFactura ? 'no_requiere' : rfc ? 'lista' : 'rfc_pendiente',
  };
}

function normalizarRfc(value?: string | null): string | null {
  const normalized = value?.trim().toUpperCase();
  return normalized || null;
}
