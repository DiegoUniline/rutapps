import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// React #426: una página lazy sin <Suspense> arriba truena al navegar (usuario solo móvil).
describe('rutas solo móvil: páginas lazy dentro de Suspense', () => {
  const app = readFileSync('src/App.tsx', 'utf8');
  const lazies = [...app.matchAll(/^const (\w+) = lazy\(/gm)].map((m) => m[1]);
  const bloque = app.slice(app.indexOf('if (isSoloMovil) {'), app.indexOf('if (isSoloPos) {'));
  it('el bloque solo móvil no tiene Suspense global', () => {
    expect(bloque.length).toBeGreaterThan(0);
  });
  it('cada página lazy del bloque va envuelta en Suspense', () => {
    for (const n of lazies) {
      for (const m of bloque.matchAll(new RegExp(`element=\\{(.*?)<${n} />`, 'g'))) {
        expect(m[1], n).toContain('<Suspense');
      }
    }
  });
});
