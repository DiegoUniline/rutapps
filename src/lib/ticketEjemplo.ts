/**
 * Venta de ejemplo FIJA para la vista previa del diseñador de ticket
 * (Configuración → Ticket). Cubre todos los bloques que el ticket puede
 * mostrar: producto con promo gratis, producto con descuento, IVA e IEPS,
 * pago parcial, saldo, estado de cuenta y una devolución.
 *
 * Los montos cuadran como una venta real (columnas de desglose guardadas):
 *   Refresco 2L  ×2 · $40 c/u neto · IEPS 8% · IVA 16% · −10% manual → $90.20
 *   Galletas     ×3 · $15 c/u neto · IVA 16%                         → $52.20
 *   Agua 1L      ×1 · $10 neto · IVA 16%                             → GRATIS (promo)
 *   Detergente   ×1 · $50 neto · IVA 16%                             → $58.00
 *   Total $200.40 (IEPS $5.76, IVA $27.64) · crédito con abono de $150
 *   (recibe $200, cambio $50) · saldo anterior $300 → saldo nuevo $350.40.
 */
import type { TicketData, TicketEmpresa } from '@/lib/ticketHtml';
import type { PedidoPdfParams } from '@/lib/pedidoPdf';

export interface EmpresaEjemploInput {
  nombre?: string | null;
  razon_social?: string | null;
  rfc?: string | null;
  direccion?: string | null;
  colonia?: string | null;
  ciudad?: string | null;
  estado?: string | null;
  cp?: string | null;
  telefono?: string | null;
  email?: string | null;
  logo_url?: string | null;
  moneda?: string | null;
  notas_ticket?: string | null;
  ticket_campos?: TicketEmpresa['ticket_campos'];
}

export function buildTicketEjemplo(empresa: EmpresaEjemploInput): TicketData {
  return {
    empresa: {
      nombre: empresa.nombre || 'Mi Empresa',
      razon_social: empresa.razon_social || null,
      rfc: empresa.rfc || null,
      direccion: empresa.direccion || null,
      colonia: empresa.colonia || null,
      ciudad: empresa.ciudad || null,
      estado: empresa.estado || null,
      cp: empresa.cp || null,
      telefono: empresa.telefono || null,
      email: empresa.email || null,
      logo_url: empresa.logo_url || null,
      moneda: empresa.moneda || 'MXN',
      notas_ticket: empresa.notas_ticket || null,
      ticket_campos: empresa.ticket_campos ?? null,
    },
    folio: 'VTA-0001',
    fecha: '14/03/2026',
    clienteNombre: 'Abarrotes Juan Perez',
    clienteRfc: 'XAXX010101000',
    clienteTelefono: '555-123-4567',
    clienteDireccion: 'Calle Reforma 456, Centro',
    vendedorNombre: 'Maria Lopez',
    vendedorTelefono: '555-987-6543',
    lineas: [
      {
        nombre: 'Refresco 2L', codigo: 'REF-2L', cantidad: 2, precio: 45.10, total: 90.20,
        precio_lista_unitario: 40, iva_pct: 16, ieps_pct: 8, iva_monto: 12.44, ieps_monto: 5.76,
        descuento_pct: 10, descuento_manual_monto: 10.02, descuento_promocion_monto: 0,
        producto_id: 'p-ref', precio_sugerido_publico: 60,
      },
      {
        nombre: 'Galletas surtidas', codigo: 'GAL-01', cantidad: 3, precio: 17.40, total: 52.20,
        precio_lista_unitario: 15, iva_pct: 16, ieps_pct: 0, iva_monto: 7.20, ieps_monto: 0,
        descuento_manual_monto: 0, descuento_promocion_monto: 0, producto_id: 'p-gal',
      },
      {
        nombre: 'Agua 1L', codigo: 'AGU-1L', cantidad: 1, precio: 11.60, total: 11.60,
        precio_lista_unitario: 10, iva_pct: 16, ieps_pct: 0, iva_monto: 0, ieps_monto: 0,
        descuento_manual_monto: 0, descuento_promocion_monto: 11.60, producto_id: 'p-agu',
      },
      {
        nombre: 'Detergente 1kg', codigo: 'DET-1K', cantidad: 1, precio: 58, total: 58,
        precio_lista_unitario: 50, iva_pct: 16, ieps_pct: 0, iva_monto: 8, ieps_monto: 0,
        descuento_manual_monto: 0, descuento_promocion_monto: 0, producto_id: 'p-det',
      },
    ],
    subtotal: 167,
    descuento: 21.62,
    iva: 27.64,
    ieps: 5.76,
    total: 200.40,
    condicionPago: 'credito',
    metodoPago: 'efectivo',
    montoRecibido: 200,
    cambio: 50,
    saldoAnterior: 300,
    pagoAplicado: 150,
    saldoNuevo: 350.40,
    promociones: [
      { descripcion: 'Agua gratis en tu compra', descuento: 11.60, producto_id: 'p-agu', tipo: 'producto_gratis', cantidad_gratis: 1 },
    ],
    pagos: [
      { metodo: 'efectivo', monto: 150, fecha: '14/03/2026', referencia: null },
    ],
    devoluciones: [
      { nombre: 'Galletas surtidas', cantidad: 1, motivo: 'caducado', accion: 'nota_credito', monto: 17.40 },
    ],
  };
}

