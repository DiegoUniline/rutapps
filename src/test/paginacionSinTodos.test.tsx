import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TablePagination } from '@/components/TablePagination';
import { OdooPagination } from '@/components/OdooPagination';
import { readStoredPageSize, readStoredPageSizeFor, MAX_PAGE_SIZE } from '@/hooks/useTablePagination';

// Fase 3: ninguna lista ofrece «Todos/Todo» en el tamaño de página (máximo 500),
// igual que Entregas/Demanda/Concentrado (commit 5c17f5d16).

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let cont: HTMLDivElement;
let root: Root;
beforeEach(() => {
  localStorage.clear();
  cont = document.createElement('div');
  document.body.appendChild(cont);
  root = createRoot(cont);
});
afterEach(() => {
  act(() => root.unmount());
  cont.remove();
});

const opciones = () => Array.from(cont.querySelectorAll('option')).map((o) => o.textContent);
const noop = () => {};

describe('TablePagination', () => {
  it('ofrece 25/50/100/200/500 y no «Todos»', () => {
    act(() => root.render(
      <TablePagination from={1} to={50} total={3000} page={1} totalPages={60} pageSize={50}
        onPageSizeChange={noop} onPrev={noop} onNext={noop} />,
    ));
    expect(opciones()).toEqual(['25', '50', '100', '200', '500']);
  });
});

describe('OdooPagination', () => {
  it('por defecto no ofrece «Todos» (0)', () => {
    act(() => root.render(
      <OdooPagination from={1} to={50} total={3000} pageSize={50} onPageSizeChange={noop} />,
    ));
    expect(opciones()).not.toContain('Todos');
    expect(opciones()).toEqual(['10', '50', '80', '200', '500']);
  });
});

describe('preferencia guardada «Todos» de antes', () => {
  it('se lee como 500 (global y por módulo)', () => {
    localStorage.setItem('table-page-size', 'all');
    expect(readStoredPageSize()).toBe(MAX_PAGE_SIZE);
    expect(MAX_PAGE_SIZE).toBe(500);
    localStorage.setItem('table-page-size:reporte-comisiones-ventas', 'all');
    expect(readStoredPageSizeFor('reporte-comisiones-ventas')).toBe(500);
  });
});

describe('listas', () => {
  const leer = (p: string) => readFileSync(p, 'utf8');
  const listas = [
    'src/pages/CobranzaPage.tsx',
    'src/pages/ClientesListPage.tsx',
    'src/pages/ProductosListPage.tsx',
    'src/pages/DescargasPage.tsx',
    'src/pages/comisiones/ComisionesGeneradasPage.tsx',
    'src/components/reportes/ReporteComisionesVentas.tsx',
    'src/pages/VentasListPage.tsx',
  ];

  it('ninguna lista vuelve a activar «Todos» en TablePagination', () => {
    for (const p of listas) {
      const src = leer(p);
      expect(src, p).toContain('<TablePagination');
      expect(src, p).not.toMatch(/allowAll(\s|=\{true\}|\/>)/);
    }
  });

  it('Entregas, Demanda y Concentrado siguen sin «Todo»', () => {
    for (const p of ['src/pages/EntregaListPage.tsx', 'src/pages/DemandaPage.tsx', 'src/pages/logistica/ConcentradoSurtidoPage.tsx']) {
      expect(leer(p), p).not.toContain('<SelectItem value="0">Todo</SelectItem>');
    }
  });

  it('exportar Clientes y Productos carga todo lo filtrado por su cuenta (no la página en pantalla)', () => {
    const clientes = leer('src/pages/ClientesListPage.tsx');
    expect(clientes).toContain('await cargarClientesLista(');
    expect(clientes).toContain("onExcel={() => void exportarClientes('excel')}");
    const productos = leer('src/pages/ProductosListPage.tsx');
    expect(productos).toContain('await cargarProductosLista(');
    expect(productos).toContain("onExcel={() => void exportarProductos('excel')}");
    // Los cargadores usan fetchAllPages (páginas de 1000) con los mismos filtros que la lista.
    expect(leer('src/hooks/useClientes.ts')).toMatch(/useCargarClientesLista[\s\S]*fetchAllPages[\s\S]*aplicarFiltrosListaClientes/);
    expect(leer('src/hooks/useData.ts')).toMatch(/useCargarProductosLista[\s\S]*fetchAllPages[\s\S]*aplicarFiltrosListaProductos/);
  });
});
