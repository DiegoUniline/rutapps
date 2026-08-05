---
name: Inventario de ventas — sincronización delta
description: fn_sync_venta_inventario reconcilia stock de ventas por delta (idempotente); reemplaza los triggers de INSERT y las reversas parciales
type: feature
---

Todo el inventario derivado de `ventas` lo maneja **`public.fn_sync_venta_inventario(venta_id)`**:

- Compara lo **deseado** (líneas + `venta_linea_lotes`, o `lote_id` de la línea) contra lo **ya aplicado**
  (neto de `movimientos_inventario` con `referencia_id = venta`) y solo aplica la diferencia.
- Idempotente: repetir el disparo no genera movimientos. Serializa con `pg_advisory_xact_lock` por venta.
- Reconciliación en dos niveles: primero lotes explícitos (ajuste exacto por lote), luego el residual
  por FEFO (si el producto maneja lotes) o sin lote. Los lotes FEFO solo se devuelven si sobra cantidad.
- Salidas → `referencia_tipo = 'venta'`; entradas → `'cancelacion_venta'` (cancelada) o `'reverso_borrador'`.
- Registra cada ajuste en `venta_historial` con `accion = 'inventario_ajustado'`.
- Se **omite** en `saldo_inicial` y en pedidos que tienen `entregas` (ese flujo lo controlan las entregas).

Se dispara con constraint triggers DEFERRED: `ventas` (status/almacen_id/entrega_inmediata),
`venta_lineas` (INSERT/DELETE/UPDATE de cantidad, producto_id, lote_id, venta_id) y `venta_linea_lotes`.

Triggers eliminados (no reintroducir): `trg_apply_immediate_sale_inventory`, `trg_aplicar_lote_venta_inmediata`,
`trg_apply_delivered_direct_sale_inventory`, `trg_apply_pedido_entregado_inventory`,
`trg_restore_cancelled_sale_inventory`, `trg_revertir_lote_venta_cancel`. Aplicaban solo en INSERT de líneas
y las reversas no cubrían pedidos, por lo que editar una venta aplicada dejaba el stock descuadrado.
