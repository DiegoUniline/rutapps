import re, json, sys
S = sys.argv[1]
ty = json.load(open(f'{S}/types.json')); code = json.load(open(f'{S}/code.json')); ev = json.load(open(f'{S}/migs.json'))
RULES = [
  ('Catálogo de productos', r'^(productos|producto_.*|marcas|clasificaciones|unidades|listas|vehiculos)$'),
  ('Precios, tarifas y listas', r'^(tarifas|tarifa_lineas|lista_precios|lista_precios_lineas)$'),
  ('Promociones y cupones', r'^(promociones|promocion_aplicada|cupones|cupon_usos)$'),
  ('Ventas, pedidos y cotizaciones', r'^(ventas|venta_.*|ventas_.*|cotizacion.*|cliente_pedido_sugerido|devolucion.*|devoluciones)$'),
  ('Clientes y zonas', r'^(clientes|cliente_orden_ruta|zonas)$'),
  ('Inventario y almacenes', r'^(almacenes|stock_.*|movimientos_inventario|ajustes_inventario|lotes|traspaso.*|solicitud.*traspaso.*|solicitudes_traspaso|merma.*|mermas|conteo.*|conteos_fisicos|auditoria.*|auditorias)$'),
  ('Compras y proveedores', r'^(compras|compra_.*|proveedores|pago_compras|solicitud.*compra.*|solicitudes_compra)$'),
  ('Logística y ruta móvil', r'^(cargas|carga_.*|entregas|entrega_.*|descarga_ruta.*|ruta_.*|visitas|vendedor_ubicaciones.*|optimizacion_.*|distancia_cache|logistica_.*|consumo_datos)$'),
  ('Cobranza, caja y gastos', r'^(cobros|cobro_.*|caja_.*|gastos|cobradores|payment_links|solicitudes_pago)$'),
  ('Comisiones y metas', r'^(comision_.*|venta_comisiones|pago_comisiones|metas_venta|commission_.*)$'),
  ('Facturación CFDI', r'^(cfdis|cfdi_.*|cat_.*|tasas_.*|unidades_sat|timbres_.*)$'),
  ('Suscripción SaaS y billing', r'^(subscriptions|subscription_plans|planes|facturas|billing_.*|empresa_addons|cancellation_requests|trial_blacklist|admin_trial_crm_.*)$'),
  ('Empresas, usuarios y permisos', r'^(empresas|profiles|roles|role_permisos|user_roles|super_admins|vendedores|otp_codes|user_favorites|feature_flags|platform_team_.*)$'),
  ('WhatsApp y correo', r'^(wa_.*|whatsapp_.*|email_.*|suppressed_emails)$'),
  ('Tienda en línea', r'^(tienda_.*)$'),
  ('Partners y comisiones internas', r'^(partner.*|internal_commission_.*|internal_crm_.*)$'),
  ('Avisos, publicidad y soporte', r'^(notifications|notification_views|internal_notification.*|broadcast_.*|publicidad_.*|tutorial_videos)$'),
  ('Reportes, dashboard e importación', r'^(reportes_personalizados|dashboard_.*|import_job.*|maintenance_log)$'),
]
def mod(t):
    for n, r in RULES:
        if re.match(r, t): return n
    return 'Sin clasificar'
trg = {}; rls = set()
for f, k, a, b in ev:
    if k == 'create_trigger': trg.setdefault(a, set()).add(b)
    if k == 'drop_trigger': trg.get(a, set()).discard(b)
    if k == 'enable_rls': rls.add(a)
used = code['tables_used']
fn_tables = {}
for t, files in used.items():
    for f in files:
        if f.startswith('supabase/functions/'): fn_tables.setdefault(t, set()).add(f.split('/')[2])
no_mig = {'auditoria_reparaciones_inventario', 'email_send_log', 'email_send_state', 'email_unsubscribe_tokens', 'suppressed_emails'}
colbad = {}
for t, c, f, l in code['col_refs_missing']:
    if (t, c) == ('lista_precios', 'venta_id'): continue
    colbad.setdefault(t, []).append(f'{c} ({f}:{l})')
out = {}
for t, cols in sorted(ty['tables'].items()):
    m = mod(t)
    in_code = t in used
    status = '⚠️' if (t in no_mig or t in colbad) else ('✅' if in_code else '🟡')
    out.setdefault(m, []).append({'t': t, 'cols': len(cols), 'emp': 'empresa_id' in cols, 'code': len([f for f in used.get(t, []) if f.startswith('src/')]),
        'fn': sorted(fn_tables.get(t, [])), 'trg': len(trg.get(t, [])), 'rls': t in rls, 'status': status, 'bad': colbad.get(t, [])})
json.dump(out, open(f'{S}/modules.json', 'w'), ensure_ascii=False, indent=1)
for m, rows in out.items():
    ok = sum(r['status'] == '✅' for r in rows); y = sum(r['status'] == '🟡' for r in rows); w = sum(r['status'] == '⚠️' for r in rows)
    print(f'{m}: {len(rows)} tablas ✅{ok} 🟡{y} ⚠️{w} {round(ok*100/len(rows))}%')
