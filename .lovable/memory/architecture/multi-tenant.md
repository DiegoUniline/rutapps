---
name: multi-tenant
description: Reglas obligatorias de aislamiento por empresa_id en todas las consultas, hooks, exports y prefetch PWA
type: feature
---

# Aislamiento Multi-Tenant (`empresa_id`)

## Reglas obligatorias (defensa en profundidad sobre RLS)

1. **Toda tabla con columna `empresa_id` debe filtrarse en origen** con `.eq('empresa_id', eid)`. RLS es la última línea de defensa, no la única.
2. **Guarda obligatoria** antes de ejecutar la query: usar `hasEmpresa` / `requireEmpresa` desde `src/lib/empresaGuard.ts`.
   - Hooks de React Query: `enabled: hasEmpresa(empresaId)` + `queryKey: ['recurso', empresaId, ...]`.
   - Funciones imperativas (exports, prefetch, edge): `const eid = requireEmpresa(empresaId, 'contexto')`.
3. **Joins**: cuando la tabla hija no tiene `empresa_id` (ej. `*_lineas`, `*_aplicaciones`, `promocion_aplicada`), filtrar por la columna del padre con `padre!inner(empresa_id)` y `.eq('padre.empresa_id', eid)`.
4. **`queryKey` SIEMPRE incluye `empresaId`** como segundo elemento — evita fugas de caché entre cuentas/tenants.
5. **Exports Excel/PDF**: `requireEmpresa` al inicio + aplicar filtros activos + `fetchAllPages`.
6. **Prefetch PWA** (`useBootstrapPrefetch`, `useOfflineData`): toda `prefetchQuery` debe filtrar por `empresa_id`.

## Tablas con `empresa_id` (filtrar en origen)
`ajustes_inventario, almacenes, auditorias, caja_movimientos, caja_turnos, cargas, cfdis, clasificaciones, cliente_orden_ruta, clientes, cobradores, cobro_reintentos, cobros, comision_esquemas, compras, conteos_fisicos, cupon_usos, cupones, dashboard_ai_recomendaciones, descarga_ruta, devoluciones, distancia_cache, entregas, facturas, gastos, import_jobs, lista_precios, listas, marcas, merma_motivos, mermas, metas_venta, movimientos_inventario, notifications, optimizacion_recargas, optimizacion_rutas_log, pago_comisiones, pago_compras, payment_links, producto_equivalencias, producto_presentaciones, productos, promociones, proveedores, reportes_personalizados, roles, ruta_polyline_cache, ruta_sesiones, solicitudes_pago, stock_almacen, stock_camion, tarifas, traspasos, ventas, venta_comisiones, venta_historial, visitas, vendedor_ubicaciones, vendedor_ubicaciones_historial, wa_campaigns, wa_optouts, whatsapp_config, whatsapp_log, whatsapp_templates, billing_notifications, billing_message_templates`

## Tablas sin `empresa_id` (aislamiento vía FK al padre)
`venta_lineas, cobro_aplicaciones, entrega_lineas, carga_lineas, carga_pedidos, conteo_lineas, devolucion_lineas, traspaso_lineas, descarga_ruta_lineas, lista_precios_lineas, tarifa_lineas, auditoria_lineas, compra_lineas, cfdi_lineas, merma_lineas, promocion_aplicada, producto_proveedores, import_job_lineas, cupon_usos*`

## Excepciones documentadas
- `profiles` — filtrado por `user_id`/`empresa_id` según contexto.
- `tutorial_videos` — `empresa_id` puede ser NULL (videos globales gestionados por super admin).
- Catálogos SAT (`cat_*`, `unidades_sat`, `tasas_*`), `super_admins`, `subscription_plans`, `partners*`, `trial_blacklist`, páginas públicas (signup, partners landing) — sin `empresa_id` por diseño.

## Patrón obligatorio

```ts
// hook
const { empresa } = useAuth();
const empresaId = empresa?.id;
return useQuery({
  queryKey: ['ventas', empresaId, desde, hasta],
  enabled: hasEmpresa(empresaId),
  queryFn: async () => {
    const eid = requireEmpresa(empresaId, 'useVentas');
    return fetchAllPages((from, to) =>
      supabase.from('ventas')
        .select('id, folio, fecha, total, status, cliente_id, clientes(nombre)')
        .eq('empresa_id', eid)
        .gte('fecha', desde).lte('fecha', hasta)
        .range(from, to)
    );
  },
});
```

## Auditoría continua
Ejecutar `bun scripts/audit-empresa-filter.ts` antes de releases grandes.
Categorías:
- **NO_EMPRESA_FILTER** (HIGH): scan abierto sin `empresa_id` ni filtro por id → corregir.
- **SCOPED_BY_ID_ONLY** (LOW): scoped por id/<x>_id, RLS lo aísla — agregar `empresa_id` cuando sea barato (defensa en profundidad).
- **SELECT_STAR_WIDE** (MEDIUM): `.select('*')` en tablas anchas (>15 cols) — reemplazar por columnas explícitas.

## Prohibido
- `useQuery` sin `empresaId` en `queryKey` para tablas tenant.
- Filtrar `empresa_id` en cliente después de recibir datos.
- `.select('*')` en `productos, clientes, ventas, cfdis, proveedores, caja_turnos, entregas, compras, empresas`.
