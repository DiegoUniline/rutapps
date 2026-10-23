import { describe, expect, it } from 'vitest';
import { buildConcentradoReport, SIN_CATEGORIA, type ReportSource } from '@/lib/concentradoReport';
import { createConcentradoPdf, createConcentradoWorkbook } from '@/lib/concentradoReportExport';
import * as XLSX from 'xlsx';

const linea = (id: string, nombre: string, categoria?: string) => ({
  id, venta_id: 'a', producto_id: id, cantidad: 1, descripcion: null,
  productos: { codigo: id.toUpperCase(), nombre, clasificaciones: categoria ? { nombre: categoria } : null },
});
const source: ReportSource = {
  orders: [{ id: 'a', folio: 'P-1', vendedor_id: 'v1', vendedor: { nombre: 'Ana' } }],
  saleLines: [
    linea('h2', 'Paleta de limón', 'Helados'),
    linea('x', 'Bolsa de hielo'),
    linea('c1', 'Pollo empanizado', 'Congelados'),
    linea('h1', 'Helado de vainilla', 'Helados'),
    linea('c2', 'Nuggets', 'Congelados'),
  ],
  deliveries: [], deliveryLines: [],
};

describe('hoja de surtido agrupada por categoría', () => {
  const [group] = buildConcentradoReport(source, { grouping: 'general', routeIds: [], sellerIds: [] });

  it('ordena por categoría y alfabético dentro de cada una; sin categoría al final', () => {
    expect(group.products.map(p => [p.categoria, p.nombre])).toEqual([
      ['Congelados', 'Nuggets'],
      ['Congelados', 'Pollo empanizado'],
      ['Helados', 'Helado de vainilla'],
      ['Helados', 'Paleta de limón'],
      [SIN_CATEGORIA, 'Bolsa de hielo'],
    ]);
  });

  it('Excel muestra un encabezado por categoría antes de sus productos', async () => {
    const book = await createConcentradoWorkbook({ empresa: 'E', desde: '', hasta: '', fechaLabel: 'Fecha', filterLabel: 'f', groups: [group], quantity: 'requerido' });
    const rows = XLSX.utils.sheet_to_json<(string | number)[]>(book.Sheets['Hoja de surtido'], { header: 1, defval: '' });
    const flat = rows.map(r => String(typeof r[0] === 'number' ? r[2] : r[0]));
    const i = (t: string) => flat.findIndex(v => v === t);
    expect(i('CATEGORÍA: CONGELADOS')).toBeLessThan(i('Nuggets'));
    expect(i('Pollo empanizado')).toBeLessThan(i('CATEGORÍA: HELADOS'));
    expect(i('CATEGORÍA: SIN CATEGORÍA')).toBeLessThan(i('Bolsa de hielo'));
  });

  it('el PDF se genera con las categorías', async () => {
    const pdf = await createConcentradoPdf({ empresa: 'E', desde: '', hasta: '', fechaLabel: 'Fecha', filterLabel: 'f', groups: [group], quantity: 'requerido' });
    expect(pdf.getNumberOfPages()).toBe(1);
  });
});
