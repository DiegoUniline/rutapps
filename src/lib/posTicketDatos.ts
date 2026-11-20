/**
 * Datos del ticket del POS (comprobante en pantalla, impresión automática,
 * botón Imprimir y Reimprimir) desde la última venta registrada. Un solo lugar
 * para que las cuatro salidas muestren lo mismo.
 */
import type { TicketVentaDatos, TicketVentaLinea } from '@/lib/ticketVentaData';

/** Lo que guarda el POS en `lastVentaData` al registrar la venta. */
export interface PosUltimaVenta {
  folio: string;
  fecha: string;
  clienteNombre: string;
  clienteRfc?: string | null;
  clienteTelefono?: string | null;
  clienteDireccion?: string | null;
  vendedorTelefono?: string | null;
  lineas: TicketVentaLinea[];
  subtotal: number;
  iva: number;
  ieps: number;
  total: number;
  condicionPago: string;
  metodoPago?: string;
  montoRecibido?: number;
  cambio?: number;
  saldoAnterior?: number;
  saldoNuevoCalc?: number;
  promoDetails?: TicketVentaDatos['promociones'];
  pagos?: TicketVentaDatos['pagos'];
}

interface EmpresaPos {
  nombre?: string | null;
  telefono?: string | null;
  direccion?: string | null;
  logo_url?: string | null;
  rfc?: string | null;
  moneda?: string | null;
  razon_social?: string | null;
  colonia?: string | null;
  ciudad?: string | null;
  estado?: string | null;
  cp?: string | null;
  email?: string | null;
  notas_ticket?: string | null;
  ticket_campos?: TicketVentaDatos['empresa']['ticket_campos'];
}

export function posTicketDatos(
  venta: PosUltimaVenta,
  empresa: EmpresaPos | null | undefined,
  profile: { nombre?: string | null; telefono?: string | null } | null | undefined,
  productos: TicketVentaDatos['productosList'] | null | undefined,
): TicketVentaDatos {
  return {
    empresa: {
      nombre: empresa?.nombre ?? '',
      telefono: empresa?.telefono ?? null,
      direccion: empresa?.direccion ?? null,
      logo_url: empresa?.logo_url ?? null,
      rfc: empresa?.rfc ?? null,
      moneda: empresa?.moneda ?? null,
      razon_social: empresa?.razon_social ?? null,
      colonia: empresa?.colonia ?? null,
      ciudad: empresa?.ciudad ?? null,
      estado: empresa?.estado ?? null,
      cp: empresa?.cp ?? null,
      email: empresa?.email ?? null,
      notas_ticket: empresa?.notas_ticket ?? null,
      ticket_campos: empresa?.ticket_campos ?? null,
    },
    folio: venta.folio,
    fecha: venta.fecha,
    clienteNombre: venta.clienteNombre,
    clienteRfc: venta.clienteRfc ?? null,
    clienteTelefono: venta.clienteTelefono ?? null,
    clienteDireccion: venta.clienteDireccion ?? null,
    vendedorNombre: profile?.nombre ?? '',
    vendedorTelefono: venta.vendedorTelefono ?? profile?.telefono ?? null,
    lineas: venta.lineas,
    subtotal: venta.subtotal,
    iva: venta.iva,
    ieps: venta.ieps,
    total: venta.total,
    condicionPago: venta.condicionPago,
    metodoPago: venta.metodoPago,
    montoRecibido: venta.montoRecibido,
    cambio: venta.cambio,
    saldoAnterior: venta.saldoAnterior,
    saldoNuevo: venta.saldoNuevoCalc,
    promociones: venta.promoDetails ?? [],
    // El POS de contado siempre registra el cobro (buildPosTicketPayments): son pagos reales.
    pagos: venta.pagos ?? [],
    productosList: productos ?? undefined,
  };
}
