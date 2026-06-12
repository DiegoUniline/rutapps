#!/usr/bin/env bun
/**
 * Auditor multi-tenant: detecta consultas Supabase sin filtro `empresa_id`,
 * uso de `.select('*')` en tablas anchas y hooks sin `empresaId` en queryKey.
 *
 * Ejecutar: bun scripts/audit-empresa-filter.ts
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

const ROOT = join(import.meta.dir, '..', 'src');

// Tablas que SIEMPRE deben filtrarse por empresa_id
const TENANT_TABLES = new Set([
  'ventas','venta_lineas','venta_historial','venta_comisiones',
  'cobros','cobro_aplicaciones','cobro_reintentos',
  'clientes','productos','proveedores',
  'entregas','entrega_lineas',
  'cargas','carga_lineas','carga_pedidos',
  'movimientos_inventario','stock_almacen','stock_camion',
  'compras','compra_lineas','pago_compras',
  'gastos','caja_movimientos','caja_turnos',
  'conteos_fisicos','conteo_lineas','conteo_entradas',
  'devoluciones','devolucion_lineas',
  'mermas','merma_lineas','merma_motivos',
  'traspasos','traspaso_lineas',
  'auditorias','auditoria_lineas','auditoria_entradas','auditoria_escaneos',
  'visitas','vendedor_ubicaciones','vendedor_ubicaciones_historial',
  'almacenes','zonas','marcas','clasificaciones','unidades','listas',
  'tarifas','tarifa_lineas','lista_precios','lista_precios_lineas',
  'promociones','promocion_aplicada','cupones','cupon_usos',
  'cliente_orden_ruta','cliente_pedido_sugerido',
  'cfdis','cfdi_lineas','facturas',
  'ajustes_inventario','descarga_ruta','descarga_ruta_lineas',
  'producto_presentaciones','producto_equivalencias','producto_proveedores',
  'comision_esquemas','pago_comisiones',
  'metas_venta','ruta_sesiones','solicitudes_pago',
  'whatsapp_log','whatsapp_config','whatsapp_templates',
  'wa_campaigns','wa_campaign_sends','wa_optouts',
  'optimizacion_rutas_log','optimizacion_recargas','ruta_polyline_cache',
  'distancia_cache','reportes_personalizados','dashboard_ai_recomendaciones',
  'import_jobs','import_job_lineas','partner_atribuciones',
  'tutorial_videos','notifications','notification_views',
  'payment_links','subscriptions','billing_notifications',
  'roles','role_permisos',
]);

// Tablas excluidas (catálogos SAT, sistema, super-admin, públicas)
const EXEMPT_TABLES = new Set([
  'profiles','user_roles','user_favorites','super_admins','subscription_plans',
  'trial_blacklist','cancellation_requests','maintenance_log','database_health',
  'planes','partners','partner_niveles','partner_comisiones','partner_pagos','partner_solicitudes',
  'billing_message_templates','email_send_log','email_send_state','email_unsubscribe_tokens',
  'suppressed_emails','otp_codes','timbres_saldo','timbres_movimientos',
  'cat_forma_pago','cat_metodo_pago','cat_moneda','cat_regimen_fiscal',
  'cat_tipo_comprobante','cat_uso_cfdi','tasas_iva','tasas_iva_ret','tasas_isr_ret',
  'tasas_ieps','unidades_sat','empresas','vehiculos','vendedores','cobradores',
]);

// Tablas anchas — evitar select('*')
const WIDE_TABLES = new Set([
  'productos','clientes','cfdis','ventas','proveedores','venta_lineas',
  'caja_turnos','auditorias','entregas','compras','empresas',
]);

interface Finding { file: string; line: number; type: string; detail: string; }

function walk(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, files);
    else if (/\.(ts|tsx)$/.test(entry)) files.push(p);
  }
  return files;
}

function audit(): Finding[] {
  const findings: Finding[] = [];
  const files = walk(ROOT);

  for (const file of files) {
    const rel = relative(join(ROOT, '..'), file);
    const src = readFileSync(file, 'utf8');
    const lines = src.split('\n');

    // 1) .from('table') sin empresa_id en una ventana de ±25 líneas
    const fromRe = /\.from\(\s*['"`]([a-z_]+)['"`]\s*\)/g;
    let m: RegExpExecArray | null;
    while ((m = fromRe.exec(src)) !== null) {
      const table = m[1];
      if (!TENANT_TABLES.has(table)) continue;
      const lineNo = src.slice(0, m.index).split('\n').length;
      const start = Math.max(0, lineNo - 5);
      const end = Math.min(lines.length, lineNo + 25);
      const window = lines.slice(start, end).join('\n');
      const hasFilter = /empresa_id/.test(window);
      if (!hasFilter) {
        findings.push({ file: rel, line: lineNo, type: 'NO_EMPRESA_FILTER', detail: `tabla "${table}"` });
      }
    }

    // 2) select('*') en tablas anchas
    const selectRe = /\.from\(\s*['"`]([a-z_]+)['"`]\s*\)\s*(?:\.\s*\w+\([^)]*\)\s*)*\.\s*select\(\s*['"`]\*['"`]\s*\)/g;
    while ((m = selectRe.exec(src)) !== null) {
      const table = m[1];
      if (!WIDE_TABLES.has(table)) continue;
      const lineNo = src.slice(0, m.index).split('\n').length;
      findings.push({ file: rel, line: lineNo, type: 'SELECT_STAR_WIDE', detail: `tabla "${table}"` });
    }

    // 3) useQuery con queryKey sin empresaId/empresa?.id/eid
    const qkRe = /queryKey:\s*\[([^\]]+)\]/g;
    while ((m = qkRe.exec(src)) !== null) {
      const body = m[1];
      const lineNo = src.slice(0, m.index).split('\n').length;
      const around = lines.slice(Math.max(0, lineNo - 5), Math.min(lines.length, lineNo + 25)).join('\n');
      const usesTenantTable = Array.from(around.matchAll(/\.from\(\s*['"`]([a-z_]+)['"`]\s*\)/g)).some(x => TENANT_TABLES.has(x[1]));
      if (!usesTenantTable) continue;
      const hasEmpresa = /empresa(?:_?[Ii]d)?|\beid\b/.test(body);
      if (!hasEmpresa) {
        findings.push({ file: rel, line: lineNo, type: 'QUERYKEY_NO_EMPRESA', detail: body.slice(0, 80).replace(/\s+/g, ' ').trim() });
      }
    }
  }

  return findings;
}

const findings = audit();
const byType: Record<string, Finding[]> = {};
for (const f of findings) (byType[f.type] ??= []).push(f);

console.log('# Auditoría multi-tenant');
console.log(`\nTotal hallazgos: **${findings.length}**\n`);

for (const [type, list] of Object.entries(byType)) {
  console.log(`\n## ${type} (${list.length})`);
  for (const f of list.slice(0, 50)) {
    console.log(`- ${f.file}:${f.line} — ${f.detail}`);
  }
  if (list.length > 50) console.log(`- ... y ${list.length - 50} más`);
}

if (findings.length > 0) process.exit(1);
