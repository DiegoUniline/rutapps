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
    const H = doc.internal.pageSize.getHeight();
    const ML = 14;
    const MR = 14;

    // ── Colores B/N ──
    const BLACK: [number, number, number] = [26, 26, 26];
    const MUTED: [number, number, number] = [110, 110, 110];
    const BORDER: [number, number, number] = [220, 220, 220];

    let y = 14;

    // Logo (máx 12mm ≈ 40px) — única imagen rasterizada
    let leftX = ML;
    try {
      const logo = await loadLogoBase64((empresa as any)?.logo_url);
      if (logo) {
        doc.addImage(logo, 'PNG', ML, 8, 12, 12);
        leftX = ML + 12 + 3;
      }
    } catch { /* noop */ }

    // Empresa — MAYÚSCULAS bold 12pt
    doc.setFontSize(12);
    doc.setFont('courier', 'bold');
    doc.setTextColor(...BLACK);
    doc.text(((empresa as any)?.nombre || '').toUpperCase(), leftX, y);
    y += 4.5;

    // RFC · (no email en esta consulta)
    doc.setFontSize(9);
    doc.setFont('courier', 'normal');
    doc.setTextColor(...MUTED);
    const ids: string[] = [];
    if ((empresa as any)?.rfc) ids.push(`RFC: ${(empresa as any).rfc}`);
    if (ids.length) { doc.text(ids.join('  ·  '), leftX, y); y += 4; }
    if ((empresa as any)?.direccion) { doc.text((empresa as any).direccion, leftX, y); y += 4; }
    if ((empresa as any)?.telefono) { doc.text(`Tel: ${(empresa as any).telefono}`, leftX, y); y += 4; }

    // Derecha
    doc.setFontSize(11);
    doc.setFont('courier', 'bold');
    doc.setTextColor(...BLACK);
    doc.text('RECIBO DE PAGO', W - MR, 14, { align: 'right' });

    doc.setFontSize(9);
    doc.setFont('courier', 'normal');
    doc.setTextColor(...MUTED);
    let ry = 18.5;
    doc.text(`Folio: ${cobro.id.slice(0, 8).toUpperCase()}`, W - MR, ry, { align: 'right' });
    ry += 4;
    doc.text(`Fecha: ${fmtDate(cobro.fecha)}`, W - MR, ry, { align: 'right' });
    ry += 4;
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    doc.text(
      `Generado: ${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}`,
      W - MR, ry, { align: 'right' }
    );
    ry += 4;

    // Divisoria negra 2px
    const divY = Math.max(y, ry) + 2;
    doc.setDrawColor(...BLACK);
    doc.setLineWidth(0.7);
    doc.line(ML, divY, W - MR, divY);
    y = divY + 8;

    // ── Cliente ──
    doc.setFontSize(9);
    doc.setFont('courier', 'bold');
    doc.setTextColor(...MUTED);
    doc.text('CLIENTE', ML, y);
    y += 4.5;
    doc.setFontSize(10.5);
    doc.setFont('courier', 'bold');
    doc.setTextColor(...BLACK);
    doc.text(cliente?.nombre || '—', ML, y);
    y += 4.5;
    doc.setFontSize(9);
    doc.setFont('courier', 'normal');
    doc.setTextColor(...MUTED);
    if ((cliente as any)?.rfc) { doc.text(`RFC: ${(cliente as any).rfc}`, ML, y); y += 4; }
    if ((cliente as any)?.direccion) { doc.text((cliente as any).direccion, ML, y); y += 4; }

    y += 6;

    // ── Tabla aplicaciones (B/N, sin zebra) ──
    // Encabezados
    doc.setFontSize(10);
    doc.setFont('courier', 'bold');
    doc.setTextColor(...BLACK);
    doc.text('Folio', ML + 2, y);
    doc.text('Monto aplicado', W - MR - 2, y, { align: 'right' });
    // Borde inferior negro 1px del encabezado
    doc.setDrawColor(...BLACK);
    doc.setLineWidth(0.4);
    doc.line(ML, y + 2, W - MR, y + 2);
    y += 6;

    doc.setFont('courier', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...BLACK);
    let totalApp = 0;
    const rows: Array<{ folio: string; monto: number }> = [];
    for (const a of (apps ?? []) as any[]) {
      rows.push({ folio: String(a.ventas?.folio || a.venta_id.slice(0, 8)), monto: Number(a.monto_aplicado) });
      totalApp += Number(a.monto_aplicado);
    }
    if (rows.length === 0) {
      rows.push({ folio: 'Pago a cuenta', monto: Number(cobro.monto) });
      totalApp = Number(cobro.monto);
    }
    for (const r of rows) {
      doc.text(r.folio, ML + 2, y);
      doc.text(fmt(r.monto), W - MR - 2, y, { align: 'right' });
      // Borde inferior gris claro 0.5px
      doc.setDrawColor(...BORDER);
      doc.setLineWidth(0.15);
      doc.line(ML, y + 2, W - MR, y + 2);
      y += 5.5;
    }

    // Total con borde superior negro 1px
    y += 2;
    doc.setDrawColor(...BLACK);
    doc.setLineWidth(0.4);
    doc.line(ML, y, W - MR, y);
    y += 6;
    doc.setFontSize(11);
    doc.setFont('courier', 'bold');
    doc.setTextColor(...BLACK);
    doc.text('TOTAL RECIBIDO', ML + 2, y);
    doc.text(fmt(Number(cobro.monto)), W - MR - 2, y, { align: 'right' });
    y += 8;

    // Método y referencia (texto plano)
    doc.setFontSize(9);
    doc.setFont('courier', 'normal');
    doc.setTextColor(...MUTED);
    if (cobro.metodo_pago) { doc.text(`Método de pago: ${cobro.metodo_pago}`, ML, y); y += 4.5; }
    if (cobro.referencia) { doc.text(`Referencia: ${cobro.referencia}`, ML, y); y += 4.5; }

    // ── Footer Rutapp · empresa | Página X de Y ──
    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.2);
    doc.line(ML, H - 13, W - MR, H - 13);
    doc.setFontSize(9);
    doc.setFont('courier', 'normal');
    doc.setTextColor(...MUTED);
    const empresaFooter = (empresa as any)?.nombre || '';
    doc.text(empresaFooter ? `Rutapp · ${empresaFooter}` : 'Rutapp', ML, H - 8);
    doc.text(`Página 1 de 1`, W - MR, H - 8, { align: 'right' });

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
