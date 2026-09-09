import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  filterHistoricalStockRows,
  historicalStockFromCurrent,
  locationDelta,
  subtractDaysYmd,
  type HistoricalStockRow,
} from '@/lib/inventoryHistory';

const migration = readFileSync(
  `${process.cwd()}/supabase/migrations/20260909050000_inventory_stock_history_v3.sql`,
  'utf8',
);

const baseRow: HistoricalStockRow = {
  producto_id: 'p1', codigo: 'A-1', producto: 'Agua', producto_status: 'activo',
  categoria_id: 'c1', categoria: 'Bebidas', marca_id: 'm1', marca: 'Marca Uno',
  proveedor_id: 's1', proveedor: 'Proveedor Uno', unidad: 'PZA', costo_actual: 10,
  almacen_id: 'a1', almacen: 'General', ubicacion_tipo: 'almacen', ubicacion_activa: true,
  cantidad: 8, cantidad_actual: 10, diferencia_actual: 2, movimientos_posteriores: 2,
};

describe('inventory history calculations', () => {
  it('treats a destination as an entry and an origin as an exit', () => {
    expect(locationDelta(5, 'a1', null, 'a1')).toBe(5);
    expect(locationDelta(5, 'a1', 'a1', null)).toBe(-5);
  });

  it('handles a transfer on both locations without relying on movement type', () => {
    expect(locationDelta(7, 'origin', 'origin', 'destination')).toBe(-7);
    expect(locationDelta(7, 'destination', 'origin', 'destination')).toBe(7);
  });

  it('reconstructs historical stock by reversing later movements', () => {
    expect(historicalStockFromCurrent(30, [10, -4, 2])).toBe(22);
  });

  it('filters by route, stock and product dimensions', () => {
    const route = { ...baseRow, almacen_id: 'r1', almacen: 'Ruta 1', ubicacion_tipo: 'ruta', cantidad: -2 };
    const rows = filterHistoricalStockRows([baseRow, route], {
      search: 'ruta', locationType: 'rutas', quantity: 'negativos', categoryId: 'c1', brandId: 'm1', supplierId: 's1',
    });
    expect(rows).toEqual([route]);
  });

  it('subtracts days without timezone drift', () => {
    expect(subtractDaysYmd('2026-03-01', 1)).toBe('2026-02-28');
  });

  it('anchors historical stock to live stock and reverses actual later movements', () => {
    expect(migration).toContain('current_stock_minus_later_movements');
    expect(migration).toContain('m.created_at >= v_cutoff');
    expect(migration).toContain('COALESCE(l.current_quantity, 0) - COALESCE(pd.delta, 0)');
  });

  it('uses origin and destination for transfers in both snapshot and Kardex', () => {
    expect(migration).toContain('almacen_destino_id AS almacen_id, cantidad AS delta');
    expect(migration).toContain('almacen_origen_id AS almacen_id, -cantidad AS delta');
    expect(migration).toContain('m.almacen_origen_id = p_almacen_id OR m.almacen_destino_id = p_almacen_id');
  });

  it('validates tenant access before exposing inventory history', () => {
    expect(migration.match(/public\.is_super_admin\(auth\.uid\(\)\)/g)?.length).toBeGreaterThanOrEqual(2);
    expect(migration.match(/No tienes permiso para consultar esta empresa/g)?.length).toBe(2);
    expect(migration).toContain("SET search_path = pg_catalog, public");
  });
});
