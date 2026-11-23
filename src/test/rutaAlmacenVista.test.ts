import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// Super admin en la app móvil: Stock y Solicitud de traspaso usan el almacén del vendedor
// elegido (de la empresa activa), no el almacén del propio super admin (otra empresa).
describe('ruta: almacén del vendedor que se está viendo', () => {
  const hook = readFileSync('src/hooks/useAlmacenRutaVista.ts', 'utf8');
  it('lee el almacén del vendedor elegido, filtrado por la empresa activa', () => {
    expect(hook).toContain(".eq('id', overrideVendedorId!)");
    expect(hook).toContain(".eq('empresa_id', empresa!.id)");
    expect(hook).toContain('necesitaVendedor: true');
  });
  for (const f of ['src/pages/ruta/RutaStock.tsx', 'src/pages/ruta/RutaSolicitudTraspaso.tsx']) {
    it(`${f} no usa profile.almacen_id directo`, () => {
      const src = readFileSync(f, 'utf8');
      expect(src).toContain('useAlmacenRutaVista()');
      expect(src).not.toContain('const almacenId = profile?.almacen_id');
    });
  }
});
