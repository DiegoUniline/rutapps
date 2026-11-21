/**
 * Contenido de los PDF por código de Logística (D-051): «Productos cargados»,
 * «Pedidos a entregar» y la «Orden de carga». Mismo contenido y filtros que la
 * pantalla; el dibujo lo hace `generarReportePdf`.
 */
import type { ReportePdfDoc, SeccionReportePdf } from '@/lib/reportePdf';
import { periodoReporte } from '@/lib/reportePdf';
import { fmtDate } from '@/lib/utils';

const num = (n: number) => Number(n || 0).toLocaleString('es-MX');

export interface ProductoCargadoPdf { codigo: string; nombre: string; cargado: number; vendido: number; devuelto: number }
export interface ProductosCargadosPdfData {
  consolidado: ProductoCargadoPdf[];
  vendedores: { vendedor: string; productos: ProductoCargadoPdf[]; totalCargado: number; totalVendido: number; totalDevuelto: number }[];
  totalCargado: number;
  totalVendido: number;
  totalDevuelto: number;
}

const COLS_PRODUCTOS = [
  { header: 'Código' }, { header: 'Producto' },
  { header: 'Cargado', align: 'right' as const }, { header: 'Vendido', align: 'right' as const }, { header: 'Devuelto', align: 'right' as const },
];
const filasProductos = (rows: ProductoCargadoPdf[]) => rows.map(p => [p.codigo, p.nombre, num(p.cargado), num(p.vendido), num(p.devuelto)]);

export function reporteProductosCargadosPdf(
  data: ProductosCargadosPdfData,
  ctx: { desde: string; hasta: string; vendedoresLabel: string; porVendedor: boolean },
): ReportePdfDoc {
  const secciones: SeccionReportePdf[] = [{
    titulo: 'Resumen consolidado',
    columnas: COLS_PRODUCTOS,
    filas: filasProductos(data.consolidado),
    pie: ['', 'Total', num(data.totalCargado), num(data.totalVendido), num(data.totalDevuelto)],
    vacio: 'Sin cargas en el período seleccionado',
  }];
  if (ctx.porVendedor) {
    data.vendedores.forEach((v, i) => secciones.push({
      titulo: i === 0 ? `Detalle por vendedor — ${v.vendedor}` : v.vendedor,
      resumen: `Cargado: ${num(v.totalCargado)} · Vendido: ${num(v.totalVendido)} · Devuelto: ${num(v.totalDevuelto)}`,
      columnas: COLS_PRODUCTOS,
      filas: filasProductos(v.productos),
      nuevaPagina: true,
    }));
  }
  return {
    titulo: 'Productos cargados',
    periodo: periodoReporte(ctx.desde, ctx.hasta),
    filtros: [{ label: 'Vendedores', value: ctx.vendedoresLabel }],
    kpis: [
      { label: 'Productos distintos', value: num(data.consolidado.length) },
      { label: 'Total cargado', value: num(data.totalCargado) },
      { label: 'Total vendido', value: num(data.totalVendido) },
      { label: 'Total devuelto', value: num(data.totalDevuelto) },
    ],
    secciones,
    archivo: `Productos_cargados_${ctx.desde}_${ctx.hasta}`,
  };
}

export interface PedidoEntregarPdf {
  folio: string | null;
  fecha: string;
  fecha_entrega?: string | null;
  cliente: string;
  direccion: string;
  piezas: number;
  total: number;
  status: string;
}
export interface PedidosEntregarPdfData {
  vendedores: { vendedor: string; pedidos: PedidoEntregarPdf[]; totalPedidos: number; totalImporte: number; totalPiezas: number }[];
  totalPedidos: number;
  totalImporte: number;
  totalPiezas: number;
}

export function reportePedidosEntregarPdf(
  data: PedidosEntregarPdfData,
  ctx: { desde: string; hasta: string; vendedoresLabel: string; porVendedor: boolean; fmtMoneda: (n: number) => string },
): ReportePdfDoc {
  const columnas = [
    { header: 'Folio' }, { header: 'Fecha' }, { header: 'Cliente' }, { header: 'Dirección' },
    { header: 'Piezas', align: 'right' as const }, { header: 'Total', align: 'right' as const }, { header: 'Status' },
  ];
  const secciones: SeccionReportePdf[] = data.vendedores.map((v, i) => ({
    titulo: ctx.porVendedor ? v.vendedor : undefined,
    resumen: ctx.porVendedor ? `${v.totalPedidos} pedidos · ${num(v.totalPiezas)} pzas · ${ctx.fmtMoneda(v.totalImporte)}` : undefined,
    columnas,
    filas: v.pedidos.map(p => [p.folio ?? '—', fmtDate(p.fecha_entrega ?? p.fecha), p.cliente, p.direccion, num(p.piezas), ctx.fmtMoneda(p.total), p.status]),
    nuevaPagina: ctx.porVendedor && i > 0,
  }));
  if (secciones.length === 0) secciones.push({ columnas, filas: [], vacio: 'Sin pedidos en el período seleccionado' });
  return {
    titulo: 'Pedidos a entregar',
    periodo: periodoReporte(ctx.desde, ctx.hasta),
    filtros: [{ label: 'Vendedores', value: ctx.vendedoresLabel }],
    kpis: [
      { label: 'Total pedidos', value: num(data.totalPedidos) },
      { label: 'Total piezas', value: num(data.totalPiezas) },
      { label: 'Importe total', value: ctx.fmtMoneda(data.totalImporte) },
    ],
    secciones,
    archivo: `Pedidos_a_entregar_${ctx.desde}_${ctx.hasta}`,
  };
}

export interface OrdenCargaPdfData {
  vendedor: string;
  origen: string;
  destino: string;
  estado: string;
  pedidosAsignados: number;
  productos: { codigo: string; nombre: string; pedido: number; surtido: number }[];
}

export function reporteOrdenCargaPdf(d: OrdenCargaPdfData): ReportePdfDoc {
  const totPedido = d.productos.reduce((s, p) => s + p.pedido, 0);
  const totSurtido = d.productos.reduce((s, p) => s + p.surtido, 0);
  const dif = (n: number) => `${n > 0 ? '+' : ''}${num(n)}${n < 0 ? ' (Quiebre)' : ''}`;
  return {
    titulo: 'Orden de carga',
    periodo: d.estado,
    filtros: [
      { label: 'Vendedor', value: d.vendedor },
      { label: 'Ruta', value: `${d.origen} -> ${d.destino}` },
    ],
    kpis: [
      { label: 'Pedidos asignados', value: num(d.pedidosAsignados) },
      { label: 'Productos', value: num(d.productos.length) },
      { label: 'Pedido', value: num(totPedido) },
      { label: 'Surtido', value: num(totSurtido) },
    ],
    secciones: [{
      columnas: [
        { header: 'Código' }, { header: 'Producto' },
        { header: 'Pedido', align: 'right' }, { header: 'Surtido', align: 'right' }, { header: 'Diferencia', align: 'right' },
      ],
      filas: d.productos.map(p => [p.codigo, p.nombre, num(p.pedido), num(p.surtido), dif(p.surtido - p.pedido)]),
      pie: ['', 'Total', num(totPedido), num(totSurtido), dif(totSurtido - totPedido)],
      vacio: 'Sin productos. Asigna pedidos primero.',
    }],
    archivo: `Orden_de_carga_${d.vendedor}`.replace(/[^\w.-]+/g, '_'),
  };
}
