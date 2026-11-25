import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// 2026-11-25: desde CxC con notas elegidas se saltaba «¿Cuánto te entrega el cliente?» y el monto recibido
// quedaba en el saldo completo: al aplicar menos, salía un «Sobrante» falso.
describe('Cobrar desde CxC: primero el monto que entrega el cliente', () => {
  const src = readFileSync('src/pages/ruta/RutaCobrar.tsx', 'utf8');
  it('no salta al paso de distribución con el saldo completo', () => {
    expect(src).not.toMatch(/setStep\('cuentas'\);\s*\n\s*\}, \[preselectedVentaIds/);
  });
  it('la distribución se limita a las notas elegidas', () => {
    expect(src).toMatch(/autoApply\(monto, ventasObjetivo/);
    expect(src).toMatch(/const ventasObjetivo = seleccionCxC \?\? ventasPendientes/);
  });
});