/**
 * La misma venta de ejemplo con la forma de la nota de venta carta (PDF), para
 * la vista previa «Nota de venta» del diseñador: la nota real, generada con
 * `generarPedidoPdf`, obedeciendo las mismas opciones (`ticket_campos`).
 */
export function buildNotaEjemploParams(td: TicketData, logoBase64: string | null): PedidoPdfParams {
  return {
    empresa: {
      nombre: td.empresa.nombre, razon_social: td.empresa.razon_social, rfc: td.empresa.rfc,
      direccion: td.empresa.direccion, colonia: td.empresa.colonia, ciudad: td.empresa.ciudad,
      estado: td.empresa.estado, cp: td.empresa.cp, telefono: td.empresa.telefono,
      email: td.empresa.email, logo_url: td.empresa.logo_url, moneda: td.empresa.moneda,
    },
    logoBase64,
    pedido: {
      folio: td.folio, fecha: '2026-03-14', status: 'confirmado', condicion_pago: td.condicionPago ?? 'contado',
      subtotal: td.subtotal, descuento_total: 18, iva_total: td.iva, ieps_total: td.ieps ?? 0,
      total: td.total, saldo_pendiente: 50.40, notas: null,
    },
    cliente: {
      nombre: td.clienteNombre, rfc: td.clienteRfc, telefono: td.clienteTelefono,
      direccion: td.clienteDireccion,
    },
    vendedor: td.vendedorNombre,
    lineas: td.lineas.map(l => ({
      codigo: l.codigo ?? '',
      nombre: l.nombre,
      cantidad: l.cantidad,
      unidad: 'Pieza',
      precio_unitario: Number(l.precio_lista_unitario ?? l.precio) || 0,
      descuento_pct: Number(l.descuento_pct) || 0,
      iva_pct: Number(l.iva_pct) || 0,
      ieps_pct: Number(l.ieps_pct) || 0,
      total: l.total,
      producto_id: l.producto_id,
      precio_sugerido_publico: l.precio_sugerido_publico,
    })),
    entregas: [],
    pagos: (td.pagos ?? []).map(p => ({ fecha: '2026-03-14', metodo_pago: p.metodo, monto: p.monto, referencia: p.referencia ?? undefined })),
    promociones: (td.promociones ?? []).map(p => ({ descripcion: p.descripcion, descuento: p.descuento, producto_id: p.producto_id })),
    devoluciones: td.devoluciones,
    ticketCampos: td.empresa.ticket_campos ?? null,
    notasTicket: td.empresa.notas_ticket ?? null,
  };
}
