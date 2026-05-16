## Contexto importante (lo que ya existe)

Al revisar la BD, **#2 ya está cubierto**:
- `trg_apply_delivered_direct_sale_inventory` — venta directa → entregado descuenta stock
- `trg_apply_immediate_sale_inventory` — POS al crear venta_lineas
- `trg_apply_pedido_entregado_inventory` — pedido → entregado
- `trg_restore_cancelled_sale_inventory` — cancelaciones restituyen
- `trg_apply_descarga_ruta_aprobada` — descarga de ruta aprobada

Entonces solo faltan **4 flujos** (no 5):

## Flujos a blindar con trigger

### 1. Cargar camión (`entrega.status = 'cargado'`)
- Trigger AFTER UPDATE en `entregas` cuando `status: pendiente → cargado`
- Crea `salida` del almacén origen y `entrada` al `stock_camion` del vendedor
- **Idempotencia:** detectar `referencia_tipo='entrega_cargado'` ya existente y skip; detectar movimiento legacy `referencia_tipo='entrega'+tipo='salida'+anchor_label='carga'` para no duplicar con apps viejas
- Reversal `cargado → pendiente` revierte

### 3. Devoluciones (`devolucion.status = 'aplicada'`)
- Trigger AFTER UPDATE en `devoluciones` cuando `status → aplicada`
- Reingreso al almacén indicado por cada línea
- Idempotencia: `referencia_tipo='devolucion_aplicada'+referencia_id=devolucion.id`
- Reversal cuando deja de estar `aplicada`

### 4. Conteos cerrados (`conteo.status = 'cerrado'`)
- Trigger AFTER UPDATE en `conteos` cuando `status → cerrado`
- Por cada `conteo_lineas`, generar `ajuste` (entrada/salida) por la diferencia teórico vs físico
- Idempotencia: `referencia_tipo='conteo_cerrado'+referencia_id=conteo.id`
- No revertir automáticamente al reabrir (auditoría)

### 5. Compras recibidas (`compra.status = 'recibido'`)
- Trigger AFTER UPDATE en `compras` cuando `status → recibido`
- Entrada al almacén por cada `compra_lineas`
- Idempotencia: `referencia_tipo='compra_recibida'+referencia_id=compra.id` y detectar movimiento legacy `referencia_tipo='compra'`
- Reversal cuando deja de estar `recibido`

## Blindaje anti-duplicado (regla universal)

Cada función nueva sigue el mismo patrón del trigger de entrega ya creado:

```sql
-- 1. Si ya existe el movimiento "oficial" del trigger → return (idempotencia pura)
-- 2. Si existe movimiento legacy del frontend antiguo → crear anchor de 0 y return
-- 3. Si nada existe → aplicar movimientos reales
```

Esto garantiza:
- Apps viejas (PWA cacheada) que aún hacen el insert manual → trigger detecta y no duplica
- Apps actualizadas → solo trigger aplica
- Doble UPDATE de status → idempotente

## Cambios en frontend (post-migración)

Para cada flujo, quitar el insert manual de `movimientos_inventario` y el `upsertStockAlmacen`/`upsertStockCamion` correspondiente, dejando solo el `UPDATE status`:

1. `EntregaListPage.tsx` — quitar carga manual de camión
2. `useDevoluciones.ts` — quitar reingreso manual
3. `ConteoFisicoPage.tsx` — quitar ajustes manuales al cerrar
4. `CompraForm/useCompraForm.ts` — quitar entrada manual al marcar recibido

Las apps viejas siguen funcionando porque el trigger detecta los movimientos legacy.

## Estrategia de despliegue

Una migración por flujo (4 migraciones) + edits de frontend. Cada migración es independiente, así si algo falla podemos revertir solo esa parte.

## Documentación

Actualizar `mem://architecture/entrega-inventory-trigger` para que sea un patrón general "inventory-trigger-pattern" que aplique a los 4 flujos nuevos.

## ¿Avanzamos?

Si confirmas, ejecuto en este orden: migración #1 + frontend #1, validamos, luego #3, #4, #5 una a una.