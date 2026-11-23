import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  esVentaRealizada,
  fechaVentaRealizada,
  ventaRealizadaEnRango,
  statusPedidoRealizado,
  fetchVentasRealizadas,
  filtroPedidosPorEntrega,
} from '@/lib/ventasRealizadas';

// D-061 (2026-11-23) «Según uso de Entregas»: con empresas.pedidos_cuentan_al_confirmar = true
// el pedido confirmado/entregado/facturado cuenta por `fecha`; con false se queda D-060.
const AL_CONFIRMAR = { pedidosAlConfirmar: true };

type Caso = { tipo: string; status: string; fecha: string; fecha_entrega: string | null; es_saldo_inicial?: boolean; sinAjuste: boolean; conAjuste: boolean };
// Rango: noviembre 2026.
const CASOS: Caso[] = [
  { tipo: 'pedido', status: 'confirmado', fecha: '2026-11-05', fecha_entrega: null, sinAjuste: false, conAjuste: true },
  { tipo: 'pedido', status: 'confirmado', fecha: '2026-11-05', fecha_entrega: '2026-12-01', sinAjuste: false, conAjuste: true },
  // Levantado en octubre, entregado en noviembre: D-060 → noviembre; D-061 → octubre (fuera).
  { tipo: 'pedido', status: 'entregado', fecha: '2026-10-20', fecha_entrega: '2026-11-03', sinAjuste: true, conAjuste: false },
  // Levantado en noviembre, entregado en diciembre: D-060 → diciembre (fuera); D-061 → noviembre.
  { tipo: 'pedido', status: 'entregado', fecha: '2026-11-25', fecha_entrega: '2026-12-02', sinAjuste: false, conAjuste: true },
  { tipo: 'pedido', status: 'facturado', fecha: '2026-11-10', fecha_entrega: null, sinAjuste: true, conAjuste: true },
  { tipo: 'pedido', status: 'borrador', fecha: '2026-11-05', fecha_entrega: null, sinAjuste: false, conAjuste: false },
  { tipo: 'pedido', status: 'cancelado', fecha: '2026-11-05', fecha_entrega: null, sinAjuste: false, conAjuste: false },
  { tipo: 'pedido', status: 'confirmado', fecha: '2026-11-05', fecha_entrega: null, es_saldo_inicial: true, sinAjuste: false, conAjuste: false },
  { tipo: 'venta_directa', status: 'confirmado', fecha: '2026-11-05', fecha_entrega: null, sinAjuste: true, conAjuste: true },
  { tipo: 'venta_directa', status: 'borrador', fecha: '2026-11-05', fecha_entrega: null, sinAjuste: false, conAjuste: false },
];

