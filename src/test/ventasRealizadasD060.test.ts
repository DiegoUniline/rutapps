import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  esVentaRealizada,
  fechaVentaRealizada,
  ventaRealizadaEnRango,
  unirSinDuplicados,
  selectConColumnasBase,
  filtroPedidosPorEntrega,
  fetchVentasRealizadas,
} from '@/lib/ventasRealizadas';
import { ventasPorDia } from '@/hooks/useDashboardData';

// D-060 (2026-11-23): Dashboard y Reportes → Utilidad cuentan SOLO lo realmente vendido.
// Mismos casos que se probaron contra la migración en un Postgres local.
type Caso = { n: number; tipo: string; status: string; fecha: string; fecha_entrega: string | null; es_saldo_inicial: boolean; cuenta: boolean };
const CASOS: Caso[] = [
  { n: 1, tipo: 'venta_directa', status: 'confirmado', fecha: '2026-11-05', fecha_entrega: null, es_saldo_inicial: false, cuenta: true },
  { n: 2, tipo: 'venta_directa', status: 'borrador', fecha: '2026-11-05', fecha_entrega: null, es_saldo_inicial: false, cuenta: false },
  { n: 3, tipo: 'venta_directa', status: 'cancelado', fecha: '2026-11-05', fecha_entrega: null, es_saldo_inicial: false, cuenta: false },
  { n: 4, tipo: 'pedido', status: 'confirmado', fecha: '2026-11-05', fecha_entrega: null, es_saldo_inicial: false, cuenta: false },
  { n: 5, tipo: 'pedido', status: 'entregado', fecha: '2026-10-20', fecha_entrega: '2026-11-03', es_saldo_inicial: false, cuenta: true },
  { n: 6, tipo: 'pedido', status: 'entregado', fecha: '2026-11-25', fecha_entrega: '2026-12-02', es_saldo_inicial: false, cuenta: false },
  { n: 7, tipo: 'pedido', status: 'facturado', fecha: '2026-11-10', fecha_entrega: null, es_saldo_inicial: false, cuenta: true },
  { n: 8, tipo: 'venta_directa', status: 'facturado', fecha: '2026-11-06', fecha_entrega: null, es_saldo_inicial: true, cuenta: false },
  { n: 10, tipo: 'venta_directa', status: 'entregado', fecha: '2026-11-07', fecha_entrega: null, es_saldo_inicial: false, cuenta: true },
  { n: 11, tipo: 'pedido', status: 'borrador', fecha: '2026-11-01', fecha_entrega: '2026-11-04', es_saldo_inicial: false, cuenta: false },
  { n: 12, tipo: 'saldo_inicial', status: 'confirmado', fecha: '2026-11-02', fecha_entrega: null, es_saldo_inicial: false, cuenta: false },
];

describe('D-060 · regla de venta realizada (función pura)', () => {
  it.each(CASOS)('caso $n: $tipo $status → cuenta en noviembre = $cuenta', (c) => {
    expect(ventaRealizadaEnRango(c, '2026-11-01', '2026-11-30')).toBe(c.cuenta);
  });

  it('pedido levantado en octubre y entregado en noviembre cuenta en noviembre, no en octubre', () => {
    const p = { tipo: 'pedido', status: 'entregado', fecha: '2026-10-20', fecha_entrega: '2026-11-03' };
    expect(fechaVentaRealizada(p)).toBe('2026-11-03');
    expect(ventaRealizadaEnRango(p, '2026-10-01', '2026-10-31')).toBe(false);
    expect(ventaRealizadaEnRango(p, '2026-11-01', '2026-11-30')).toBe(true);
  });

  it('pedido sin fecha_entrega usa fecha; venta directa siempre usa fecha', () => {
    expect(fechaVentaRealizada({ tipo: 'pedido', fecha: '2026-11-10', fecha_entrega: null })).toBe('2026-11-10');
    expect(fechaVentaRealizada({ tipo: 'venta_directa', fecha: '2026-11-10', fecha_entrega: '2026-12-01' })).toBe('2026-11-10');
    expect(fechaVentaRealizada({ tipo: 'pedido', fecha: '2026-11-10', fecha_entrega: '2026-11-12T03:00:00+00:00' })).toBe('2026-11-12');
  });

  it('pedidos solo cuentan entregados o facturados; directas confirmadas, entregadas o facturadas', () => {
    for (const s of ['borrador', 'confirmado', 'cancelado']) expect(esVentaRealizada({ tipo: 'pedido', status: s })).toBe(false);
    for (const s of ['entregado', 'facturado']) expect(esVentaRealizada({ tipo: 'pedido', status: s })).toBe(true);
    for (const s of ['borrador', 'cancelado']) expect(esVentaRealizada({ tipo: 'venta_directa', status: s })).toBe(false);
    for (const s of ['confirmado', 'entregado', 'facturado']) expect(esVentaRealizada({ tipo: 'venta_directa', status: s })).toBe(true);
  });

  it('une sin duplicar por id', () => {
    expect(unirSinDuplicados([{ id: 'a' }, { id: 'b' }], [{ id: 'b' }, { id: 'c' }]).map(r => r.id)).toEqual(['a', 'b', 'c']);
  });

  it('el select siempre trae las columnas de la regla y no confunde columnas anidadas', () => {
    const s = selectConColumnasBase('total, productos(id, nombre)');
    for (const c of ['id', 'tipo', 'status', 'fecha', 'fecha_entrega', 'es_saldo_inicial']) expect(s.split(/,\s*/)).toContain(c);
    expect(selectConColumnasBase('id, tipo, status, fecha, fecha_entrega, es_saldo_inicial, total')).toBe('id, tipo, status, fecha, fecha_entrega, es_saldo_inicial, total');
  });

  it('filtro PostgREST de pedidos: por fecha_entrega o por fecha si no tiene entrega', () => {
    expect(filtroPedidosPorEntrega('2026-11-01', '2026-11-30')).toBe(
      'and(fecha_entrega.gte.2026-11-01,fecha_entrega.lte.2026-11-30),and(fecha_entrega.is.null,fecha.gte.2026-11-01,fecha.lte.2026-11-30)',
    );
  });
});

