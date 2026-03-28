/**
 * Generate a Venta/Pedido PDF from just a venta ID.
 * Fetches all needed data from the database, generates PDF blob.
 */
import { supabase } from '@/lib/supabase';
import { generarPedidoPdf } from '@/lib/pedidoPdf';
import { loadLogoBase64 } from '@/lib/pdfBase';

export async function generateVentaPdfById(ventaId: string, empresaId?: string): Promise<{ blob: Blob; fileName: string; caption: string }> {
  // Fetch venta with relations
  const { data: venta, error } = await supabase
    .from('ventas')
    .select('*, clientes(nombre, codigo, telefono, direccion, rfc, email, facturama_cp, colonia), vendedores(nombre), almacenes(nombre), venta_lineas(*, productos(id, codigo, nombre))')
    .eq('id', ventaId)
    .single();

  if (error || !venta) throw new Error('No se pudo cargar la venta');

  // Fetch empresa - use provided empresaId or fall back to venta's empresa_id
  const eid = empresaId || (venta as any).empresa_id;
  if (!eid) throw new Error('Sin empresa');
  const { data: empresa } = await supabase.from('empresas').select('*').eq('id', eid).single();

  // Fetch pagos
  const { data: pagos } = await supabase
    .from('cobro_aplicaciones')
    .select('monto_aplicado, cobros(fecha, metodo_pago, referencia)')
    .eq('venta_id', ventaId);

  const logo = empresa?.logo_url ? await loadLogoBase64(empresa.logo_url) : null;

  const blob = generarPedidoPdf({
    empresa: {
      nombre: empresa?.nombre ?? '',
      razon_social: empresa?.razon_social,
      rfc: empresa?.rfc,
      direccion: empresa?.direccion,
      colonia: empresa?.colonia,
      ciudad: empresa?.ciudad,
      estado: empresa?.estado,
      cp: empresa?.cp,
      telefono: empresa?.telefono,
      email: empresa?.email,
      logo_url: empresa?.logo_url,
    },
    logoBase64: logo,
    pedido: {
      folio: venta.folio ?? '',
      fecha: venta.fecha ?? '',
      status: venta.status ?? 'borrador',
      condicion_pago: venta.condicion_pago ?? 'contado',
      subtotal: venta.subtotal ?? 0,
      descuento_total: venta.descuento_total ?? 0,
      iva_total: venta.iva_total ?? 0,
      ieps_total: venta.ieps_total ?? 0,
      total: venta.total ?? 0,
      saldo_pendiente: venta.saldo_pendiente ?? 0,
      notas: venta.notas,
    },
    cliente: {
      nombre: (venta as any).clientes?.nombre ?? '—',
      codigo: (venta as any).clientes?.codigo,
      telefono: (venta as any).clientes?.telefono,
      direccion: (venta as any).clientes?.direccion,
      rfc: (venta as any).clientes?.rfc,
      email: (venta as any).clientes?.email,
      cp: (venta as any).clientes?.facturama_cp,
      colonia: (venta as any).clientes?.colonia,
    },
    vendedor: (venta as any).vendedores?.nombre,
    almacen: (venta as any).almacenes?.nombre,
    lineas: ((venta as any).venta_lineas ?? []).filter((l: any) => l.producto_id).map((l: any) => ({
      codigo: l.productos?.codigo ?? '',
      nombre: l.productos?.nombre ?? l.descripcion ?? '',
      cantidad: Number(l.cantidad) || 0,
      unidad: '',
      precio_unitario: Number(l.precio_unitario) || 0,
      descuento_pct: Number(l.descuento_pct) || 0,
      iva_pct: Number(l.iva_pct) || 0,
      ieps_pct: Number(l.ieps_pct) || 0,
      total: Number(l.total) || 0,
    })),
    entregas: [],
    pagos: (pagos ?? []).map((p: any) => ({
      fecha: p.cobros?.fecha ?? '',
      metodo_pago: p.cobros?.metodo_pago ?? '',
      monto: Number(p.monto_aplicado) || 0,
      referencia: p.cobros?.referencia,
    })),
  });

  const folio = venta.folio || ventaId.slice(0, 8);
  const tipoLabel = venta.tipo === 'pedido' ? 'Pedido' : 'Venta';
  const clienteNombre = (venta as any).clientes?.nombre ?? '';
  const total = (venta.total ?? 0).toLocaleString('es-MX', { minimumFractionDigits: 2 });

  return {
    blob,
    fileName: `${folio}.pdf`,
    caption: `📄 *${tipoLabel} ${folio}*\nCliente: ${clienteNombre}\n💰 Total: $${total}`,
  };
}
