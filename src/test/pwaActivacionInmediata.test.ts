import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// 2026-11-25: celulares con la app de antes del corte seguían guardando en la base vieja porque la
// versión nueva esperaba a que el vendedor tocara «Actualizar». Ahora el SW nuevo se activa solo.
describe('PWA: la versión nueva se activa sin esperar al usuario', () => {
  const cfg = readFileSync('vite.config.ts', 'utf8');
  it('skipWaiting y clientsClaim activos', () => {
    expect(cfg).toMatch(/skipWaiting:\s*true/);
    expect(cfg).toMatch(/clientsClaim:\s*true/);
  });
});