/** Cliente falso: registra los filtros de cada consulta y devuelve las filas que se le den. */
function clienteFalso(respuestas: Record<string, unknown[]>) {
  const consultas: Array<Array<[string, unknown[]]>> = [];
  const client = {
    from(tabla: string) {
      const filtros: Array<[string, unknown[]]> = [['from', [tabla]]];
      consultas.push(filtros);
      const q: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'in', 'gte', 'lte', 'or', 'order', 'not', 'abortSignal']) {
        q[m] = (...args: unknown[]) => { filtros.push([m, args]); return q; };
      }
      q.range = (...args: unknown[]) => {
        filtros.push(['range', args]);
        const tipo = filtros.find(f => f[0] === 'eq' && f[1][0] === 'tipo')?.[1][1] as string;
        return Promise.resolve({ data: respuestas[tipo] ?? [], error: null });
      };
      return q;
    },
  };
  return { client, consultas };
}

describe('D-060 · fetchVentasRealizadas (consultas a PostgREST)', () => {
  it('hace dos consultas por empresa, sin saldo inicial, con la regla de cada tipo, y une sin duplicar', async () => {
    const { client, consultas } = clienteFalso({
      venta_directa: [{ id: 'd1', tipo: 'venta_directa', status: 'confirmado', fecha: '2026-11-05', fecha_entrega: null }],
      pedido: [
        { id: 'p1', tipo: 'pedido', status: 'entregado', fecha: '2026-10-20', fecha_entrega: '2026-11-03' },
        { id: 'p1', tipo: 'pedido', status: 'entregado', fecha: '2026-10-20', fecha_entrega: '2026-11-03' },
        // Red de seguridad: si el servidor regresara algo fuera de la regla, se descarta.
        { id: 'p2', tipo: 'pedido', status: 'confirmado', fecha: '2026-11-05', fecha_entrega: null },
      ],
    });
    const filas = await fetchVentasRealizadas(client, { empresaId: 'E1', desde: '2026-11-01', hasta: '2026-11-30', select: 'total' });
    expect(filas.map(f => f.id).sort()).toEqual(['d1', 'p1']);
    expect(consultas).toHaveLength(2);
    for (const c of consultas) {
      expect(c).toContainEqual(['eq', ['empresa_id', 'E1']]);
      expect(c).toContainEqual(['eq', ['es_saldo_inicial', false]]);
    }
    const directas = consultas.find(c => c.some(f => f[0] === 'eq' && f[1][1] === 'venta_directa'))!;
    expect(directas).toContainEqual(['in', ['status', ['confirmado', 'entregado', 'facturado']]]);
    expect(directas).toContainEqual(['gte', ['fecha', '2026-11-01']]);
    expect(directas).toContainEqual(['lte', ['fecha', '2026-11-30']]);
    const pedidos = consultas.find(c => c.some(f => f[0] === 'eq' && f[1][1] === 'pedido'))!;
    expect(pedidos).toContainEqual(['in', ['status', ['entregado', 'facturado']]]);
    expect(pedidos).toContainEqual(['or', [filtroPedidosPorEntrega('2026-11-01', '2026-11-30')]]);
    expect(pedidos.some(f => f[0] === 'gte' && f[1][0] === 'fecha')).toBe(false);
  });

  it('respeta vendedor y tipo', async () => {
    const { client, consultas } = clienteFalso({});
    await fetchVentasRealizadas(client, { empresaId: 'E1', desde: '2026-11-01', hasta: '2026-11-30', select: 'total', vendedorIds: ['V1'], tipo: 'pedido' });
    expect(consultas).toHaveLength(1);
    expect(consultas[0]).toContainEqual(['eq', ['vendedor_id', 'V1']]);
    expect(consultas[0]).toContainEqual(['eq', ['tipo', 'pedido']]);
  });
});

