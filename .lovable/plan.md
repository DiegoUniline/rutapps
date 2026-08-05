# Plan: bajar consumo de datos en /ruta y arreglar promociones

Dos frentes independientes que se pueden aprobar juntos: (1) reducir megas del sync móvil, (2) que las promociones nunca fallen ni queden "aplicadas pero sin rebajar".

## Parte 1 — Promociones

Hallazgo confirmado en el diagnóstico previo: una promoción de **producto gratis solo se aplica si el vendedor ya metió ese producto al carrito** (`src/hooks/usePromociones.ts:252-289, 319-364`). Si no está, la promo se ve como "pendiente" y no rebaja nada. Además no se crea línea de bonificación: el beneficio se resta del precio de la línea existente y `cantidad` nunca cambia (`useRutaVenta.ts:1056`), por lo que el inventario (triggers de BD sobre `venta_lineas.cantidad`) sí descuenta bien.

Cambios:

1. **Auto-agregar el producto de regalo al carrito** cuando la promo `producto_gratis` se dispara, marcado como línea de bonificación (precio 0 o descuento total según la lógica actual de neteo), en vez de dejarlo como aviso pendiente. Con confirmación visible para el vendedor.
2. **Aviso bloqueante claro** cuando hay una promo pendiente por falta del producto: hoy es fácil de ignorar; se muestra en el paso de cobro con un botón "Agregar regalo".
3. **Frescura de promociones garantizada**: `promociones` ya se descarga y refresca completo (`offlineSync.ts:206`), pero se refuerza mostrando en el cobro la antigüedad del último sync de promociones y bloqueando si está vencida (ya existe un bloqueo parcial en `useRutaVenta.ts:919-923`).
4. **Sello en la venta**: guardar en cada venta la versión/fecha de las promociones usadas, para poder auditar después sin adivinar (campo ya disponible vía `promocion_aplicada`).

## Parte 2 — Consumo de datos

Estado real verificado en `src/lib/offlineSync.ts`:

- La sync rápida móvil baja 26 tablas (`MOBILE_QUICK_SYNC_TABLES`, líneas 49-76) cada vez que hay pendientes o al reconectar (`useNetworkStatus.ts:118-124, 148`).
- Muchas tablas pesadas **no tienen lista de columnas** y bajan `select *`: `ventas`, `cobros`, `entregas`, `descarga_ruta`, `cargas`, `visitas`, `devoluciones`, `gastos`, `empresas`, `profiles` (`COLUMN_SELECTS`, líneas 83-104).
- El filtro es **solo por empresa**: el móvil de un vendedor baja clientes, ventas y visitas de TODOS los vendedores de la empresa (`TABLES_WITH_EMPRESA`, líneas 148-164; no hay filtro por `vendedor_id` en el motor).
- Las tablas "full" se re-bajan completas cada 5 minutos (`FULL_TABLE_REFRESH_MS`, línea 245), incluidas `tarifa_lineas` y `lista_precios`.

Cambios propuestos, en orden de impacto:

1. **Filtrado por vendedor en móvil** (mayor ahorro). En /ruta, limitar `clientes`, `ventas`, `venta_lineas`, `cobros`, `visitas`, `entregas` a los del vendedor de la sesión. El super admin y el escritorio siguen bajando todo.
2. **COLUMN_SELECTS para las tablas que hoy usan `*`**: `ventas`, `cobros`, `entregas`, `cargas`, `descarga_ruta`, `visitas`, `devoluciones`, `gastos`, `profiles`, `empresas`. Se listan solo las columnas que /ruta realmente lee.
3. **Ventana de historial más corta en móvil**: 30 días → 15 días para `venta_lineas`, `visitas`, `entregas`, `devoluciones` y `gastos` (configurable, sin tocar escritorio).
4. **Subir el intervalo de refresco de tablas "full"** de 5 a 15 minutos, dejando `promociones`, `tarifas`, `tarifa_lineas` y `lista_precios` en una vía rápida propia (siguen refrescándose seguido porque afectan precios y promos).
5. **Medición**: dejar registrado en la pantalla de sincronización el consumo por tabla (ya existe `dataUsage.ts`) para comparar antes/después con una licencia de prueba.

## Detalles técnicos

- Archivos tocados: `src/lib/offlineSync.ts` (selects, ventanas, filtro por vendedor, intervalos), `src/hooks/useNetworkStatus.ts` (paso del vendedor activo a la sync móvil), `src/hooks/usePromociones.ts` y `src/pages/ruta/RutaNuevaVenta/useRutaVenta.ts` + `StepProductos.tsx` (regalo automático y aviso), `src/pages/ruta/RutaSincronizarPage.tsx` (reporte de consumo).
- Sin cambios de esquema en la base de datos ni en los triggers de inventario.
- El filtro por vendedor cambia qué se guarda en IndexedDB: se incluye una limpieza para que los dispositivos ya sincronizados borren lo ajeno en la primera sync tras el cambio.

## Pruebas

- Licencia 12324489 primero, detrás de bandera en `feature_flags` (`ruta_sync_slim` y `promo_regalo_auto`).
- Medir MB por sync antes/después en un dispositivo con Distribuidora Tampico (caso de 27.95 MB medido antes).
- Caso promo: venta con promo de producto gratis sin el producto en carrito, verificar que se agrega y que el total rebaja.
