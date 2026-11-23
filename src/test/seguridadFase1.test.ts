import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  accionRequiereAdmin,
  empresaEfectiva,
  puedeAdministrarSuscripcion,
  resolverEmpresaUsuario,
} from '../../supabase/functions/_shared/empresaAcceso';

// Seguridad fase 1 (auditoría 2026-11-23 §1.5). Pruebas estáticas de la migración y de las
// edge functions; la prueba de comportamiento en BD es docs/sql/2026-11-23_verificar_seguridad_fase1.sql.
const sql = readFileSync('supabase/migrations/20261123020000_seguridad_fase1.sql', 'utf8');

/** Cuerpo del CREATE OR REPLACE de una función (hasta el $function$ de cierre). */
function cuerpo(nombre: string, firmaInicio?: string): string {
  const marca = `CREATE OR REPLACE FUNCTION public.${nombre}(${firmaInicio ?? ''}`;
  const i = sql.indexOf(marca);
  expect(i, `falta CREATE OR REPLACE de ${nombre}`).toBeGreaterThan(-1);
  const fines = ['$function$;', '$fn$;'].map((t) => sql.indexOf(t, i)).filter((k) => k > -1);
  return sql.slice(i, Math.min(...fines));
}

const GUARDADAS_POR_PARAMETRO: Array<[string, string]> = [
  ['aplicar_cobro', 'p_empresa_id'],
  ['registrar_saldo_inicial', 'p_empresa_id'],
  ['saldo_clientes_a_la_fecha', 'p_empresa_id'],
  ['surtir_linea_entrega', 'p_empresa_id'],
  ['surtir_linea_entrega_parcial', 'p_empresa_id'],
  ['surtir_linea_entrega_lotes', 'p_empresa_id'],
  ['revertir_surtido_linea', 'p_empresa_id'],
  ['recibir_compra_linea_parcial', 'p_empresa_id'],
  ['asignar_lote_masivo', 'p_empresa_id'],
  ['get_optimization_quota', '_empresa_id'],
  ['get_sandbox_usage', 'p_empresa_id'],
  ['next_folio', 'p_empresa_id'],
];

const GUARDADAS_POR_REGISTRO: Array<[string, string]> = [
  ['cancelar_traspaso', 'v_traspaso.empresa_id'],
  ['cerrar_pedido_parcial', 'v_venta.empresa_id'],
  ['reabrir_pedido_parcial', 'FROM public.ventas v WHERE v.id = p_venta_id'],
  ['close_audit_line', 'FROM public.auditorias a WHERE a.id = v_auditoria_id'],
  ['close_full_audit', 'FROM public.auditorias a WHERE a.id = p_auditoria_id'],
  ['get_audit_users', 'FROM public.auditorias a WHERE a.id = p_auditoria_id'],
  ['validar_stock_cotizacion', 'FROM public.cotizaciones c WHERE c.id = p_cotizacion_id'],
  ['stock_almacen_at_eod_v2', 'v_empresa_id'],
];

const INTERNAS = [
  '_aj_regresar_a_bodega', '_aplica_stock_lote', '_aplicar_delta_compra_edicion', '_mover_stock_entre_almacenes',
  'deduct_timbre', 'reserve_timbre', 'release_timbre', 'confirm_timbre_reserve', 'wa_clientes_saldos',
  'fn_recalc_venta_saldo', 'fn_recalc_venta_header', 'recalc_venta_totales', 'reconciliar_saldos_cliente',
  'reconciliar_saldos_empresa', 'fn_sync_venta_inventario', 'log_venta_historial', 'is_empresa_admin',
  'puede_facturar', 'tiene_cobertura_vigente', 'generate_folio', 'fn_pedido_entregado_completo',
  'fn_venta_tiene_promocion',
];

