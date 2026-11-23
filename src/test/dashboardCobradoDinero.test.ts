import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// Cobrado del Dashboard = dinero real: sin «Ajuste de liquidación» ni saldo a favor.
describe('dashboard: cobrado sin cobros que no son dinero', () => {
  const dash = readFileSync('src/pages/DashboardPage.tsx', 'utf8');
  const cartera = readFileSync('src/pages/dashboard/sections/TabCartera.tsx', 'utf8');
  it('KPI Cobrado, periodo anterior y meta del mes filtran esCobroSinDinero', () => {
    expect(dash.match(/!esCobroSinDinero\(/g)?.length).toBe(3);
    expect(dash).not.toContain('const totalCobrado = (cobros ?? []).reduce(');
  });
  it('pestaña Cartera: cobrado por semana también', () => {
    expect(cartera).toContain('!esCobroSinDinero(c.metodo_pago)');
  });
});

// Cartera = todo saldo pendiente (no solo crédito), sin borradores ni cancelados.
describe('dashboard: cartera con todo saldo pendiente', () => {
  for (const f of ['src/hooks/useDashboardData.ts', 'src/pages/dashboard/hooks/useDashboardAging.ts', 'src/pages/dashboard/hooks/useDashboardEquipo.ts']) {
    it(f, () => {
      const src = readFileSync(f, 'utf8');
      expect(src).not.toContain("eq('condicion_pago', 'credito')");
      expect(src).toContain("'(cancelado,borrador)'");
    });
  }
});
