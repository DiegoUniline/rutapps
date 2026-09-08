import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const projectRoot = process.cwd();
const migration = readFileSync(
  `${projectRoot}/supabase/migrations/20260908223000_cancelar_compra_atomica.sql`,
  'utf8',
);
const formHook = readFileSync(
  `${projectRoot}/src/pages/CompraForm/useCompraForm.ts`,
  'utf8',
);

describe('cancelación segura de compras', () => {
  it('mantiene el bloqueo, la idempotencia y la defensa contra duplicados en PostgreSQL', () => {
    expect(migration).toContain('FUNCTION public.cancelar_compra_segura');
    expect(migration).toContain('FOR UPDATE');
    expect(migration).toContain("IF v_compra.status = 'cancelada'");
    expect(migration).toContain("'ya_cancelada', true");
    expect(migration).toContain('CREATE UNIQUE INDEX IF NOT EXISTS uq_movimiento_cancelacion_atomica_compra');
  });

  it('valida el kardex y los lotes antes de descontar inventario', () => {
    const validationPosition = migration.indexOf('Primera pasada: solo validación');
    const mutationPosition = migration.indexOf('Segunda pasada: todos los datos');

    expect(validationPosition).toBeGreaterThan(-1);
    expect(mutationPosition).toBeGreaterThan(validationPosition);
    expect(migration.slice(validationPosition, mutationPosition)).toContain('v_ledger_neto');
    expect(migration.slice(validationPosition, mutationPosition)).toContain('v_stock_lote');
    expect(migration).toContain("mi.notas LIKE 'Cancelación atómica compra %'");
  });

  it('impide que el navegador vuelva a orquestar stock, movimientos y estado por separado', () => {
    const start = formHook.indexOf('const handleCancel = async');
    const end = formHook.indexOf('const totalPagado', start);
    const cancelHandler = formHook.slice(start, end);

    expect(cancelHandler).toContain("supabase.rpc('cancelar_compra_segura'");
    expect(cancelHandler).not.toContain("from('stock_almacen')");
    expect(cancelHandler).not.toContain("from('movimientos_inventario')");
    expect(cancelHandler).not.toContain("from('compras').update");
    expect(cancelHandler).not.toContain('Promise.all(updates)');
  });
});
