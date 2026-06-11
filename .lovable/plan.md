## Objetivo
Corregir el bug en `apply_entrega_hecho_inventory` para que el descuento de inventario al marcar una entrega como "hecho" sea correcto en todos los escenarios, y reparar las entregas históricas afectadas en Distribuidora Reginata.

## Cambios

### 1. Migración: reemplazar `apply_entrega_hecho_inventory`
Sustituir la verificación `v_already_done` (que solo busca salidas previas) por un cálculo de **movimiento neto por producto y almacén** considerando los tipos `entrega`, `entrega_cargado` y `entrega_hecho`:

```text
neto_en_almacen = SUM(salidas) − SUM(entradas)   -- sobre v_almacen_id, esta entrega
pendiente       = cantidad_entregada − neto_en_almacen

si pendiente > 0  → insertar salida 'entrega_hecho' por `pendiente` y actualizar stock_almacen
si pendiente ≤ 0  → ya descontado (PWA viejo): solo registrar anclaje (cantidad=0)
```

Esto cubre los 3 escenarios:
- Camión ≠ general (normal): neto=0 → descuenta completo.
- Camión = general (mal configurado): neto=0 (−1 surtir, +1 cargado) → descuenta completo.
- PWA viejo que ya dedujo en hecho: neto = cantidad → no duplica.

Las funciones `apply_entrega_surtir_inventory` y `apply_entrega_cargado_inventory` no se tocan.

### 2. Backfill de entregas históricas en Distribuidora Reginata
Para cada `entrega` en estado `hecho` donde el neto actual en el almacén del vendedor < cantidad_entregada (PED-0004 y las ~21 detectadas):
- Insertar movimiento `salida` tipo `entrega_hecho` por la diferencia faltante.
- Actualizar `stock_almacen` correspondiente.
- Mantener movimientos previos intactos para auditoría.

### 3. Validación
- Re-consultar stock de productos afectados de PED-0004 (DUVALIN, TOTIS, CANELS) y confirmar descuento.
- Confirmar que entregas ya correctas no se tocan.
- Probar nueva entrega→hecho en flujo normal para verificar comportamiento.

## Notas técnicas
- Todo a nivel DB (sin tocar frontend).
- Idempotente: re-ejecutar el backfill no genera dobles descuentos porque el cálculo siempre se basa en el neto actual.
- El anclaje (`cantidad=0`) se sigue insertando cuando ya está cubierto para mantener trazabilidad.
