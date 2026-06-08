## Problema

PostgREST limita las consultas a 1,000 filas por defecto. El admin de GLOBAL TRADE LOGISTICS ve los 1,686 clientes porque usa `useClientesPaginated` (que ya pagina con `.range()`), pero los demás usuarios entran por la ruta móvil `/ruta/clientes`, donde las consultas no paginan y se cortan en 1,000.

## Archivos a modificar

1. **`src/hooks/useOfflineData.ts`** — `useOfflineQuery` ejecuta `await query` sin paginar. Reemplazar por `fetchAllPages` para traer todas las filas en bloques de 1,000.

2. **`src/hooks/useBootstrapPrefetch.ts`** — El prefetch de `clientes` con `status='activo'` no pagina. Reemplazar por `fetchAllPages` con los mismos filtros (`empresa_id`, `status='activo'`, `order('orden')`).

3. **`src/pages/ruta/RutaClientes.tsx`** — La rama de super admin (`saRes`) no pagina. Aplicar `fetchAllPages` con `.eq('empresa_id', ...).eq('status','activo').order('orden')`.

4. **`src/version.ts`** — bump a 1.0.119.

## Fuera de alcance

- RLS (ya permite ver compañeros del mismo `empresa_id`).
- `useClientesPaginated` (ya funciona para admin).
- `useDataVisibility` (filtra después del fetch, no afecta el total).

## Validación

- Usuario no-admin de GLOBAL TRADE LOGISTICS en `/ruta/clientes` debe ver 1,686 clientes activos.
- Selector de clientes en POS móvil y caches offline deben reflejar el total completo.
- Admin sigue viendo 1,686 sin cambios.
