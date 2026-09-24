import { describe, expect, it, vi, afterEach } from 'vitest';
import { buildConcentradoReport, UNASSIGNED, type ReportSource } from '@/lib/concentradoReport';
import { createConcentradoPdf, createConcentradoWorkbook, type ConcentradoExportOptions } from '@/lib/concentradoReportExport';
import * as XLSX from 'xlsx';

const source: ReportSource = {
  orders: [
    { id: 'a', folio: 'P-1', vendedor_id: 'v1', vendedor: { nombre: 'Ana' } },
    { id: 'b', folio: 'P-2', vendedor_id: 'v2', vendedor: { nombre: 'Ana' } },
    { id: 'c', folio: 'P-3', vendedor_id: null, vendedor: null },
  ],
  saleLines: [
    { id: '1', venta_id: 'a', producto_id: 'p', cantidad: 10, descripcion: null, productos: { codigo: 'P', nombre: 'Producto' } },
    { id: '2', venta_id: 'a', producto_id: 'p', cantidad: 5, descripcion: null, productos: { codigo: 'P', nombre: 'Producto' } },
    { id: '3', venta_id: 'b', producto_id: 'p', cantidad: 4, descripcion: null, productos: { codigo: 'P', nombre: 'Producto' } },
    { id: '4', venta_id: 'c', producto_id: 'q', cantidad: 0.5, descripcion: null, productos: { codigo: 'Q', nombre: 'Segundo' } },
  ],
  deliveries: [
    { id: 'e1', pedido_id: 'a', status: 'surtido', vendedor_ruta_id: 'r1', ruta: { nombre: 'Ruta 2' } },
    { id: 'e2', pedido_id: 'a', status: 'cargado', vendedor_ruta_id: 'r1', ruta: { nombre: 'Ruta 2' } },
    { id: 'e3', pedido_id: 'b', status: 'hecho', vendedor_ruta_id: 'r2', ruta: { nombre: 'Ruta 3' } },
    { id: 'e4', pedido_id: 'a', status: 'cancelado', vendedor_ruta_id: 'r3', ruta: { nombre: 'Cancelada' } },
    { id: 'e5', pedido_id: 'a', status: 'borrador', vendedor_ruta_id: 'r1', ruta: { nombre: 'Ruta 2' } },
  ],
  deliveryLines: [
    { entrega_id: 'e1', producto_id: 'p', cantidad_entregada: 3 },
    { entrega_id: 'e2', producto_id: 'p', cantidad_entregada: 5 },
    { entrega_id: 'e3', producto_id: 'p', cantidad_entregada: 6 },
    { entrega_id: 'e4', producto_id: 'p', cantidad_entregada: 100 },
    { entrega_id: 'e5', producto_id: 'p', cantidad_entregada: 100 },
  ],
};
const all = { grouping: 'general' as const, routeIds: [], sellerIds: [] };
describe('hoja de surtido: cantidades y agrupación', () => {
  it('suma líneas repetidas, descuenta parciales una vez y no cruza excedentes entre pedidos', () => {
    const [report] = buildConcentradoReport(source, all);
    expect(report.orderCount).toBe(3);
    expect(report.products[0]).toMatchObject({ requerido: 19, surtido: 14, pendiente: 7 });
    expect(report.products[1].requerido).toBe(0.5);
    expect(report.folios).toEqual(['P-1', 'P-2', 'P-3']);
  });
  it('combina filtros de ruta y vendedor, sin incluir otras ventas', () => {
    const groups = buildConcentradoReport(source, { ...all, routeIds: ['r1'], sellerIds: ['v1'] });
    expect(groups[0].folios).toEqual(['P-1']);
    expect(groups[0].products[0]).toMatchObject({ requerido: 15, surtido: 8, pendiente: 7 });
    expect(buildConcentradoReport(source, { ...all, routeIds: ['r1'], sellerIds: ['v2'] })).toEqual([]);
  });
  it('separa vendedores homónimos por identidad y conserva pedidos sin asignar', () => {
    expect(buildConcentradoReport(source, { ...all, grouping: 'vendedor' })).toHaveLength(3);
    const [unassigned] = buildConcentradoReport(source, { ...all, routeIds: [UNASSIGNED], sellerIds: [UNASSIGNED] });
    expect(unassigned.folios).toEqual(['P-3']);
  });
  it('cada pedido aparece una sola vez por ruta incluso con varias entregas', () => {
    const groups = buildConcentradoReport(source, { ...all, grouping: 'ruta' });
    expect(groups).toHaveLength(3);
    expect(groups.reduce((sum, g) => sum + g.orderCount, 0)).toBe(3);
    expect(groups.find(g => g.label === 'Ruta: Ruta 2')?.products[0].requerido).toBe(15);
  });
  it('una asignación ambigua se muestra compartida, sin inventar reparto ni duplicar demanda', () => {
    const mixed = { ...source, deliveries: [...source.deliveries, { id: 'e6', pedido_id: 'a', status: 'asignado', vendedor_ruta_id: 'r2', ruta: { nombre: 'Ruta 3' } }] };
    const groups = buildConcentradoReport(mixed, { ...all, grouping: 'ruta' });
    expect(groups.find(g => g.label.startsWith('Rutas compartidas:'))?.folios).toEqual(['P-1']);
    expect(groups.flatMap(g => g.products).reduce((sum, p) => sum + p.requerido, 0)).toBe(19.5);
  });
  it('normaliza decimales y rechaza cantidades inválidas en lugar de exportar NaN', () => {
    const bad = { ...source, saleLines: [{ ...source.saleLines[0], cantidad: NaN }] };
    expect(() => buildConcentradoReport(bad, all)).toThrow('cantidad inválida');
    const decimals = { ...source, saleLines: [{ ...source.saleLines[0], cantidad: 0.1 }, { ...source.saleLines[1], cantidad: 0.2 }] };
    expect(buildConcentradoReport(decimals, all)[0].products[0].requerido).toBe(0.3);
  });
});

