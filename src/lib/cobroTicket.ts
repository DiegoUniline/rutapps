/**
 * Build a TicketData for a cobro (payment receipt) that can be printed
 * via the standard printTicket utility.
 */
import type { TicketData, TicketEmpresa } from '@/lib/ticketHtml';
import { printTicket } from '@/lib/printTicketUtil';

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
  aplicaciones?: { folio: string | null; monto: number; saldoAnterior?: number; saldoNuevo?: number }[];
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
    // Con una sola venta aplicada y saldos conocidos, se imprime el estado de cuenta.
    ...(aplicaciones?.length === 1 && aplicaciones[0].saldoAnterior != null
      ? { saldoAnterior: aplicaciones[0].saldoAnterior, pagoAplicado: aplicaciones[0].monto, saldoNuevo: aplicaciones[0].saldoNuevo }
      : {}),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function empresaToTicket(empresa: any): TicketEmpresa {
  return {
    nombre: empresa?.nombre ?? '',
    rfc: empresa?.rfc ?? null,
    razon_social: empresa?.razon_social ?? null,
    direccion: empresa?.direccion ?? null,
    colonia: empresa?.colonia ?? null,
    ciudad: empresa?.ciudad ?? null,
    estado: empresa?.estado ?? null,
    cp: empresa?.cp ?? null,
    telefono: empresa?.telefono ?? null,
    email: empresa?.email ?? null,
    logo_url: empresa?.logo_url ?? null,
    moneda: empresa?.moneda ?? 'MXN',
    notas_ticket: empresa?.notas_ticket ?? null,
    ticket_campos: empresa?.ticket_campos ?? null,
  };
}

/** Imprime el ticket de un cobro/abono (agente de escritorio, Bluetooth o navegador). */
export function printCobroTicket(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  empresa: any,
  input: Omit<CobroTicketInput, 'empresa'>,
) {
  return printTicket(buildCobroTicketData({ ...input, empresa: empresaToTicket(empresa) }), {
    ticketAncho: empresa?.ticket_ancho ?? '80',
  });
}
