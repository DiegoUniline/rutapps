import { todayLocal } from '@/lib/utils';
import { generarPedidoPdf } from '@/lib/pedidoPdf';
import { loadLogoBase64 } from '@/lib/pdfBase';
import type { Empresa, VentaLinea } from '@/types';

interface PdfParams {
  form: Record<string, any>;
  empresa: Empresa | null;
  profile: { nombre?: string } | null;
  userEmail?: string;
  clienteData: { nombre: string; codigo?: string | null; telefono?: string | null; direccion?: string | null; rfc?: string | null; email?: string | null; facturama_cp?: string | null; colonia?: string | null } | undefined;
  almacenName?: string;
  lineas: Partial<VentaLinea>[];
  productosList: any[];
  entregasExistentes: any[];
  pagosData: any[];
  promociones?: { descripcion: string; descuento: number }[];
}

export async function generarVentaPdf(params: PdfParams): Promise<Blob> {
  const { form, empresa, profile, userEmail, clienteData, almacenName, lineas, productosList, entregasExistentes, pagosData } = params;
  const logo = empresa?.logo_url ? await loadLogoBase64(empresa.logo_url) : null;
  const vendedorName = profile?.nombre || userEmail || '';

  return generarPedidoPdf({
    empresa: {
      nombre: empresa?.nombre ?? '', razon_social: empresa?.razon_social, rfc: empresa?.rfc,
      direccion: empresa?.direccion, colonia: empresa?.colonia, ciudad: empresa?.ciudad,
      estado: empresa?.estado, cp: empresa?.cp, telefono: empresa?.telefono, email: empresa?.email, logo_url: empresa?.logo_url,
    },
    logoBase64: logo,
    pedido: {
      folio: form.folio ?? '', fecha: form.fecha ?? todayLocal(),
      status: form.status ?? 'borrador', condicion_pago: form.condicion_pago ?? 'contado',
      subtotal: form.subtotal ?? 0, descuento_total: form.descuento_total ?? 0,
      iva_total: form.iva_total ?? 0, ieps_total: form.ieps_total ?? 0, total: form.total ?? 0,
      saldo_pendiente: form.saldo_pendiente ?? 0, notas: form.notas,
    },
    cliente: {
      nombre: clienteData?.nombre ?? '—', codigo: clienteData?.codigo ?? undefined,
      telefono: clienteData?.telefono ?? undefined, direccion: clienteData?.direccion ?? undefined,
      rfc: clienteData?.rfc ?? undefined, email: clienteData?.email ?? undefined,
      cp: clienteData?.facturama_cp ?? undefined, colonia: clienteData?.colonia ?? undefined,
    },
    vendedor: vendedorName, almacen: almacenName,
    lineas: lineas.filter(l => l.producto_id).map(l => {
      const prod = productosList?.find((p: any) => p.id === l.producto_id);
      return {
        codigo: prod?.codigo ?? '', nombre: prod?.nombre ?? '', cantidad: Number(l.cantidad) || 0,
        unidad: (l as any).unidad_label || (prod as any)?.unidades_venta?.abreviatura || '',
        precio_unitario: Number(l.precio_unitario) || 0, descuento_pct: Number(l.descuento_pct) || 0,
        iva_pct: Number(l.iva_pct) || 0, ieps_pct: Number(l.ieps_pct) || 0, total: Number(l.total) || 0,
      };
    }),
    entregas: (entregasExistentes ?? []).map(e => ({
      folio: e.folio ?? '', status: e.status,
      lineas: (e.entrega_lineas ?? []).map((el: any) => {
        const prod = productosList?.find((p: any) => p.id === el.producto_id);
        return { codigo: prod?.codigo ?? '', nombre: prod?.nombre ?? '', cantidad_pedida: Number(el.cantidad_entregada) || 0, cantidad_entregada: Number(el.cantidad_entregada) || 0 };
      }),
    })),
    pagos: (pagosData ?? []).map((p: any) => ({
      fecha: p.cobros?.fecha ?? '', metodo_pago: p.cobros?.metodo_pago ?? '',
      monto: Number(p.monto_aplicado) || 0, referencia: p.cobros?.referencia,
    })),
  });
}
