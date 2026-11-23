import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { almacenSalidaInicial, puedeConvertirPedido } from '@/lib/convertirPedido';

// D-062 · Convertir pedido en venta directa. Comportamiento en BD (stock una sola vez, repetir no
// duplica, con entregas falla, otra empresa falla, sin permiso falla):
// docs/sql/2026-11-23_verificar_d062.sql (probado en Postgres local con todas las migraciones).
const sql = readFileSync('supabase/migrations/20261123070000_d062_convertir_pedido_a_venta.sql', 'utf8');

describe('D-062 · puedeConvertirPedido', () => {
  const pedido = { tipo: 'pedido', status: 'confirmado', cerrado_at: null, es_saldo_inicial: false };
  const ok = { entregasActivas: 0, tienePermiso: true };

  it('pedido confirmado o borrador, sin entregas activas y con permiso → sí', () => {
    expect(puedeConvertirPedido(pedido, ok)).toBe(true);
    expect(puedeConvertirPedido({ ...pedido, status: 'borrador' }, ok)).toBe(true);
  });
  it('con entregas activas → no', () => {
    expect(puedeConvertirPedido(pedido, { ...ok, entregasActivas: 1 })).toBe(false);
  });
  it('sin permiso → no', () => {
    expect(puedeConvertirPedido(pedido, { ...ok, tienePermiso: false })).toBe(false);
  });
  it('venta directa, saldo inicial, entregado, facturado, cancelado o cerrado → no', () => {
    expect(puedeConvertirPedido({ ...pedido, tipo: 'venta_directa' }, ok)).toBe(false);
    expect(puedeConvertirPedido({ ...pedido, tipo: 'saldo_inicial' }, ok)).toBe(false);
    expect(puedeConvertirPedido({ ...pedido, es_saldo_inicial: true }, ok)).toBe(false);
    for (const status of ['entregado', 'facturado', 'cancelado']) {
      expect(puedeConvertirPedido({ ...pedido, status }, ok)).toBe(false);
    }
    expect(puedeConvertirPedido({ ...pedido, cerrado_at: '2026-11-20T10:00:00Z' }, ok)).toBe(false);
    expect(puedeConvertirPedido(null, ok)).toBe(false);
  });
});

describe('D-062 · almacén de salida preseleccionado', () => {
  const lista = [{ id: 'a1' }, { id: 'a2' }, { id: 'a3' }];
  it('el del pedido; si no, el del vendedor; si ninguno está disponible, el primero', () => {
    expect(almacenSalidaInicial('a2', 'a3', lista)).toBe('a2');
    expect(almacenSalidaInicial(null, 'a3', lista)).toBe('a3');
    expect(almacenSalidaInicial('zz', null, lista)).toBe('a1');
    expect(almacenSalidaInicial(null, null, [])).toBe('');
  });
});

describe('D-062 · migración fn_convertir_pedido_a_venta', () => {
  it('SECURITY DEFINER, search_path public, sin anon y con authenticated', () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.fn_convertir_pedido_a_venta\(p_venta_id uuid, p_almacen_id uuid\)/);
    expect(sql).toMatch(/SECURITY DEFINER\s+SET search_path TO 'public'/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.fn_convertir_pedido_a_venta\(uuid, uuid\) FROM PUBLIC, anon;/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.fn_convertir_pedido_a_venta\(uuid, uuid\) TO authenticated, service_role;/);
  });
  it('valida empresa, permiso de editar ventas, tipo, estado, cierre, entregas y almacén', () => {
    expect(sql).toContain('PERFORM public.fn_assert_empresa(v_venta.empresa_id)');
    expect(sql).toMatch(/rp\.modulo = 'ventas' AND rp\.accion = 'editar'/);
    expect(sql).toContain("v_venta.tipo::text <> 'pedido'");
    expect(sql).toContain("v_venta.status::text NOT IN ('borrador', 'confirmado')");
    expect(sql).toContain('v_venta.cerrado_at IS NOT NULL');
    expect(sql).toContain("e.status::text <> 'cancelado'");
    expect(sql).toContain('Este pedido tiene entregas; termínalo desde Entregas');
    expect(sql).toContain('v_almacen.empresa_id IS DISTINCT FROM v_venta.empresa_id');
  });
  it('convierte con entrega inmediata y deja el inventario al motor por delta (sin escribir stock a mano)', () => {
    expect(sql).toMatch(/SET tipo = 'venta_directa',\s+entrega_inmediata = true,\s+almacen_id = p_almacen_id,\s+status = 'confirmado'/);
    expect(sql).toContain('PERFORM public.fn_sync_venta_inventario(p_venta_id)');
    expect(sql).toContain('PERFORM public.fn_recalc_venta_saldo(p_venta_id)');
    expect(sql).not.toMatch(/UPDATE public\.stock_almacen|INSERT INTO public\.movimientos_inventario/);
    expect(sql).toContain("'convertido_a_venta_directa'");
    expect(sql).toContain('ya_convertido');
  });
  it('no toca líneas, cobros ni folio', () => {
    expect(sql).not.toMatch(/UPDATE public\.venta_lineas|DELETE FROM public\.venta_lineas|public\.cobro_aplicaciones|SET folio/);
  });
});

describe('D-062 · pantallas', () => {
  const web = readFileSync('src/pages/VentaForm/index.tsx', 'utf8');
  const movil = readFileSync('src/pages/ruta/RutaVentaDetalle/DetalleView.tsx', 'utf8');
  const movilHook = readFileSync('src/pages/ruta/RutaVentaDetalle/useVentaDetalle.ts', 'utf8');
  const dialogo = readFileSync('src/components/venta/ConvertirPedidoDialog.tsx', 'utf8');

  it('web: botón condicionado y cobro si queda saldo', () => {
    expect(web).toContain('Convertir a venta directa');
    expect(web).toContain('puedeConvertirPedido(');
    expect(web).toMatch(/r\.saldo_pendiente > 0\.005\) setShowPago\(true\)/);
  });
  it('móvil: botón condicionado, requiere conexión y abre el cobro con el saldo nuevo', () => {
    expect(movil).toContain('Convertir a venta directa');
    expect(movil).toContain('Necesitas conexión para convertir');
    expect(movilHook).toContain('puedeConvertirPedido(');
    expect(movilHook).toMatch(/r\.saldo_pendiente > 0\.005\) abrirCobro\(r\.saldo_pendiente\)/);
  });
  it('diálogo: almacén de salida, aviso de stock y sin conexión no llama a la BD', () => {
    expect(dialogo).toContain('Almacén de salida');
    expect(dialogo).toContain('Se descontará el stock ahora');
    expect(dialogo.indexOf('Necesitas conexión para convertir')).toBeLessThan(dialogo.indexOf('convertirPedidoAVentaDirecta(venta.id'));
  });
});
