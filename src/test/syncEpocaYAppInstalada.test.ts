import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

describe('sync: corte de época tras la migración', () => {
  const src = readFileSync('src/lib/offlineSync.ts', 'utf8');
  it('cada dispositivo olvida sus cursores una vez y baja todo completo', () => {
    expect(src).toContain("export const SYNC_EPOCH = '2026-11-23-corte';");
    expect(src).toContain('await aplicarEpocaSync();');
    const fn = src.slice(src.indexOf('export async function aplicarEpocaSync'), src.indexOf('export async function aplicarEpocaSync') + 600);
    expect(fn).toContain('if (actual === SYNC_EPOCH) return false;');
    expect(fn).toContain('offlineDb.cacheTimestamps.clear()');
    expect(fn).toContain('localStorage.setItem(LS_SYNC_EPOCH, SYNC_EPOCH)');
  });
});

describe('app instalada: abre en el login, no en la página de inicio', () => {
  const app = readFileSync('src/App.tsx', 'utf8');
  it('sin sesión, "/" y rutas desconocidas van a /login en modo standalone', () => {
    expect(app).toContain("(display-mode: standalone)");
    expect(app).toContain('esAppInstalada() ? <Navigate to="/login" replace /> : <LandingPage />');
    expect(app).toContain("<Navigate to={esAppInstalada() ? '/login' : '/'} replace />");
  });
});