describe('Seguridad fase 1 · migración', () => {
  it('es transaccional, no borra nada y no concede en bloque', () => {
    expect(sql).toMatch(/^BEGIN;$/m);
    expect(sql).toMatch(/^COMMIT;$/m);
    // fuera de los cuerpos de función copiados de producción (que ya traían sus DELETE internos)
    const sinCuerpos = sql.replace(/AS \$function\$[\s\S]*?\$function\$;/g, '');
    expect(sinCuerpos).not.toMatch(/\bDROP\s+(TABLE|FUNCTION|POLICY|COLUMN|SCHEMA)\b/i);
    expect(sinCuerpos).not.toMatch(/\bTRUNCATE\b|\bDELETE\s+FROM\b/i);
    expect(sql).not.toMatch(/ALL\s+FUNCTIONS\s+IN\s+SCHEMA/i);
    expect(sql).not.toMatch(/for\s+f\s+in\s+select/i); // sin bucles «a todas» como 20261119120000
  });

  it('aborta si una función cambió desde la auditoría (precondición md5)', () => {
    expect(sql).toContain('md5_prod, md5_parchado');
    expect(sql).toMatch(/cambió desde la auditoría/);
  });

  it('helper fn_assert_empresa: 42501, respeta super admin y backend', () => {
    const h = cuerpo('fn_assert_empresa', '').replace(/\s+/g, ' ');
    expect(h).toContain("ERRCODE = '42501'");
    expect(h).toContain('public.get_my_empresa_id()');
    expect(h).toContain('public.is_super_admin(v_uid)');
    expect(h).toContain("IF auth.role() IN ('anon', 'authenticated')");
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.fn_assert_empresa\(uuid\) FROM PUBLIC, anon, authenticated;/);
  });

  it.each(GUARDADAS_POR_PARAMETRO)('%s valida la empresa del parámetro al inicio', (fn, param) => {
    const c = cuerpo(fn);
    const guard = c.indexOf(`PERFORM public.fn_assert_empresa(${param});`);
    expect(guard).toBeGreaterThan(-1);
    // la guarda va antes de la primera escritura
    for (const w of ['INSERT INTO', 'UPDATE ', 'DELETE FROM']) {
      const k = c.indexOf(w);
      if (k > -1) expect(guard).toBeLessThan(k);
    }
  });

  it.each(GUARDADAS_POR_REGISTRO)('%s valida la empresa del registro', (fn, ref) => {
    const c = cuerpo(fn);
    expect(c).toContain('PERFORM public.fn_assert_empresa(');
    expect(c).toContain(ref);
  });

  it('aplicar_cobro: identidad por auth.uid() y ventas/cliente de la misma empresa', () => {
    const c = cuerpo('aplicar_cobro', 'p_empresa_id uuid, p_cliente_id uuid, p_monto numeric, p_metodo text, p_referencia text, p_fecha date, p_aplicaciones jsonb, p_turno_id');
    expect(c).toContain('v_user_id uuid := COALESCE(auth.uid(), p_user_id);');
    expect(c).not.toContain('COALESCE(p_user_id, auth.uid())');
    expect(c).toContain('El cliente no pertenece a la empresa');
    expect(c).toContain('Una venta del cobro no pertenece a la empresa');
    // la de 9 parámetros solo delega (no se reescribe) y conserva EXECUTE para authenticated
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.aplicar_cobro(uuid,uuid,numeric,text,text,date,jsonb,text,uuid) TO authenticated, service_role;');
  });

  it('p_user_id del cliente se ignora con sesión en inventario', () => {
    for (const fn of ['surtir_linea_entrega', 'surtir_linea_entrega_parcial', 'surtir_linea_entrega_lotes', 'recibir_compra_linea_parcial', 'cancelar_traspaso']) {
      expect(cuerpo(fn)).toContain('p_user_id := COALESCE(auth.uid(), p_user_id);');
    }
    expect(cuerpo('cerrar_pedido_parcial')).toContain('COALESCE(auth.uid(), p_user_id)');
  });

  it('PIN: solo el propio con sesión', () => {
    for (const fn of ['verify_admin_pin', 'has_admin_pin']) {
      const c = cuerpo(fn);
      expect(c).toContain('IF p_user_id IS DISTINCT FROM auth.uid() THEN');
      expect(c).toContain("ERRCODE = '42501'");
    }
  });

  it.each(INTERNAS)('interna %s: sin EXECUTE para PUBLIC/anon/authenticated', (fn) => {
    const re = new RegExp(`REVOKE EXECUTE ON FUNCTION public\\.${fn}\\([^)]*\\) FROM PUBLIC, anon, authenticated;`);
    expect(sql).toMatch(re);
  });

  it('62 funciones internas revocadas, cada una con firma explícita', () => {
    const revokes = sql.match(/^REVOKE EXECUTE ON FUNCTION public\.[a-z_0-9]+\([^)]*\) FROM PUBLIC, anon, authenticated;$/gm) ?? [];
    expect(revokes).toHaveLength(62);
  });

  it('cada función guardada conserva EXECUTE explícito para authenticated', () => {
    for (const [fn] of [...GUARDADAS_POR_PARAMETRO, ...GUARDADAS_POR_REGISTRO]) {
      expect(sql).toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fn}\\([^)]*\\) TO authenticated, service_role;`));
    }
  });

  it('tabla de respaldo: RLS y sin permisos para anon/authenticated', () => {
    expect(sql).toContain('ALTER TABLE public.cliente_orden_ruta_dia_respaldo ENABLE ROW LEVEL SECURITY;');
    expect(sql).toContain('REVOKE ALL ON TABLE public.cliente_orden_ruta_dia_respaldo FROM PUBLIC, anon, authenticated;');
  });
});

describe('Seguridad fase 1 · edge functions', () => {
  const perfil = { empresaId: 'A', overrideEmpresaId: null, esSuperAdmin: false };

  it('S-06 create-checkout: empresa del perfil; la ajena se rechaza', () => {
    expect(resolverEmpresaUsuario(perfil, undefined)).toEqual({ ok: true, empresaId: 'A' });
    expect(resolverEmpresaUsuario(perfil, 'A')).toEqual({ ok: true, empresaId: 'A' });
    expect(resolverEmpresaUsuario(perfil, 'B')).toMatchObject({ ok: false, status: 403 });
    expect(resolverEmpresaUsuario({ ...perfil, empresaId: null }, undefined)).toMatchObject({ ok: false, status: 400 });
    expect(resolverEmpresaUsuario({ ...perfil, esSuperAdmin: true }, 'B')).toEqual({ ok: true, empresaId: 'B' });
    expect(empresaEfectiva({ empresaId: 'A', overrideEmpresaId: 'C', esSuperAdmin: true })).toBe('C');
    expect(empresaEfectiva({ empresaId: 'A', overrideEmpresaId: 'C', esSuperAdmin: false })).toBe('A');

    const cc = readFileSync('supabase/functions/create-checkout/index.ts', 'utf8');
    expect(cc).toContain('resolverEmpresaUsuario(');
    expect(cc).toContain('empresa_id: empresaIdBody');
    expect(cc).not.toMatch(/const \{ price_id, quantity, empresa_id \} = await req\.json\(\)/);
  });

  it('S-17 manage-subscription: acciones de cobro solo dueño/admin/super admin', () => {
    for (const a of ['update_quantity', 'change_plan', 'cancel_subscription', 'reactivate_subscription', 'apply_retention_discount']) {
      expect(accionRequiereAdmin(a)).toBe(true);
    }
    expect(accionRequiereAdmin('sync_active_users')).toBe(false);
    expect(accionRequiereAdmin('preview_quantity')).toBe(false);
    const base = { userId: 'u', ownerUserId: 'o', esAdminEmpresa: false, esSuperAdmin: false };
    expect(puedeAdministrarSuscripcion(base)).toBe(false);
    expect(puedeAdministrarSuscripcion({ ...base, ownerUserId: 'u' })).toBe(true);
    expect(puedeAdministrarSuscripcion({ ...base, esAdminEmpresa: true })).toBe(true);
    expect(puedeAdministrarSuscripcion({ ...base, esSuperAdmin: true })).toBe(true);
    expect(puedeAdministrarSuscripcion({ ...base, ownerUserId: null })).toBe(false);

    const ms = readFileSync('supabase/functions/manage-subscription/index.ts', 'utf8');
    const guard = ms.indexOf('if (accionRequiereAdmin(action))');
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(ms.indexOf('action === "update_quantity"'));
    expect(ms).toContain('status: 403');
  });

  it('debug-maps-key retirada (410) antes de leer la llave', () => {
    const dk = readFileSync('supabase/functions/debug-maps-key/index.ts', 'utf8');
    const ret = dk.indexOf('status: 410');
    expect(ret).toBeGreaterThan(-1);
    expect(ret).toBeLessThan(dk.indexOf("Deno.env.get('GOOGLE_MAPS_API_KEY')"));
  });
});
