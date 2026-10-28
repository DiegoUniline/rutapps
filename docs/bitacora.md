# Bitácora

2026-10-19 · desarrollador · D-001 · Uniline Agents + AutoPrompter v2 instalado (unilineagents@41adcd9), adaptado a RutApp en operación
2026-10-19 · desarrollador · PR #142 (c1a2f8e) · tests priceResolver (fallback precio_principal = final con impuestos, 15→11.97) y fetchAllPages (concurrencia) alineados al código vigente; 310/310 ✅
2026-10-19 · desarrollador · PR #141 (09d675a) · Reporte comisiones: 4 filtros en una fila (select w-auto py-1); verificado con CSS de build en Chromium; producción aún muestra versión anterior (pendiente publicar)
2026-10-19 · desarrollador · PR #140 (7faa193) · merge a main de Uniline Agents · D-001
2026-10-19 · desarrollador · PR #144 (a917cc8) · Reporte comisiones: filtros multiselección (OR dentro, AND entre filtros) y agrupación hasta 3 niveles (Vendedor, Ruta/Zona, Estado cuenta, Estado comisión, Tipo fiscal, Mes; sin Cliente ni Fecha día por decisión del dueño); Excel con subtotales por combinación, PDF plano; 315/315 ✅; no desplegado
2026-10-19 · dueño · Reporte de comisiones (#141, #144) DESPLEGADO en rutapp.mx y validado por el dueño con datos reales
2026-10-19 · auditor · Inventario Fase 1: 18 módulos / 179 tablas (types.ts) / 153 usadas en código; 7 columnas usadas que types.ts no tiene (R-001…R-006), 5 tablas sin migración (R-007); SQL de validación docs/inventario/validar-bd.sql probado en Postgres 16 local
2026-10-19 · dueño+auditor · Validación en producción: 8 columnas usadas por el código NO existen (R-001…R-006 confirmados), 2 RPC NO existen (R-009), 179 tablas = types.ts, 601 migraciones aplicadas vs 701 en repo (R-010), sin tablas sin RLS ni dinero en float
2026-10-19 · dueño+auditor · migraciones-nombradas.sql: 100 de 103 migraciones con nombre descriptivo NO registradas en producción (R-010); efecto real pendiente de efectos-migraciones.sql
2026-10-19 · dueño+auditor · efectos-migraciones.sql: 86/96 completas; huecos reales 20260909030000, 20260909040000, 20260909134500; 2 políticas por re-verificar
2026-10-19 · dueño+auditor · políticas: 'Tenant devol motivo config' existe; 'Active app users only' en 31 tablas núcleo, falta en profiles (hueco 20260915222000)
2026-10-19 · dueño+auditor · impacto-actual.sql: R-003 45 ventas vencidas ocultas, R-004 85 descuentos >15% ocultos, 465 entregas sin fecha_entrega, R-001 sin exposición, R-002 sin meses faltantes (facturas vía stripe-webhook/admin-billing)
2026-10-19 · dueño+desarrollador · credito.sql: 62 clientes bloqueados a crédito, 48 al 80 %, 3 206 con aviso de vencidas si sin vencimiento = mismo día; PR #148 detenido hasta decidir la regla
2026-10-19 · dueño · D-004 regla de vencimiento C; contado con saldo: ~98 % sin ningún abono (545 ventas en la última semana), pendiente aclarar si es deuda real
2026-10-19 · desarrollador · PR #148 merged (fac8993); PR #149 crédito en borrador; PR #150 SQL de huecos listo para el dueño; R-013 política profiles excluida
2026-10-19 · dueño · PR #150 aplicado en producción y verificado (7/7 OK, 0 entregas sin fecha); R-009 resuelto
2026-10-19 · dueño · PR #148 publicado en Lovable; Control de descuentos muestra las ventas > 15 % (R-004 resuelto)
2026-10-20 · auditor · Auditoría seguridad 63 edge functions service_role: 10 CRÍTICAS (S-01…S-10), 11 ALTAS; verificadas por el agente principal S-01, S-02, S-03, S-11; docs/auditoria/seguridad-edge-functions-2026-10-20.md
2026-10-20 · desarrollador · PR #153: S-01, S-02, S-11 corregidos; S-03/S-04 parcial (correo exacto, sin reemplazo de accesos); D-005 conservar 123456 sin revelarlo
2026-10-20 · auditor · Velocidad: RLS evalúa funciones por fila; medido en producción venta_lineas 90 días 5 833 ms (RLS actual) vs 74 ms (optimizada simulada), stock_almacen 145 vs 3 ms; PR con optimización generada desde pg_policies, equivalencia probada (0 diferencias) en local
2026-10-20 · dueño · RLS optimizada APLICADA en producción (281 políticas, CONFIRMO del dueño): stock_almacen 145 → 2.9 ms, venta_lineas 90 días 5 833 → 171.6 ms; mismas filas visibles (3 431 / 51 887)
2026-10-20 · desarrollador · Realtime: suscripción global (AppLayout) de venta_lineas/entrega_lineas/cobro_aplicaciones sin filtro por empresa → venta_lineas y entregas filtradas por empresa_id, cobro_aplicaciones quitada (recalc_venta_saldo actualiza ventas); verificado en producción venta_lineas 30 días 0/74 268 sin empresa_id; 33 tablas publicadas, cliente_orden_ruta publicada sin uso
2026-10-20 · desarrollador · PR #156 (OnboardingGate sin conteos) y PR #157 (realtime de ventas filtrado por empresa) merged; pendiente publicar en Lovable
2026-10-20 · dueño · cliente_orden_ruta quitada de supabase_realtime en producción (CONFIRMO); verificado 0 / 32 publicadas
2026-10-20 · dueño · Producción: 17 índices duplicados quitados (CONFIRMO, docs/inventario/indices-duplicados.sql) → 0 pares; seguridad add_timbres/wa_clientes_saldos aplicada (20261020120000) → timbres_protegido=true, wa_saldos_abierto=false; realtime 32 tablas
2026-10-20 · desarrollador · D-006/D-007 · Fase 1 inventario: migración 20261020210000 (sobre export de producción, guarda md5) + índice referencia_id; 19 casos en Postgres local: antes reproducen G1/G2/G6, lotes 'traspaso' inválido, saldo −20, cierre parcial 10 vs 7; después todos OK; front revisa errores al borrar y Admin sin doble descuento
2026-10-20 · dueño · Fase 1 inventario APLICADA en producción (20261020210000): funciones_ok, bloqueo_ok, cancelar_surtido_ok = true
2026-10-20 · desarrollador · D-008 · Fase 2: editar_venta (RPC, 20261021120000) + escritorio (botón Editar venta) + móvil (Editar en confirmadas, cola offline 'rpc:editar_venta'); 16 casos locales OK (stock por diferencia, lotes, permisos, versión, pagado, comisión pagada, facturada)
2026-10-20 · desarrollador · D-009 · Fase 3a: ajustar_entrega (20261021130000) + diálogo Ajustar entrega (escritorio y móvil); casos locales OK: 10→8 camión, 8→10, producto equivocado con sobrante a bodega, lotes, reabrir después del ajuste sin doble, versión, permiso, facturado
2026-10-20 · dueño · editar_venta creada en producción (editar_venta_ok = true); PR #163 merged
2026-10-20 · dueño · ajustar_entrega creada en producción (ajustar_entrega_ok, regla_entregas_ok = true); PR #164 merged
2026-10-20 · desarrollador · D-010 · Móvil menos megas (PR #166): venta_lineas/entrega_lineas solo local, caché vieja falsa corregida, SW cada 5 min, miniaturas en caché, cargas/entregas/descargas del vendedor cada 15 min; dashboard_evolucion_mensual creada en producción (evolucion_ok = true, PR #167)
2026-10-20 · desarrollador · Móvil menos megas 2: realtime de visitas/gastos/jornada solo del propio usuario, visitas previas paginadas (antes se cortaban en 1000) y en caché 6 h, permisos staleTime 5 min
2026-10-20 · desarrollador · Build: versión de la app en <meta> de index.html (src/lib/appVersion.ts) en vez de horneada en el JS; dos builds iguales: 244 de 299 archivos cambiaban de nombre → 0 (el celular ya no re-baja ~3 MB en cada publicación)
2026-10-20 · desarrollador · D-011 · Ventas y Cobranza abren en el mes actual; Cobranza pide al servidor solo el rango (antes todos los cobros con select *)
2026-10-20 · desarrollador · Escritorio: realtime de productos/stock agrupado (1 re-consulta por ráfaga) y canales duplicados quitados en Ventas, Productos e Inventario
2026-10-20 · desarrollador · Tablero: pestañas Rankings/Evolución/Mes vs Mes/Asesor IA consultan solo al abrirse; RPCs dashboard_ultima_compra_clientes y dashboard_top_productos (20261021150000, pendientes en producción); evolución mensual paginada (se cortaba en 1000 filas)
2026-10-20 · desarrollador · Tablero: ventas por día y por vendedor calculadas de las mismas filas del periodo (2 descargas menos al abrir); bitácora: funciones del tablero creadas en producción (tablero_ok = true, PR #172)
2026-10-20 · desarrollador · Tablero Equipo/Inventario: clientes y productos paginados (se cortaban en 1000: visitas planeadas y valor de inventario cortos); stock en 0 ya no se baja
2026-10-20 · desarrollador · Móvil: un sync rápido espera a la descarga completa en curso (cambio de versión / primer inicio de sesión) en vez de bajar lo mismo en paralelo
2026-10-20 · desarrollador · POS: precio de presentación corregido (el re-precio por lista pisaba el precio especial y al precio con IVA se le volvía a sumar IVA); misma regla que venta de escritorio (buildPresentationPatch)
2026-10-20 · desarrollador · Búsqueda de clientes también por persona de contacto (venta, cotización, entrega, POS, móvil: nueva venta, clientes, cobrar, CxC, devolución) — pedido de cliente Congelados
2026-10-23 · desarrollador · D-012 · Mapa de clientes: optimizar otra zona del mismo día/vendedor ya no borra la anterior (zona tras zona); errores de guardado visibles
2026-10-23 · desarrollador · Logística › Reporte de surtido: productos agrupados por categoría (clasificación) y alfabéticos dentro de cada una; 'Sin categoría' al final (PDF y Excel)
2026-10-28 · desarrollador · Móvil CxC: el celular también baja las notas pendientes de clientes donde la persona es COBRADOR (antes solo las que vendió, por ruta_sync_v2 activo para todos); 'propios' incluye cobrador. Caso licencia 57012562 (Leo: 6 notas)
2026-10-28 · desarrollador · D-013 · Facturación Fase 0-A: ambiente Facturama por empresa (sandbox), emisor desde BD (S-08), CSD solo del RFC propio + validación con node-forge (S-13), list_csds solo propio, escrituras con service role; migración 20261028120000 pendiente en producción
