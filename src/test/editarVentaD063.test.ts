import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  AVISO_CAMBIO_ALMACEN,
  MOTIVO_ALMACEN_CON_ENTREGAS,
  cambioAlmacen,
  encabezadoAlmacenEntrega,
  motivoAlmacenBloqueado,
  requiereFechaEntrega,
} from '@/lib/editarVentaEncabezado';

// D-063 · «Editar venta»: fecha de entrega y almacén editables. Comportamiento en BD (stock vuelve al
// almacén anterior y sale del nuevo, repetir no duplica, lotes, FEFO, con entregas falla, almacén de otra
// empresa o inactivo falla): docs/sql/2026-11-23_verificar_d063.sql (12/12 en Postgres local con todas
// las migraciones; con la función anterior 2/12).
const sql = readFileSync('supabase/migrations/20261123080000_d063_editar_venta_almacen_fecha_entrega.sql', 'utf8');
const campos = readFileSync('src/pages/VentaForm/VentaFormFields.tsx', 'utf8');
const hook = readFileSync('src/pages/VentaForm/useVentaForm.ts', 'utf8');
const pagina = readFileSync('src/pages/VentaForm/index.tsx', 'utf8');

describe('D-063 · reglas de la pantalla', () => {
  it('el almacén se bloquea solo editando un pedido con entregas activas', () => {
    expect(motivoAlmacenBloqueado({ editando: true, tipo: 'pedido', entregasActivas: 1 })).toBe(MOTIVO_ALMACEN_CON_ENTREGAS);
    expect(motivoAlmacenBloqueado({ editando: true, tipo: 'pedido', entregasActivas: 0 })).toBeNull();
    expect(motivoAlmacenBloqueado({ editando: true, tipo: 'venta_directa', entregasActivas: 0 })).toBeNull();
    expect(motivoAlmacenBloqueado({ editando: false, tipo: 'pedido', entregasActivas: 2 })).toBeNull();
  });
  it('avisa solo si hay almacén guardado y se eligió otro', () => {
    expect(cambioAlmacen('a1', 'a2')).toBe(true);
    expect(cambioAlmacen('a1', 'a1')).toBe(false);
    expect(cambioAlmacen(null, 'a2')).toBe(false);
    expect(cambioAlmacen('a1', null)).toBe(false);
    expect(AVISO_CAMBIO_ALMACEN).toBe('Se regresará el stock al almacén anterior y saldrá del nuevo');
  });
  it('la fecha de entrega se envía solo en pedidos sin entrega inmediata y con valor', () => {
    expect(requiereFechaEntrega({ tipo: 'pedido', entrega_inmediata: false })).toBe(true);
    expect(requiereFechaEntrega({ tipo: 'venta_directa', entrega_inmediata: true })).toBe(false);
    expect(encabezadoAlmacenEntrega({ tipo: 'pedido', entrega_inmediata: false, fecha_entrega: '2026-12-15', almacen_id: 'a2' }))
      .toEqual({ almacen_id: 'a2', fecha_entrega: '2026-12-15' });
    expect(encabezadoAlmacenEntrega({ tipo: 'venta_directa', entrega_inmediata: true, fecha_entrega: '2026-12-15', almacen_id: 'a1' }))
      .toEqual({ almacen_id: 'a1' });
    expect(encabezadoAlmacenEntrega({ tipo: 'pedido', entrega_inmediata: false, fecha_entrega: null, almacen_id: null }))
      .toEqual({ almacen_id: null });
  });
});

