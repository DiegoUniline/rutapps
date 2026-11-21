/**
 * Reportes por código (D-051): lo que antes se imprimía con window.print()
 * ahora sale en PDF con el mismo contenido y filtros de la pantalla.
 */
import { describe, it, expect } from 'vitest';
import { generarReportePdf, periodoReporte, pdfDeReporte } from '@/lib/reportePdf';
import { reporteOrdenCargaPdf, reporteProductosCargadosPdf, reportePedidosEntregarPdf } from '@/lib/logisticaReportesPdf';

const empresa = { nombre: 'Abarrotera del Sur', rfc: 'ASU010101AAA', email: 'ventas@abarrotera.mx' };

/** Texto del PDF: jsPDF escribe cada texto como «(…) Tj» (createDoc no comprime). */
async function textoPdf(blob: Blob): Promise<string> {
  // El Blob de jsdom no tiene arrayBuffer(): se lee con FileReader.
  const raw = await new Promise<string>((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(fr.error);
    fr.readAsBinaryString(blob);
  });
  const out: string[] = [];
  const re = /\(((?:\\.|[^\\)])*)\)\s*Tj/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) out.push(m[1].replace(/\\([()\\])/g, '$1'));
  return out.join('\n');
}

describe('reportePdf', () => {
  it('periodo legible', () => {
    expect(periodoReporte('2026-11-01', '2026-11-30')).toBe('01/11/2026 – 30/11/2026');
    expect(periodoReporte('2026-11-21', '2026-11-21')).toBe('21/11/2026');
  });

  it('dibuja encabezado, filtros, KPIs, tablas con total y el texto de vacío', async () => {
    const blob = await generarReportePdf({
      titulo: 'Reporte de prueba',
      periodo: '01/11/2026 – 30/11/2026',
      filtros: [{ label: 'Vendedor', value: 'Juan Perez' }, { label: 'Estado', value: '' }],
      kpis: [{ label: 'Total', value: '$1,000.00' }],
      secciones: [
        { titulo: 'Ventas', columnas: [{ header: 'Folio' }, { header: 'Total', align: 'right' }], filas: [['V-1', '$400.00'], ['V-2', '$600.00']], pie: ['Total', '$1,000.00'] },
        { titulo: 'Gastos', columnas: [{ header: 'Concepto' }], filas: [], vacio: 'Sin gastos' },
      ],
      archivo: 'prueba',
    }, empresa, null);
    const t = await textoPdf(blob);
    expect(t).toContain('ABARROTERA DEL SUR');
    expect(t).toContain('Reporte de prueba');
    expect(t).toContain('Filtros: Vendedor: Juan Perez');
    expect(t).not.toContain('Estado:');
    expect(t).toContain('TOTAL');
    expect(t).toContain('V-2');
    expect(t).toContain('$1,000.00');
    expect(t).toContain('VENTAS');
    expect(t).toContain('Sin gastos');
    expect(t).toMatch(/Página 1 de 1/);
  });

  it('nombre de archivo seguro', async () => {
    const r = await pdfDeReporte({ titulo: 'X', secciones: [], archivo: 'Orden de carga/Juan' }, empresa);
    expect(r.fileName).toBe('Orden_de_carga_Juan.pdf');
  });
});

describe('logística por código', () => {
  const productos = {
    consolidado: [{ codigo: 'CC6', nombre: 'Coca Cola 600ml', cargado: 30, vendido: 24, devuelto: 6 }],
    vendedores: [
      { vendedor: 'Juan', productos: [{ codigo: 'CC6', nombre: 'Coca Cola 600ml', cargado: 20, vendido: 16, devuelto: 4 }], totalCargado: 20, totalVendido: 16, totalDevuelto: 4 },
      { vendedor: 'Pedro', productos: [{ codigo: 'CC6', nombre: 'Coca Cola 600ml', cargado: 10, vendido: 8, devuelto: 2 }], totalCargado: 10, totalVendido: 8, totalDevuelto: 2 },
    ],
    totalCargado: 30, totalVendido: 24, totalDevuelto: 6,
  };

  it('productos cargados: consolidado + detalle por vendedor solo con varios vendedores', () => {
    const todos = reporteProductosCargadosPdf(productos, { desde: '2026-11-01', hasta: '2026-11-30', vendedoresLabel: 'Todos los vendedores', porVendedor: true });
    expect(todos.secciones).toHaveLength(3);
    expect(todos.secciones[0].pie).toEqual(['', 'Total', '30', '24', '6']);
    expect(todos.filtros).toEqual([{ label: 'Vendedores', value: 'Todos los vendedores' }]);
    const uno = reporteProductosCargadosPdf(productos, { desde: '2026-11-01', hasta: '2026-11-30', vendedoresLabel: 'Juan', porVendedor: false });
    expect(uno.secciones).toHaveLength(1);
  });

  it('pedidos a entregar: un bloque por vendedor con sus pedidos', () => {
    const r = reportePedidosEntregarPdf({
      vendedores: [{ vendedor: 'Juan', pedidos: [{ folio: 'PED-1', fecha: '2026-11-20', fecha_entrega: '2026-11-21', cliente: 'Tienda Uno', direccion: 'Centro', piezas: 12, total: 350, status: 'confirmado' }], totalPedidos: 1, totalImporte: 350, totalPiezas: 12 }],
      totalPedidos: 1, totalImporte: 350, totalPiezas: 12,
    }, { desde: '2026-11-01', hasta: '2026-11-30', vendedoresLabel: 'Todos', porVendedor: true, fmtMoneda: n => `$${n}` });
    expect(r.secciones[0].titulo).toBe('Juan');
    expect(r.secciones[0].filas[0]).toEqual(['PED-1', '21/11/2026', 'Tienda Uno', 'Centro', '12', '$350', 'confirmado']);
  });

  it('orden de carga: diferencia y quiebre como en pantalla, en PDF', async () => {
    const r = reporteOrdenCargaPdf({
      vendedor: 'Juan', origen: 'Almacen', destino: 'Camion 1', estado: 'Borrador', pedidosAsignados: 2,
      productos: [{ codigo: 'CC6', nombre: 'Coca Cola 600ml', pedido: 10, surtido: 8 }, { codigo: 'AG1', nombre: 'Agua', pedido: 5, surtido: 5 }],
    });
    expect(r.secciones[0].filas[0][4]).toBe('-2 (Quiebre)');
    expect(r.secciones[0].pie).toEqual(['', 'Total', '15', '13', '-2 (Quiebre)']);
    const t = await textoPdf(await generarReportePdf(r, empresa, null));
    expect(t).toContain('Orden de carga');
    expect(t).toContain('Ruta: Almacen -> Camion 1');
    expect(t).toContain('-2 (Quiebre)');
  });
});