describe('D-060 · tablero agrupa por la fecha con que cuenta la venta', () => {
  it('ventasPorDia usa fecha_venta (entrega del pedido) cuando viene', () => {
    const r = ventasPorDia(
      [{ fecha: '2026-10-20', fecha_venta: '2026-11-03', total: 100, vendedor_id: null }],
      { from: new Date('2026-11-03T12:00:00'), to: new Date('2026-11-03T12:00:00') },
    );
    expect(r).toEqual([{ date: '2026-11-03', total: 100 }]);
  });
});

describe('D-060 · cableado estático', () => {
  const migracion = readFileSync('supabase/migrations/20261123050000_dashboard_utilidad_entregado.sql', 'utf8');
  const dashboard = readFileSync('src/hooks/useDashboardData.ts', 'utf8');
  const pagina = readFileSync('src/pages/DashboardPage.tsx', 'utf8');
  const reportes = readFileSync('src/hooks/useReportesData.ts', 'utf8');

  it('la migración aplica la regla en las tres funciones y conserva autorización y permisos', () => {
    for (const fn of ['dashboard_costo_ventas', 'dashboard_top_productos', 'dashboard_evolucion_mensual']) {
      const i = migracion.indexOf(`CREATE OR REPLACE FUNCTION public.${fn}(`);
      expect(i, fn).toBeGreaterThan(-1);
      const cuerpo = migracion.slice(i, migracion.indexOf('$function$;', i));
      expect(cuerpo).toContain("v.status IN ('confirmado', 'entregado', 'facturado')");
      expect(cuerpo).toContain("v.status IN ('entregado', 'facturado')");
      expect(cuerpo).toContain('v.fecha_entrega >= p_from AND v.fecha_entrega <= p_to');
      expect(cuerpo).toContain('v.fecha_entrega IS NULL');
      expect(cuerpo).toContain('v.es_saldo_inicial = false');
      expect(cuerpo).not.toMatch(/status(::text)?\s*<>\s*'cancelado'/);
    }
    expect(migracion).toContain('public.is_super_admin(auth.uid()) OR p_empresa_id = public.get_my_empresa_id()');
    expect(migracion).toContain('REVOKE ALL ON FUNCTION public.dashboard_costo_ventas(uuid, date, date, uuid) FROM PUBLIC, anon;');
  });

  it('las ventas del tablero salen de la base D-060', () => {
    const i = dashboard.indexOf('export function useDashboardVentas(');
    const cuerpo = dashboard.slice(i, dashboard.indexOf('\n}\n', i));
    expect(cuerpo).toContain('fetchVentasRealizadas');
    expect(cuerpo).not.toContain(".neq('status'");
    for (const fn of ['useDashboardVentasPorMes', 'useDashboardVentasUsuarioMes', 'useDashboardVentasPorVendedor']) {
      const j = dashboard.indexOf(`export function ${fn}(`);
      expect(dashboard.slice(j, dashboard.indexOf('\n}\n', j))).toContain('fetchVentasRealizadas');
    }
  });

  it('la utilidad del tablero no resta compras', () => {
    expect(pagina).not.toMatch(/totalVentas\s*-\s*totalCompras/);
    expect(pagina).not.toMatch(/ventasMes\s*-\s*comprasMes/);
    expect(pagina).toContain('utilidadResumen.utilidadBruta - totalGastos');
  });

  it('Reportes → Utilidad usa la base D-060 y no el listado', () => {
    expect(reportes).toContain('fetchVentasRealizadas');
    expect(reportes).toMatch(/calcularUtilidadBruta\(\s*ventasRealizadas/);
  });
});