describe('D-063 · pantalla «Editar venta»', () => {
  it('fecha de entrega editable en edición (solo readOnly la bloquea) y almacén según motivo', () => {
    expect(campos).toContain(': readOnly\n          ? <div className="text-[13px] py-1.5 px-1 text-foreground">{form.fecha_entrega');
    expect(campos).toContain('const renderAlmacen = () => (readOnly || almacenBloqueadoMotivo)');
    expect(campos).toContain('cambioAlmacen(almacenOriginalId, form.almacen_id)');
    expect(campos).toContain('{AVISO_CAMBIO_ALMACEN}');
    // El tipo sigue bloqueado (D-062: «Convertir a venta directa»).
    expect(campos).toContain('const renderTipo = () => (readOnly || bloquearTipoAlmacen)');
  });
  it('la página pasa el motivo (entregas activas) y el almacén guardado', () => {
    expect(pagina).toContain('motivoAlmacenBloqueado({ editando: h.editandoConfirmada, tipo: form.tipo, entregasActivas: entregasActivas.length })');
    expect(pagina).toContain('almacenOriginalId={h.editandoConfirmada ? h.almacenOriginalId : null}');
  });
  it('editar_venta recibe almacén y fecha de entrega en p_header', () => {
    expect(hook).toContain('...encabezadoAlmacenEntrega(form),');
    // Con otro almacén, lo ya tomado no cuenta como disponible en el nuevo.
    expect(hook).toContain('if (cambioAlmacen(v.almacen_id, form.almacen_id)) return m;');
    expect(hook).toMatch(/const yaTomado = editandoConfirmada && mismoAlmacen &&/);
  });
});

describe('D-063 · migración editar_venta', () => {
  it('misma firma, SECURITY DEFINER, search_path y permisos', () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.editar_venta\(p_venta_id uuid, p_lineas jsonb, p_version timestamp with time zone DEFAULT NULL::timestamp with time zone, p_header jsonb DEFAULT NULL::jsonb, p_promos jsonb DEFAULT NULL::jsonb\) RETURNS jsonb/);
    expect(sql).toMatch(/LANGUAGE plpgsql SECURITY DEFINER\s+SET search_path TO 'public'/);
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.editar_venta(uuid, jsonb, timestamp with time zone, jsonb, jsonb) FROM PUBLIC, anon;");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.editar_venta(uuid, jsonb, timestamp with time zone, jsonb, jsonb) TO authenticated, service_role;");
    expect(sql).toContain("IF v_venta.empresa_id IS DISTINCT FROM public.get_my_empresa_id() AND NOT public.is_super_admin(v_uid) THEN");
    expect(sql).toMatch(/rp\.modulo = 'ventas' AND rp\.accion = 'editar'/);
  });
  it('acepta fecha_entrega y almacen_id; vacíos o iguales se ignoran', () => {
    expect(sql).toContain("'fecha_entrega','almacen_id']");
    expect(sql).toContain("p_header := p_header - 'almacen_id';");
    expect(sql).toContain("p_header := p_header - 'fecha_entrega';");
  });
  it('almacén: no es «solo precio», sin entregas activas, misma empresa, activo y lotes con existencia', () => {
    expect(sql).toContain('v_solo_precio := v_solo_precio AND NOT v_cambia_alm;');
    expect(sql).toContain('El pedido ya tiene entregas: el almacén no se puede cambiar aquí');
    expect(sql).toContain("RAISE EXCEPTION 'El almacén no pertenece a esta empresa.' USING ERRCODE = '42501';");
    expect(sql).toContain('está inactivo.');
    expect(sql).toContain('no tiene existencia en el almacén');
  });
  it('regresa lo aplicado a su almacén y deja que fn_sync_venta_inventario saque del nuevo', () => {
    expect(sql).toContain("'Cambio de almacén venta '");
    expect(sql).toContain("v_mov.almacen_id,v_mov.lote_id,'reverso_borrador',p_venta_id");
    expect(sql).toContain('ON CONFLICT (almacen_id, producto_id)');
    expect(sql).toContain('pg_advisory_xact_lock(hashtextextended(p_venta_id::text, 0))');
    // Igual que fn_sync_venta_inventario: no toca pedidos con entregas ni saldo inicial.
    expect(sql).toContain("NOT (v_venta.tipo::text = 'pedido' AND EXISTS (SELECT 1 FROM public.entregas e WHERE e.pedido_id = p_venta_id))");
    expect(sql).toContain('SET CONSTRAINTS ALL IMMEDIATE;');
    expect(sql).toContain("'almacen_cambiado'");
    expect(sql).toContain("'fecha_entrega_cambiada'");
  });
  it('documenta cómo revertir y de dónde parte', () => {
    expect(sql).toContain('md5(prosrc) = 5fb01bb8912e797d774dca462d2162bc');
    expect(sql).toContain('Revertir: volver a aplicar el CREATE OR REPLACE de supabase/migrations/20261119220000_editar_venta_encabezado.sql');
  });
});
