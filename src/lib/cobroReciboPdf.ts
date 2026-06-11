import { supabase } from '@/lib/supabase';
import { fmtMoney } from '@/lib/currency';
import { loadLogoBase64 } from '@/lib/pdfBase';

interface CobroData {
  id: string;
  empresa_id: string;
  cliente_id: string;
  monto: number;
  metodo_pago: string | null;
  referencia: string | null;
  fecha: string | null;
}
interface AplicacionData {
  venta_id: string;
  monto_aplicado: number;
  folio?: string;
  saldoAnterior?: number;
  saldoNuevo?: number;
}

const fmtDate = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(iso)) : '';

/**
 * Genera el PDF del recibo de cobro y lo sube al bucket privado `recibos-cobros`.
 * Devuelve la URL firmada (30 días) o null si falla.
 */
export async function generarYSubirReciboCobro(cobroId: string, empresaId: string): Promise<string | null> {
  try {
    const { jsPDF } = await import('jspdf');

    // Cargar datos
    const { data: cobro } = await supabase
      .from('cobros')
      .select('id, empresa_id, cliente_id, monto, metodo_pago, referencia, fecha')
      .eq('id', cobroId)
      .single<CobroData>();
    if (!cobro) return null;

    const { data: empresa } = await supabase
      .from('empresas')
      .select('nombre, rfc, direccion, telefono, logo_url, moneda')
      .eq('id', empresaId)
      .single();
    const { data: cliente } = await supabase
      .from('clientes')
      .select('nombre, rfc, direccion')
      .eq('id', cobro.cliente_id)
      .single();
    const { data: apps } = await supabase
      .from('cobro_aplicaciones')
      .select('venta_id, monto_aplicado, ventas(folio, saldo_pendiente, total)')
      .eq('cobro_id', cobroId);

    const moneda = (empresa as any)?.moneda || 'MXN';
    const fmt = (n: number) => fmtMoney(n);

    const doc = new jsPDF({ unit: 'mm', format: 'letter' });
    const W = doc.internal.pageSize.getWidth();
    let y = 15;

    // Logo
    try {
      const logo = await loadLogoBase64((empresa as any)?.logo_url);
      if (logo) doc.addImage(logo, 'PNG', 15, y, 25, 25);
    } catch { /* noop */ }

    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text((empresa as any)?.nombre || '', 45, y + 7);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    if ((empresa as any)?.rfc) doc.text(`RFC: ${(empresa as any).rfc}`, 45, y + 13);
    if ((empresa as any)?.direccion) doc.text((empresa as any).direccion, 45, y + 18);
    if ((empresa as any)?.telefono) doc.text(`Tel: ${(empresa as any).telefono}`, 45, y + 23);

    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('RECIBO DE PAGO', W - 15, y + 10, { align: 'right' });
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`No. ${cobro.id.slice(0, 8).toUpperCase()}`, W - 15, y + 16, { align: 'right' });
    doc.text(`Fecha: ${fmtDate(cobro.fecha)}`, W - 15, y + 21, { align: 'right' });

    y += 35;
    doc.setDrawColor(220);
    doc.line(15, y, W - 15, y);
    y += 7;

    // Cliente
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Cliente:', 15, y);
    doc.setFont('helvetica', 'normal');
    doc.text(cliente?.nombre || '—', 35, y);
    y += 5;
    if ((cliente as any)?.rfc) { doc.text(`RFC: ${(cliente as any).rfc}`, 15, y); y += 5; }
    if ((cliente as any)?.direccion) { doc.text((cliente as any).direccion, 15, y); y += 5; }

    y += 5;
    // Tabla aplicaciones
    doc.setFillColor(245);
    doc.rect(15, y, W - 30, 7, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('Folio', 18, y + 5);
    doc.text('Monto aplicado', W - 18, y + 5, { align: 'right' });
    y += 10;
    doc.setFont('helvetica', 'normal');
    let totalApp = 0;
    for (const a of (apps ?? []) as any[]) {
      doc.text(a.ventas?.folio || a.venta_id.slice(0, 8), 18, y);
      doc.text(fmt(Number(a.monto_aplicado)), W - 18, y, { align: 'right' });
      y += 6;
      totalApp += Number(a.monto_aplicado);
    }
    if (!apps || apps.length === 0) {
      doc.text('Pago a cuenta', 18, y);
      doc.text(fmt(Number(cobro.monto)), W - 18, y, { align: 'right' });
      y += 6;
      totalApp = Number(cobro.monto);
    }
    y += 4;
    doc.line(15, y, W - 15, y);
    y += 7;

    // Total
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('TOTAL RECIBIDO:', W - 60, y);
    doc.text(fmt(Number(cobro.monto)), W - 18, y, { align: 'right' });
    y += 10;

    // Método
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    if (cobro.metodo_pago) { doc.text(`Método de pago: ${cobro.metodo_pago}`, 15, y); y += 5; }
    if (cobro.referencia) { doc.text(`Referencia: ${cobro.referencia}`, 15, y); y += 5; }

    // Footer
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(`Generado el ${new Date().toLocaleString('es-MX')} · rutapp.mx`, W / 2, doc.internal.pageSize.getHeight() - 10, { align: 'center' });

    const blob = doc.output('blob');
    const path = `${empresaId}/${cobroId}.pdf`;

    const { error: upErr } = await supabase.storage
      .from('recibos-cobros')
      .upload(path, blob, { contentType: 'application/pdf', upsert: true });
    if (upErr) {
      console.error('upload recibo error', upErr);
      return null;
    }

    const { data: signed } = await supabase.storage
      .from('recibos-cobros')
      .createSignedUrl(path, 60 * 60 * 24 * 30); // 30 días
    return signed?.signedUrl || null;
  } catch (e) {
    console.error('generarYSubirReciboCobro', e);
    return null;
  }
}
