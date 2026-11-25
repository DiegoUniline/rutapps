import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// 2026-11-25: el estado de cuenta del celular listaba borradores; ahora solo confirmados/entregados/facturados (igual que la web).
describe('Estado de cuenta móvil sin borradores', () => {
  for (const f of ['src/pages/ruta/RutaEntregaDetalle.tsx', 'src/pages/ruta/RutaVentaDetalle/useVentaDetalle.ts']) {
    it(f, () => {
      const src = readFileSync(f, 'utf8');
      const i = src.indexOf('handleEstadoCuenta = async');
      const bloque = src.slice(i, i + 1200);
      expect(bloque).toMatch(/\.from\('ventas'\)[^;]*\.in\('status', ESTADOS_CXC/);
      expect(bloque).not.toMatch(/\.from\('ventas'\)[^;\n]*\.neq\('status', 'cancelado'\)/);
    });
  }
});
