/**
 * Convierte las props del comprobante en pantalla (`TicketVenta`) al `TicketData`
 * del ticket único. Un solo lugar: la pantalla, la impresión y el texto para
 * compartir parten del mismo objeto, así salen iguales.
 */
import type { TicketData, TicketEmpresa } from '@/lib/ticketHtml';
import { getNombreTicket } from '@/lib/productoNombres';

export interface TicketVentaLinea {
  nombre: string;
  codigo?: string | null;
  cantidad: number;
  precio: number;
  subtotal?: number;
  iva_pct?: number;
  iva_monto?: number;
  ieps_pct?: number;
  ieps_monto?: number;
  descuento_pct?: number;
  precio_lista_unitario?: number | null;
  descuento_promocion_monto?: number;
  descuento_manual_monto?: number;
  total: number;
  esCambio?: boolean;
  producto_id?: string;
  precio_sugerido_publico?: number;
}

export interface TicketVentaDatos {
  empresa: TicketEmpresa;
  folio: string;
  fecha: string;
  clienteNombre: string;
  clienteRfc?: string | null;
  clienteTelefono?: string | null;
  clienteDireccion?: string | null;
  vendedorNombre?: string;
  vendedorTelefono?: string | null;
  lineas: TicketVentaLinea[];
  subtotal: number;
  iva: number;
  ieps?: number;
  /** Descuento total del encabezado. Si no viene: devolución aplicada + promociones. */
  descuento?: number;
  descuentoDevolucion?: number;
  devoluciones?: { nombre: string; cantidad: number; motivo: string; accion: string; monto: number }[];
  total: number;
  condicionPago: string;
  metodoPago?: string;
  montoRecibido?: number;
  cambio?: number;
  saldoAnterior?: number;
  pagoAplicado?: number;
  saldoNuevo?: number;
  promociones?: { descripcion: string; descuento: number; producto_id?: string; tipo?: string; cantidad_gratis?: number }[];
  pagos?: { metodo: string; monto: number; fecha?: string | null; referencia?: string | null }[];
  /** Catálogo en caché: resuelve nombre de ticket y código sin consultas nuevas. */
  productosList?: Array<{ id: string; codigo?: string | null; nombre?: string | null; nombre_ticket?: string | null; nombre_venta?: string | null }>;
}

export function ticketVentaADatos(p: TicketVentaDatos): TicketData {
  const promociones = p.promociones ?? [];
  const descuentoPromos = promociones.reduce((s, x) => s + (Number(x.descuento) || 0), 0);
  return {
    empresa: p.empresa,
    folio: p.folio,
    fecha: p.fecha,
    clienteNombre: p.clienteNombre,
    clienteRfc: p.clienteRfc ?? null,
    clienteTelefono: p.clienteTelefono ?? null,
    clienteDireccion: p.clienteDireccion ?? null,
    vendedorNombre: p.vendedorNombre,
    vendedorTelefono: p.vendedorTelefono ?? null,
    lineas: p.lineas.map(l => {
      const prod = l.producto_id ? p.productosList?.find(x => x.id === l.producto_id) : undefined;
      return {
        nombre: prod ? getNombreTicket(prod, l.nombre) : l.nombre,
        codigo: l.codigo ?? prod?.codigo ?? null,
        cantidad: l.cantidad,
        precio: l.precio,
        total: l.total,
        iva_monto: l.iva_monto,
        ieps_monto: l.ieps_monto,
        iva_pct: l.iva_pct,
        ieps_pct: l.ieps_pct,
        descuento_pct: l.descuento_pct,
        precio_lista_unitario: l.precio_lista_unitario,
        descuento_promocion_monto: l.descuento_promocion_monto,
        descuento_manual_monto: l.descuento_manual_monto,
        esCambio: l.esCambio,
        producto_id: l.producto_id,
        precio_sugerido_publico: l.precio_sugerido_publico,
      };
    }),
    subtotal: p.subtotal,
    descuento: p.descuento ?? ((p.descuentoDevolucion ?? 0) + descuentoPromos),
    iva: p.iva,
    ieps: p.ieps ?? 0,
    total: p.total,
    condicionPago: p.condicionPago,
    metodoPago: p.metodoPago,
    montoRecibido: p.montoRecibido,
    cambio: p.cambio,
    saldoAnterior: p.saldoAnterior,
    pagoAplicado: p.pagoAplicado,
    saldoNuevo: p.saldoNuevo,
    promociones,
    pagos: p.pagos ?? [],
    devoluciones: p.devoluciones ?? [],
  };
}
