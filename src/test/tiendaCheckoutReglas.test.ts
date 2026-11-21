import { describe, it, expect } from 'vitest';
import { BLOCKED_HASH, motivoRechazoPedidoTienda } from '../../supabase/functions/_shared/tiendaAuth';

describe('tienda-checkout: quién puede enviar pedido', () => {
  const acceso = { verificado: true, password_hash: 'pbkdf2$x' };

  it('cliente activo con acceso vigente: se recibe', () => {
    expect(motivoRechazoPedidoTienda({ status: 'activo' }, acceso)).toBeNull();
  });

  it('bloqueado en la tienda (aunque el token siga vigente): 403 bloqueado', () => {
    expect(motivoRechazoPedidoTienda({ status: 'activo' }, { verificado: false, password_hash: 'pbkdf2$x' })?.code).toBe('bloqueado');
    expect(motivoRechazoPedidoTienda({ status: 'activo' }, { verificado: true, password_hash: BLOCKED_HASH })?.code).toBe('bloqueado');
    expect(motivoRechazoPedidoTienda({ status: 'activo' }, null)?.code).toBe('bloqueado');
  });

  it('cliente inactivo o suspendido en RutApp (como la venta normal): 403 con mensaje claro', () => {
    const r1 = motivoRechazoPedidoTienda({ status: 'inactivo' }, acceso);
    expect(r1?.code).toBe('cliente_no_activo');
    expect(r1?.error).toContain('inactiva');
    const r2 = motivoRechazoPedidoTienda({ status: 'suspendido' }, acceso);
    expect(r2?.error).toContain('suspendida');
    expect(motivoRechazoPedidoTienda({ status: null }, acceso)?.code).toBe('cliente_no_activo');
  });
});
