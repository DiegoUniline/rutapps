/**
 * Build a TicketData for a cobro (payment receipt) that can be printed
 * via the standard printTicket utility.
 */
import type { TicketData, TicketEmpresa } from '@/lib/ticketHtml';

export interface CobroTicketInput {
  empresa: TicketEmpresa;
  cobro: {
    id: string;
    fecha: string;
    monto: number;
    metodo_pago: string;
    referencia?: string | null;
    notas?: string | null;
  };
  clienteNombre: string;
  aplicaciones?: { folio: string | null; monto: number; saldoAnterior: number; saldoNuevo: number }[];
}

export function buildCobroTicketData(input: CobroTicketInput): TicketData {
  const { empresa, cobro, clienteNombre, aplicaciones } = input;

  // Build "lineas" from aplicaciones — each applied sale is a line
  const lineas = (aplicaciones ?? []).map(a => ({
    nombre: `Pago → ${a.folio ?? 'S/F'}`,
    cantidad: 1,
    precio: a.monto,
    total: a.monto,
  }));

  // If no aplicaciones detail, show single line
  if (lineas.length === 0) {
    lineas.push({
      nombre: 'Pago recibido',
      cantidad: 1,
      precio: cobro.monto,
      total: cobro.monto,
    });
  }

  return {
    empresa,
    folio: `COB-${cobro.id.slice(0, 8).toUpperCase()}`,
    fecha: cobro.fecha,
    clienteNombre,
    lineas,
    subtotal: cobro.monto,
    iva: 0,
    total: cobro.monto,
    condicionPago: 'contado',
    metodoPago: cobro.metodo_pago,
    montoRecibido: cobro.monto,
    cambio: 0,
  };
}
