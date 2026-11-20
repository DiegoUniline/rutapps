/**
 * Ventas de prueba para el ticket único (modelo + HTML + ESC/POS).
 * Cada una representa un flujo real: POS contado, ruta crédito, pedido contado
 * sin pago (pago contra entrega), recibo de cobro, venta cancelada, venta sin
 * columnas de desglose.
 */
import type { TicketData } from '@/lib/ticketHtml';
import { buildTicketEjemplo } from '@/lib/ticketEjemplo';
import { buildCobroTicketData } from '@/lib/cobroTicket';

const empresaBase: TicketData['empresa'] = {
  nombre: 'Abarrotera del Sur',
  razon_social: 'Abarrotera del Sur SA de CV',
  rfc: 'ASU010101AAA',
  direccion: 'Av. Juarez 100',
  colonia: 'Centro',
  ciudad: 'Merida',
  estado: 'Yucatan',
  cp: '97000',
  telefono: '999 123 4567',
  email: 'ventas@abarrotera.mx',
  logo_url: null,
  moneda: 'MXN',
  notas_ticket: 'No se aceptan devoluciones despues de 7 dias naturales de la compra',
  ticket_campos: null,
};

/** Venta de ejemplo del diseñador (crédito con abono, gratis, descuento, devolución). */
export const ticketEjemplo: TicketData = buildTicketEjemplo({ ...empresaBase });

/** POS contado: paga en efectivo de más y recibe cambio; sin columnas de desglose. */
export const ticketPosContado: TicketData = {
  empresa: empresaBase,
  folio: 'POS-0042',
  fecha: '2026-11-20',
  clienteNombre: 'Publico general',
  vendedorNombre: 'Cajero 1',
  lineas: [
    { nombre: 'Coca Cola 600ml', cantidad: 3, precio: 18, total: 54, iva_monto: 7.45, ieps_monto: 0, producto_id: 'c1', precio_sugerido_publico: 20 },
    { nombre: 'Sabritas original 45g bolsa grande familiar', cantidad: 2, precio: 21.5, total: 43, iva_monto: 5.93, ieps_monto: 2.95, producto_id: 's1' },
  ],
  subtotal: 80.67,
  iva: 13.38,
  ieps: 2.95,
  total: 97,
  condicionPago: 'contado',
  metodoPago: 'efectivo',
  montoRecibido: 100,
  cambio: 3,
  pagos: [{ metodo: 'efectivo', monto: 100, fecha: '2026-11-20' }],
  promociones: [],
};

/** Ruta crédito sin pago, con saldo anterior (estado de cuenta). */
export const ticketRutaCredito: TicketData = {
  empresa: empresaBase,
  folio: 'R-0101',
  fecha: '20/11/2026',
  clienteNombre: 'Tienda La Esperanza',
  clienteRfc: 'TLE020202BBB',
  clienteTelefono: '999 765 4321',
  clienteDireccion: 'Calle 60 numero 500 por 57 y 59 colonia Centro Historico',
  vendedorNombre: 'Pedro Vendedor',
  vendedorTelefono: '999 000 1111',
  lineas: [
    { nombre: 'Aceite 1L', cantidad: 6, precio: 45, total: 270, iva_monto: 0, ieps_monto: 0, producto_id: 'a1' },
    { nombre: 'Jabon barra', cantidad: 10, precio: 12, total: 120, iva_monto: 16.55, ieps_monto: 0, producto_id: 'j1', descuento_pct: 5 },
  ],
  subtotal: 373.45,
  descuento: 6,
  iva: 16.55,
  ieps: 0,
  total: 390,
  condicionPago: 'credito',
  saldoAnterior: 500,
  saldoNuevo: 890,
  pagos: [],
  promociones: [{ descripcion: '5% jabon', descuento: 6, producto_id: 'j1' }],
};

/** Pedido levantado de contado (pago contra entrega) SIN pago recibido. */
export const ticketPedidoContadoSinPago: TicketData = {
  empresa: empresaBase,
  folio: 'PED-0007',
  fecha: '20/11/2026',
  clienteNombre: 'Miscelanea Lupita',
  vendedorNombre: 'Pedro Vendedor',
  lineas: [
    { nombre: 'Harina 1kg', cantidad: 5, precio: 30, total: 150, iva_monto: 0, ieps_monto: 0, producto_id: 'h1' },
  ],
  subtotal: 150,
  iva: 0,
  ieps: 0,
  total: 150,
  condicionPago: 'contado',
  metodoPago: '',
  pagos: [],
  promociones: [],
};

/** Contado con pago parcial (abona 100 de 150). */
export const ticketContadoParcial: TicketData = {
  ...ticketPedidoContadoSinPago,
  folio: 'PED-0008',
  metodoPago: 'efectivo',
  montoRecibido: 100,
  cambio: 0,
  pagos: [{ metodo: 'efectivo', monto: 100, fecha: '20/11/2026' }],
};

/** Contado pagado completo con cambio (recibe 200 de 150). */
export const ticketContadoTotal: TicketData = {
  ...ticketPedidoContadoSinPago,
  folio: 'PED-0009',
  metodoPago: 'efectivo',
  montoRecibido: 200,
  cambio: 50,
  pagoAplicado: 150,
};

/** Venta cancelada (no debe saldo). */
export const ticketCancelado: TicketData = {
  ...ticketRutaCredito,
  folio: 'R-0102',
  saldoNuevo: undefined,
  saldoAnterior: undefined,
  cancelado: true,
};

/** Recibo de cobro (Cobranza / Aplicar pagos). */
export const ticketCobro: TicketData = buildCobroTicketData({
  empresa: empresaBase,
  cobro: { id: 'abcdef12-3456', fecha: '20/11/2026', monto: 250, metodo_pago: 'transferencia', referencia: 'SPEI 123' },
  clienteNombre: 'Tienda La Esperanza',
  aplicaciones: [{ folio: 'R-0101', monto: 250, saldoAnterior: 890, saldoNuevo: 640 }],
});

export const TODOS_LOS_TICKETS: Record<string, TicketData> = {
  ejemplo: ticketEjemplo,
  posContado: ticketPosContado,
  rutaCredito: ticketRutaCredito,
  pedidoContadoSinPago: ticketPedidoContadoSinPago,
  contadoParcial: ticketContadoParcial,
  contadoTotal: ticketContadoTotal,
  cancelado: ticketCancelado,
  cobro: ticketCobro,
};
