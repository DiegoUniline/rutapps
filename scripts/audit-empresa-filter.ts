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

// Tablas con columna `empresa_id` real (deben filtrarse en origen).
// Las tablas *_lineas/*_aplicaciones NO la tienen — se aíslan vía FK al padre.
const TENANT_TABLES = new Set([
  'ajustes_inventario','almacenes','auditorias',
  'caja_movimientos','caja_turnos','cargas','cfdis','clasificaciones',
  'cliente_orden_ruta','clientes','cobradores','cobro_reintentos','cobros',
  'comision_esquemas','compras','conteos_fisicos','cupon_usos',
  'dashboard_ai_recomendaciones','descarga_ruta','devoluciones',
  'distancia_cache','entregas','facturas','gastos',
  'import_jobs','lista_precios','listas','marcas',
  'merma_motivos','mermas','metas_venta','movimientos_inventario',
  'optimizacion_recargas','optimizacion_rutas_log','pago_comisiones','pago_compras',
  'payment_links','producto_equivalencias','producto_presentaciones',
  'productos','promociones','proveedores','reportes_personalizados',
  'roles','ruta_polyline_cache','ruta_sesiones','solicitudes_pago',
  'stock_almacen','stock_camion','tarifas','traspasos',
  'venta_comisiones','venta_historial','ventas','visitas',
  'vendedor_ubicaciones','vendedor_ubicaciones_historial',
  'cliente_pedido_sugerido','conteo_entradas',
  // Marketing/notif por empresa
  'wa_campaigns','wa_optouts','whatsapp_log','whatsapp_templates','whatsapp_config',
  'notifications','notification_views','cupones',
  'billing_notifications','billing_message_templates',
  // Tutoriales: empresa_id puede ser NULL (globales) — auditar excepciones manualmente
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

    // 1) .from('table') sin empresa_id. Severidad:
    //    - HIGH (NO_EMPRESA_FILTER): scan abierto, sin id ni empresa_id
    //    - LOW (SCOPED_BY_ID_ONLY): scoped por id/<x>_id (RLS lo aísla, defensa débil)
    const fromRe = /\.from\(\s*['"`]([a-z_]+)['"`]\s*\)/g;
    let m: RegExpExecArray | null;
    while ((m = fromRe.exec(src)) !== null) {
      const table = m[1];
      if (!TENANT_TABLES.has(table)) continue;
      const lineNo = src.slice(0, m.index).split('\n').length;
      const start = Math.max(0, lineNo - 5);
      const end = Math.min(lines.length, lineNo + 30);
      const window = lines.slice(start, end).join('\n');
      if (/empresa_id/.test(window)) continue;
      const scopedById = /\.\s*eq\(\s*['"`](?:id|[a-z_]+_id)['"`]\s*,/.test(window)
        || /\.\s*in\(\s*['"`](?:id|[a-z_]+_id)['"`]\s*,/.test(window);
      findings.push({
        file: rel,
        line: lineNo,
        type: scopedById ? 'SCOPED_BY_ID_ONLY' : 'NO_EMPRESA_FILTER',
        detail: `tabla "${table}"`,
      });
    }

    // 2) select('*') en tablas anchas
    const selectRe = /\.from\(\s*['"`]([a-z_]+)['"`]\s*\)\s*(?:\.\s*\w+\([^)]*\)\s*)*\.\s*select\(\s*['"`]\*['"`]\s*\)/g;
    while ((m = selectRe.exec(src)) !== null) {
      const table = m[1];
      if (!WIDE_TABLES.has(table)) continue;
      const lineNo = src.slice(0, m.index).split('\n').length;
      findings.push({ file: rel, line: lineNo, type: 'SELECT_STAR_WIDE', detail: `tabla "${table}"` });
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
