// Venta de ruta como UNA sola operación en la cola (fase 2 «NO PERDER VENTAS»).
//
// Hoy la venta de ruta son 5–9 envíos separados (venta, renglones, lotes, promociones,
// cobros, aplicaciones, carga…). Si la app se cierra o falla uno a la mitad, el servidor
// queda con una venta a medias. Con la bandera `ruta_venta_rpc` encendida para la licencia,
// la venta se encola como UN elemento `rpc:fn_ruta_registrar_venta` que la BD aplica en
// una sola transacción e idempotente por id (reenviarla no duplica nada).
//
// Encender por empresa: Panel Master › «Funciones en pruebas» › «Venta de ruta en una sola
// operación» (clave ruta_venta_rpc) → alcance «licencias» con la licencia de la empresa.
// Apagada (o sin cargar las banderas) = camino de siempre.
import { isFeatureEnabled } from './featureFlags';
import { COLA_REGISTRAR_VENTA_RUTA } from './pendientesLocales';

export const BANDERA_VENTA_RUTA_RPC = 'ruta_venta_rpc';
export { COLA_REGISTRAR_VENTA_RUTA };

export function ventaRutaRpcHabilitado(licencia?: string | null): boolean {
  return isFeatureEnabled(BANDERA_VENTA_RUTA_RPC, String(licencia ?? '').trim());
}

export type FilaVenta = Record<string, unknown> & { id: string };

export interface CobroVentaRuta extends FilaVenta {
  aplicaciones: FilaVenta[];
}

export interface CargaVendida {
  carga_id: string;
  lineas: Array<{ producto_id: string; cantidad: number }>;
}

export interface PayloadVentaRuta {
  venta: FilaVenta;
  lineas: FilaVenta[];
  lineas_lotes: FilaVenta[];
  promociones: FilaVenta[];
  cobros: CobroVentaRuta[];
  carga: CargaVendida | null;
}

/** Arma el argumento de fn_ruta_registrar_venta. Valida lo mínimo para no encolar basura. */
export function armarPayloadVentaRuta(p: PayloadVentaRuta): { p_venta: PayloadVentaRuta } {
  if (!p.venta?.id) throw new Error('La venta necesita id');
  if (!p.lineas || p.lineas.length === 0) throw new Error('La venta no tiene productos');
  const ventaId = p.venta.id;
  return {
    p_venta: {
      venta: p.venta,
      lineas: p.lineas.map(l => ({ ...l, venta_id: ventaId })),
      lineas_lotes: p.lineas_lotes.map(l => ({ ...l, venta_id: ventaId })),
      promociones: p.promociones.map(l => ({ ...l, venta_id: ventaId })),
      cobros: p.cobros,
      carga: p.carga && p.carga.lineas.length > 0 ? p.carga : null,
    },
  };
}

/** Suma por producto lo vendido (todas las líneas del carrito, igual que antes). */
export function vendidoPorProducto(items: Array<{ producto_id: string; cantidad: number }>): Array<{ producto_id: string; cantidad: number }> {
  const m = new Map<string, number>();
  for (const it of items) {
    const c = Number(it.cantidad) || 0;
    if (!it.producto_id || c <= 0) continue;
    m.set(it.producto_id, (m.get(it.producto_id) ?? 0) + c);
  }
  return [...m.entries()].map(([producto_id, cantidad]) => ({ producto_id, cantidad }));
}