const options: ConcentradoExportOptions = {
  empresa: 'Distribuidora de prueba', desde: '2026-09-09', hasta: '2026-09-09',
  fechaLabel: 'Fecha de entrega', filterLabel: 'Estado: Confirmado · Documentos: Solo pedidos', quantity: 'requerido',
  groups: buildConcentradoReport(source, { ...all, grouping: 'ruta' }),
};
describe('exportación de hoja de surtido', () => {
  afterEach(() => vi.restoreAllMocks());
  it('usa el logo de cada empresa y no agrega uno fijo cuando no tiene logo', async () => {
    const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAABQAAAAKCAIAAAA7N+mxAAAAF0lEQVR4nGOUC1jFQC5gIlvnqOYRoxkAssgBLHNv5hQAAAAASUVORK5CYII='), c => c.charCodeAt(0));
    const fetchLogo = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => ({
      ok: true, blob: async () => new Blob([png], { type: 'image/png' }),
    } as Response));
    for (const empresa of ['Empresa A', 'Empresa B']) {
      const logoUrl = `https://example.test/${empresa.replace(' ', '-')}.png`;
      const pdf = await createConcentradoPdf({ ...options, empresa, logoUrl });
      expect(fetchLogo).toHaveBeenLastCalledWith(logoUrl, expect.objectContaining({ signal: expect.any(AbortSignal) }));
      expect(pdf.output()).toContain(empresa.toUpperCase());
      expect(pdf.output()).toContain('/Subtype /Image');
    }
    const pdf = await createConcentradoPdf({ ...options, logoUrl: null });
    expect(fetchLogo).toHaveBeenCalledTimes(2);
    expect(pdf.output()).not.toContain('/Subtype /Image');
  });
  it('Excel conserva números y recupera el encabezado de pedidos', async () => {
    const book = await createConcentradoWorkbook(options);
    const roundtrip = XLSX.read(XLSX.write(book, { type: 'array', bookType: 'xlsx' }), { type: 'array' });
    const rows = XLSX.utils.sheet_to_json<(string | number)[]>(roundtrip.Sheets['Hoja de surtido'], { header: 1, defval: '' });
    const routeRow = rows.findIndex(r => r[0] === 'Ruta: Ruta 3');
    expect(rows[routeRow - 1].every(cell => cell === '')).toBe(true);
    const product = rows.find(r => r[2] === 'Producto' && typeof r[0] === 'number');
    expect(product?.slice(3, 7)).toEqual([15, 8, 7, '']);
    expect(JSON.stringify(rows)).toMatch(/P-3|Folios pedidos|pedido\(s\)|Recibe:/);
    expect(JSON.stringify(rows)).toContain(options.filterLabel);
    expect(JSON.stringify(rows)).toContain('09/09/2026');
  });
  it('PDF inicia cada grupo en una hoja independiente', async () => {
    const pdf = await createConcentradoPdf(options);
    expect(pdf.getNumberOfPages()).toBe(3);
    expect(pdf.output()).toContain('REQ.');
    expect(pdf.output()).toMatch(/P-1|Folios pedidos|pedido\(s\)|Recibe:/);
    expect(pdf.output()).toContain('Estado: Confirmado');
    expect(pdf.output()).toContain('CONCENTRADO');
  });
  it('PDF repite encabezados al continuar columnas, conserva decimales y manda folios largos al final', async () => {
    const group = options.groups[0];
    const pdf = await createConcentradoPdf({ ...options, quantity: 'pendiente', groups: [{ ...group,
      folios: Array.from({ length: 400 }, (_, i) => `PED-${String(i).padStart(5, '0')}`),
      products: Array.from({ length: 140 }, (_, i) => ({ ...group.products[0], id: String(i), nombre: `Producto de nombre largo presentación especial número ${i}`, pendiente: 1234.5678 })),
    }] });
    expect(pdf.getNumberOfPages()).toBeGreaterThan(3);
    expect(pdf.output()).toContain('PED-00399');
    expect(pdf.output()).toContain('PEND.');
    expect(pdf.output().match(/CONCENTRADO/g)?.length).toBeGreaterThanOrEqual(2);
    expect(pdf.output().match(/\(PRODUCTO\)/g)?.length).toBeGreaterThanOrEqual(2);
    for (let i = 0; i < 140; i++) expect(pdf.output()).toContain(`especial número ${i}`);
    expect(pdf.output()).toContain('1,234.5678');
  });
});
