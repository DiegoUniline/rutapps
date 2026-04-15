
# Plan: Refactor FK constraints from `vendedores`/`cobradores` to `profiles`

## Summary
Single SQL migration that redirects all foreign keys currently pointing to `vendedores(id)` or `cobradores(id)` to point to `profiles(id)` instead, drops the sync trigger, and removes `profiles.vendedor_id`.

## Tables and columns affected

Based on the actual database schema:

### FKs currently referencing `vendedores(id)`:
| Table | Column |
|---|---|
| ventas | vendedor_id |
| gastos | vendedor_id |
| devoluciones | vendedor_id |
| cargas | vendedor_id |
| cargas | repartidor_id |
| entregas | vendedor_id |
| entregas | vendedor_ruta_id |
| descarga_ruta | vendedor_id |
| stock_camion | vendedor_id |
| venta_comisiones | vendedor_id |
| pago_comisiones | vendedor_id |
| traspasos | vendedor_origen_id |
| traspasos | vendedor_destino_id |
| movimientos_inventario | vendedor_destino_id |
| clientes | vendedor_id |

### FKs currently referencing `cobradores(id)`:
| Table | Column |
|---|---|
| clientes | cobrador_id |

### Other columns to re-point to `profiles(id)`:
| Table | Column |
|---|---|
| descarga_ruta | aprobado_por |
| auditorias | aprobado_por |

**Not affected** (confirmed no vendedor_id column): `cobros`, `visitas`, `conteos_fisicos`, `comisiones` (table doesn't exist).

## Migration steps

1. **Drop** trigger `trg_sync_profile_vendedor` and function `sync_profile_to_vendedor_cobrador()`
2. **For each table/column above**: use a dynamic PL/pgSQL block to find and drop the existing FK constraint by name (querying `information_schema.table_constraints`), then `ADD CONSTRAINT ... REFERENCES profiles(id) ON DELETE SET NULL`
3. **Drop column** `profiles.vendedor_id`
4. **Leave** tables `vendedores` and `cobradores` intact (no DROP TABLE)

## Technical details
- The migration uses `DO $$ ... $$` blocks with `EXECUTE` to dynamically find constraint names, since we don't have them hardcoded
- All new FKs use `ON DELETE SET NULL` to prevent cascade issues
- No frontend changes in this migration

## What this does NOT change
- The `vendedores` and `cobradores` tables remain (empty/unused) for a future cleanup step
- No frontend code changes yet - that will be a separate step
- Database trigger functions that reference `vendedor_id` columns on other tables (like `apply_descarga_ruta_aprobada`) continue to work since those columns still exist, they just reference `profiles` now
