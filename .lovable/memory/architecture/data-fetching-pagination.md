---
name: Data Fetching Pagination
description: Pagination strategy for high-volume tables. fetchAllPages helper, safety cap, list of tables requiring pagination.
type: feature
---

## Regla

Toda query Supabase que devuelva una lista cuyo total pueda superar 1000 filas
DEBE usar `fetchAllPages` de `@/lib/supabasePaginate` (paginación recursiva con `.range()`).
Sin esto, Supabase trunca silenciosamente a 1000 y los cálculos/reportes salen incompletos.

## Tablas que SIEMPRE requieren `fetchAllPages`

Transaccionales (crecen sin tope):
- `ventas`, `venta_lineas`
- `entregas`, `entrega_lineas`
- `cobros`, `cobro_aplicaciones`
- `movimientos_inventario`
- `stock_almacen`
- `visitas`, `vendedor_ubicaciones_historial`
- `cliente_orden_ruta`
- `compras`, `compra_lineas`
- `devoluciones`, `devolucion_lineas`
- `cargas`, `carga_lineas`, `carga_pedidos`
- `mermas`, `merma_lineas`
- `descarga_ruta`, `descarga_ruta_lineas`
- `conteo_lineas`, `traspaso_lineas`
- `gastos`

Catálogos grandes (pueden superar 1000):
- `productos`, `clientes`
- `tarifa_lineas`, `lista_precios_lineas`
- `producto_equivalencias`, `producto_presentaciones`

Catálogos pequeños (NO requieren paginación):
- `almacenes`, `zonas`, `marcas`, `clasificaciones`, `unidades`, `listas`,
  `vehiculos`, `tarifas`, `proveedores`, `merma_motivos`, `profiles`.

## Patrón

```ts
const data = await fetchAllPages<MiTipo>((from, to) =>
  supabase.from('ventas')
    .select('id, total')
    .eq('empresa_id', eid)
    .gte('fecha', desde)
    .lte('fecha', hasta)
    .range(from, to)
);
```

## Safety cap

`fetchAllPages` tiene un cap por defecto de 200 000 filas. Si se alcanza,
emite `console.warn` y trunca. Esto evita memory blow-ups si alguien filtra mal.

## Exports / acciones masivas

Para listas con paginación server-side (productos, clientes, ventas, etc.),
los botones de Exportar/Eliminar masivo DEBEN re-consultar con `fetchAllPages`
usando los filtros activos — exportar solo la página visible es bug.