describe('D-061 · regla con y sin ajuste', () => {
  it.each(CASOS.map((c, i) => [i, c] as const))('caso %i', (_i, c) => {
    expect(ventaRealizadaEnRango(c, '2026-11-01', '2026-11-30')).toBe(c.sinAjuste);
    expect(ventaRealizadaEnRango(c, '2026-11-01', '2026-11-30', { pedidosAlConfirmar: false })).toBe(c.sinAjuste);
    expect(ventaRealizadaEnRango(c, '2026-11-01', '2026-11-30', AL_CONFIRMAR)).toBe(c.conAjuste);
  });

  it('con ajuste el pedido cuenta por fecha del pedido (también el entregado)', () => {
    const p = { tipo: 'pedido', status: 'entregado', fecha: '2026-10-20', fecha_entrega: '2026-11-03' };
    expect(fechaVentaRealizada(p)).toBe('2026-11-03');
    expect(fechaVentaRealizada(p, AL_CONFIRMAR)).toBe('2026-10-20');
    expect(fechaVentaRealizada({ tipo: 'venta_directa', fecha: '2026-11-10', fecha_entrega: '2026-12-01' }, AL_CONFIRMAR)).toBe('2026-11-10');
  });

  it('status que cuentan', () => {
    expect([...statusPedidoRealizado()]).toEqual(['entregado', 'facturado']);
    expect([...statusPedidoRealizado(AL_CONFIRMAR)]).toEqual(['confirmado', 'entregado', 'facturado']);
    expect(esVentaRealizada({ tipo: 'pedido', status: 'confirmado' }, AL_CONFIRMAR)).toBe(true);
    expect(esVentaRealizada({ tipo: 'pedido', status: 'confirmado' })).toBe(false);
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

describe('D-061 · fetchVentasRealizadas con ajuste', () => {
  it('pedidos: confirmados/entregados/facturados por fecha, sin filtro de entrega', async () => {
    const { client, consultas } = clienteFalso({
      pedido: [
        { id: 'p1', tipo: 'pedido', status: 'confirmado', fecha: '2026-11-05', fecha_entrega: null },
        { id: 'p2', tipo: 'pedido', status: 'entregado', fecha: '2026-10-20', fecha_entrega: '2026-11-03' }, // red de seguridad: fuera
        { id: 'p3', tipo: 'pedido', status: 'borrador', fecha: '2026-11-05', fecha_entrega: null }, // red de seguridad: fuera
      ],
    });
    const filas = await fetchVentasRealizadas(client, { empresaId: 'E1', desde: '2026-11-01', hasta: '2026-11-30', select: 'total', pedidosAlConfirmar: true });
    expect(filas.map(f => f.id)).toEqual(['p1']);
    const pedidos = consultas.find(c => c.some(f => f[0] === 'eq' && f[1][1] === 'pedido'))!;
    expect(pedidos).toContainEqual(['eq', ['empresa_id', 'E1']]);
    expect(pedidos).toContainEqual(['eq', ['es_saldo_inicial', false]]);
    expect(pedidos).toContainEqual(['in', ['status', ['confirmado', 'entregado', 'facturado']]]);
    expect(pedidos).toContainEqual(['gte', ['fecha', '2026-11-01']]);
    expect(pedidos).toContainEqual(['lte', ['fecha', '2026-11-30']]);
    expect(pedidos.some(f => f[0] === 'or')).toBe(false);
  });

  it('sin ajuste se queda la consulta D-060', async () => {
    const { client, consultas } = clienteFalso({});
    await fetchVentasRealizadas(client, { empresaId: 'E1', desde: '2026-11-01', hasta: '2026-11-30', select: 'total', pedidosAlConfirmar: false });
    const pedidos = consultas.find(c => c.some(f => f[0] === 'eq' && f[1][1] === 'pedido'))!;
    expect(pedidos).toContainEqual(['in', ['status', ['entregado', 'facturado']]]);
    expect(pedidos).toContainEqual(['or', [filtroPedidosPorEntrega('2026-11-01', '2026-11-30')]]);
  });
});

describe('D-061 · cableado estático', () => {
  const migracion = readFileSync('supabase/migrations/20261123060000_pedidos_cuentan_al_confirmar.sql', 'utf8');
  const dashboard = readFileSync('src/hooks/useDashboardData.ts', 'utf8');
  const reportes = readFileSync('src/hooks/useReportesData.ts', 'utf8');
  const config = readFileSync('src/pages/ConfiguracionPage.tsx', 'utf8');
  const auth = readFileSync('src/contexts/AuthContext.tsx', 'utf8');

  it('la migración agrega la columna, la inicializa por uso de Entregas y explica cómo revertir', () => {
    expect(migracion).toContain('ADD COLUMN IF NOT EXISTS pedidos_cuentan_al_confirmar boolean NOT NULL DEFAULT false');
    expect(migracion).toMatch(/SET pedidos_cuentan_al_confirmar = true[\s\S]*v\.tipo = 'pedido'[\s\S]*current_date - 90[\s\S]*NOT EXISTS[\s\S]*en\.status = 'hecho'[\s\S]*current_date - 90/);
    expect(migracion).toContain('CÓMO REVERTIR');
    const sinComentarios = migracion.split('\n').filter(l => !l.trim().startsWith('--')).join('\n');
    expect(sinComentarios).not.toMatch(/\bDROP\b/i);
    expect(sinComentarios).not.toMatch(/\bDELETE\b/i);
  });

  it('las tres funciones conservan la regla D-060 y agregan la rama D-061 excluyente', () => {
    for (const fn of ['dashboard_costo_ventas', 'dashboard_top_productos', 'dashboard_evolucion_mensual']) {
      const i = migracion.indexOf(`CREATE OR REPLACE FUNCTION public.${fn}(`);
      expect(i, fn).toBeGreaterThan(-1);
      const cuerpo = migracion.slice(i, migracion.indexOf('$function$;', i));
      expect(cuerpo).toContain("v.status IN ('entregado', 'facturado')");
      expect(cuerpo).toContain('v.fecha_entrega >= p_from AND v.fecha_entrega <= p_to');
      expect(cuerpo).toMatch(/v\.tipo = 'pedido'\s+AND v\.status IN \('confirmado', 'entregado', 'facturado'\)/);
      expect(cuerpo).toContain('pedidos_cuentan_al_confirmar');
      expect(cuerpo).toContain('v.es_saldo_inicial = false');
      expect(cuerpo).not.toMatch(/status(::text)?\s*<>\s*'cancelado'/);
    }
    expect(migracion).toContain('public.is_super_admin(auth.uid()) OR p_empresa_id = public.get_my_empresa_id()');
    expect(migracion).toContain('REVOKE ALL ON FUNCTION public.dashboard_costo_ventas(uuid, date, date, uuid) FROM PUBLIC, anon;');
    expect(migracion).toContain('GRANT EXECUTE ON FUNCTION public.dashboard_costo_ventas(uuid, date, date, uuid) TO authenticated, service_role;');
  });

  it('Dashboard y Reportes pasan el ajuste a la regla', () => {
    for (const fn of ['useDashboardVentas', 'useDashboardVentasPorMes', 'useDashboardVentasUsuarioMes', 'useDashboardVentasPorVendedor', 'useDashboardHoy']) {
      const j = dashboard.indexOf(`export function ${fn}(`);
      const cuerpo = dashboard.slice(j, dashboard.indexOf('\n}\n', j));
      expect(cuerpo, fn).toContain('useAjusteVentasRealizadas()');
      expect(cuerpo, fn).toContain('pedidosAlConfirmar: ajuste.pedidosAlConfirmar');
      expect(cuerpo, fn).toContain('ajuste.listo');
    }
    expect(dashboard).not.toMatch(/fechaVentaRealizada\(v\)/);
    expect(reportes).toContain('pedidosAlConfirmar: ajuste.pedidosAlConfirmar');
    expect(reportes).toContain('ajuste.listo');
  });

  it('Configuración tiene el interruptor y solo lo guarda si la columna existe', () => {
    expect(config).toContain('Los pedidos cuentan como venta al confirmarse (no uso Entregas)');
    expect(config).toContain('pedidos_cuentan_al_confirmar: pedidosAlConfirmar');
    expect(config).toMatch(/tieneAjustePedidos \? \{ pedidos_cuentan_al_confirmar/);
    expect(config).toContain('AJUSTE_VENTAS_REALIZADAS_KEY');
  });

  it('AuthContext no pide la columna nueva (si el front sale antes que la migración no se rompe el login)', () => {
    expect(auth).not.toContain('pedidos_cuentan_al_confirmar');
  });
});
