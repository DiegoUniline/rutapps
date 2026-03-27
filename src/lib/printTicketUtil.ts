import { toPng } from 'html-to-image';
import { toast } from 'sonner';
import { buildTicketHTML, type TicketData } from '@/lib/ticketHtml';
import { buildEscPosBytes } from '@/lib/escpos';
import { isBluetoothAvailable, connectPrinter, sendBytes, getConnectedPrinterName } from '@/lib/bluetoothPrinter';


interface PrintOptions {
  ticketAncho?: string;
}

/**
 * Print a thermal ticket via BLE ESC/POS, falling back to PNG share/download.
 */
export async function printTicket(td: TicketData, opts: PrintOptions = {}) {
  const ticketAncho = opts.ticketAncho ?? '58';

  // ── 1) Try Bluetooth ESC/POS ──
  if (isBluetoothAvailable()) {
    try {
      const printerName = getConnectedPrinterName();
      toast.loading(printerName ? `Imprimiendo en ${printerName}…` : 'Conectando impresora…', { id: 'bt-print' });
      const conn = await connectPrinter();
      const escposBytes = await buildEscPosBytes(td, { ticketAncho });
      await sendBytes(conn, escposBytes);
      toast.success(`Impreso en ${conn.device.name ?? 'impresora BLE'}`, { id: 'bt-print' });
      return;
    } catch (err: any) {
      if (err?.name === 'NotFoundError' || err?.message?.includes('cancelled') || err?.message?.includes('User cancelled')) {
        toast.dismiss('bt-print');
        return;
      }
      console.warn('[Print] BT failed, falling back to image:', err?.message);
      toast.error('Bluetooth no disponible, generando imagen…', { id: 'bt-print' });
    }
  }

  // ── 2) Fallback: browser print dialog ──
  const tdForPrint = { ...td, empresa: { ...td.empresa, logo_url: null } };
  const html = buildTicketHTML(tdForPrint, { ticketAncho, forPrint: true });

  // Use an iframe + window.print() — much more reliable than toPng on desktop
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.left = '-9999px';
  iframe.style.top = '0';
  iframe.style.width = '420px';
  iframe.style.height = '800px';
  iframe.style.border = 'none';
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument ?? iframe.contentWindow?.document;
  if (!doc) {
    toast.error('No se pudo abrir ventana de impresión');
    document.body.removeChild(iframe);
    return;
  }

  doc.open();
  doc.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Ticket ${td.folio}</title><style>@media print{@page{margin:0}body{margin:0}}</style></head><body>${html}</body></html>`);
  doc.close();

  // Wait for content to render, then print
  await new Promise(r => setTimeout(r, 300));

  try {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
  } catch {
    // Some browsers block iframe print — fallback to new window
    const win = window.open('', '_blank', 'width=420,height=600');
    if (win) {
      win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Ticket ${td.folio}</title><style>@media print{@page{margin:0}body{margin:0}}</style></head><body>${html}</body></html>`);
      win.document.close();
      setTimeout(() => { win.focus(); win.print(); }, 300);
    } else {
      toast.error('No se pudo abrir ventana de impresión');
    }
  }

  // Clean up iframe after a delay
  setTimeout(() => {
    try { document.body.removeChild(iframe); } catch {}
  }, 2000);
}

/**
 * Build TicketData from common venta fields.
 */
export function buildTicketDataFromVenta(params: {
  empresa: any;
  venta: {
    folio?: string | null;
    fecha: string;
    subtotal?: number;
    iva_total?: number;
    ieps_total?: number;
    total?: number;
    condicion_pago?: string;
    metodo_pago?: string;
  };
  clienteNombre: string;
  lineas: Array<{
    nombre: string;
    cantidad: number;
    precio_unitario: number;
    total: number;
    iva_monto?: number;
    ieps_monto?: number;
    descuento_pct?: number;
  }>;
  montoRecibido?: number;
  cambio?: number;
}): TicketData {
  const { empresa, venta, clienteNombre, lineas } = params;
  return {
    empresa: {
      nombre: empresa?.nombre ?? '',
      rfc: empresa?.rfc ?? null,
      razon_social: empresa?.razon_social ?? null,
      telefono: empresa?.telefono ?? null,
      direccion: empresa?.direccion ?? null,
      colonia: empresa?.colonia ?? null,
      ciudad: empresa?.ciudad ?? null,
      estado: empresa?.estado ?? null,
      cp: empresa?.cp ?? null,
      email: empresa?.email ?? null,
      logo_url: null,
      moneda: empresa?.moneda ?? 'MXN',
      notas_ticket: empresa?.notas_ticket ?? null,
      ticket_campos: empresa?.ticket_campos ?? null,
    },
    folio: venta.folio ?? 'Sin folio',
    fecha: venta.fecha,
    clienteNombre,
    lineas: lineas.map(l => ({
      nombre: l.nombre,
      cantidad: l.cantidad,
      precio: l.precio_unitario,
      total: l.total,
      iva_monto: l.iva_monto ?? 0,
      ieps_monto: l.ieps_monto ?? 0,
      descuento_pct: l.descuento_pct ?? 0,
    })),
    subtotal: venta.subtotal ?? 0,
    iva: venta.iva_total ?? 0,
    ieps: venta.ieps_total ?? 0,
    total: venta.total ?? 0,
    condicionPago: venta.condicion_pago ?? 'contado',
    metodoPago: venta.metodo_pago,
    montoRecibido: params.montoRecibido,
    cambio: params.cambio,
  };
}
