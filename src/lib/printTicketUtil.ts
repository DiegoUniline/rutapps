import { toPng } from 'html-to-image';
import { toast } from 'sonner';
import { buildTicketHTML, type TicketData } from '@/lib/ticketHtml';
import { buildEscPosBytes } from '@/lib/escpos';
import { isBluetoothAvailable, connectPrinter, sendBytes, getConnectedPrinterName } from '@/lib/bluetoothPrinter';

/** Convert a remote image URL to a base64 data-URI, with multiple fallback strategies. */
async function logoUrlToBase64(url: string): Promise<string | null> {
  // Strategy 1: fetch + blob
  try {
    const resp = await fetch(url, { mode: 'cors' });
    if (resp.ok) {
      const blob = await resp.blob();
      return await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });
    }
  } catch { /* fall through */ }

  // Strategy 2: Image element + canvas
  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = url;
    await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = rej; });
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    canvas.getContext('2d')!.drawImage(img, 0, 0);
    return canvas.toDataURL('image/png');
  } catch { /* fall through */ }

  // Strategy 3: cache-bust param
  try {
    const bustUrl = url + (url.includes('?') ? '&' : '?') + '_cb=' + Date.now();
    const resp = await fetch(bustUrl, { mode: 'cors' });
    if (resp.ok) {
      const blob = await resp.blob();
      return await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });
    }
  } catch { /* fall through */ }

  console.warn('[printTicket] Could not convert logo to base64:', url);
  return null;
}

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
      const escposBytes = buildEscPosBytes(td, { ticketAncho });
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

  // ── 2) Fallback: PNG via share/download ──
  // Convert logo to base64 to avoid CORS issues with toPng
  const tdForImage = { ...td, empresa: { ...td.empresa } };
  if (tdForImage.empresa.logo_url && !tdForImage.empresa.logo_url.startsWith('data:')) {
    tdForImage.empresa.logo_url = await logoUrlToBase64(tdForImage.empresa.logo_url);
  }

  const html = buildTicketHTML(tdForImage, { ticketAncho, forPrint: true });
  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.left = '-9999px';
  container.style.top = '0';
  container.innerHTML = html;
  document.body.appendChild(container);
  try {
    await new Promise(r => requestAnimationFrame(() => setTimeout(r, 300)));
    const el = container.firstElementChild as HTMLElement;
    const dataUrl = await toPng(el, { cacheBust: true, pixelRatio: 2, backgroundColor: '#ffffff' });
    const blob = await (await fetch(dataUrl)).blob();
    const file = new File([blob], `${td.folio ?? 'ticket'}.png`, { type: 'image/png' });

    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: `Ticket ${td.folio}` });
    } else {
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = file.name;
      a.click();
      toast.success('Imagen descargada');
    }
  } catch (err: any) {
    if (err?.name !== 'AbortError') toast.error('Error al generar ticket');
  } finally {
    document.body.removeChild(container);
  }
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
      logo_url: empresa?.logo_url ?? null,
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
