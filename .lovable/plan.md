

## Bug Analysis: Surtido no descuenta stock del almacen

### Root Cause

The `surtir_linea_entrega` database function has a critical bug: **deducts from `productos.cantidad` (global stock) but NEVER updates `stock_almacen`** (warehouse-specific stock).

The function does:
1. Locks `productos` row, checks global stock
2. Deducts from `productos.cantidad` (global)
3. Marks `entrega_lineas` as fulfilled
4. Logs `movimientos_inventario`

**Missing**: It never touches `stock_almacen`, so the warehouse-specific inventory stays the same. Since the inventory page now reads from `stock_almacen`, the user sees no change.

### Fix

**Update the `surtir_linea_entrega` function** to also deduct from `stock_almacen` for the given `p_almacen_origen_id`, matching the pattern already used in `confirmar_traspaso` and `apply_immediate_sale_inventory`.

### Changes

1. **Migration**: Recreate `surtir_linea_entrega` adding a `stock_almacen` deduction block:
   - SELECT the `stock_almacen` row for the almacen + product (with `FOR UPDATE` lock)
   - Validate stock against the warehouse quantity (not global)
   - UPDATE `stock_almacen.cantidad` to deduct
   - Keep existing `productos.cantidad` deduction for global total consistency

This is a single migration file change. No frontend code changes needed.

### Technical Detail

```text
BEFORE (broken):
  productos.cantidad -= surtido    ✓
  stock_almacen.cantidad           ✗ (never touched)

AFTER (fixed):
  productos.cantidad -= surtido    ✓
  stock_almacen.cantidad -= surtido ✓ (new)
  Validates against stock_almacen   ✓ (warehouse-level check)
```

