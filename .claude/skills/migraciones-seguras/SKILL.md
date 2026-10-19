---
name: migraciones-seguras
description: Cómo cambiar una base de datos con datos reales sin perder información ni tumbar la app (Supabase/Postgres y AppSheet/Sheets). Úsala antes de cualquier cambio de esquema, columna, tipo, constraint o dato masivo.
---

# Migraciones seguras

## Reglas
1. Toda modificación de BD es una migración nueva en `supabase/migrations/<timestamp>_<descripcion>.sql`. Nunca edites migraciones ya aplicadas.
2. Aditiva primero: agregar es seguro; quitar o cambiar es destructivo.
3. Destructivo (DROP, cambiar tipo con datos, quitar constraint, borrar datos, desactivar RLS) requiere aprobación explícita del dueño y plan de respaldo + reversa.
4. Primero en local o rama de Supabase; producción solo con aprobación.
5. Cada migración trae al final, comentado, cómo revertirla.

## Patrón expandir → migrar → contraer
Ejemplo: cambiar `precio` de float a numeric.
```sql
-- 1. EXPANDIR (seguro)
alter table productos add column precio_nuevo numeric(14,2);
-- 2. MIGRAR datos
update productos set precio_nuevo = round(precio::numeric, 2) where precio_nuevo is null;
-- 3. Verificar
select count(*) from productos where precio is not null and precio_nuevo is null; -- debe ser 0
-- 4. Cambiar la app para usar precio_nuevo. Desplegar. Observar.
-- 5. CONTRAER (destructivo, migración aparte, con aprobación)
-- alter table productos drop column precio;
-- alter table productos rename column precio_nuevo to precio;
```

## Agregar NOT NULL a columna con datos
```sql
-- verificar nulos
select count(*) from t where c is null;
-- rellenar con valor aprobado por el dueño
update t set c = '<valor>' where c is null;
alter table t alter column c set not null;
```

## Agregar UNIQUE con posibles duplicados
```sql
select empresa_id, telefono, count(*) from clientes group by 1,2 having count(*) > 1;
-- si hay: mostrar al dueño, NO borrar ni fusionar sin aprobación.
```

## Renombrar
No renombres columnas/tablas usadas por la app sin buscar todas las referencias (código, funciones, vistas, políticas, edge functions, AppSheet). Prefiere columna nueva + migrar.

## Respaldo antes de algo destructivo
```sql
create table _respaldo_<tabla>_<yyyymmdd> as table <tabla>;
```
(El borrado del respaldo también requiere aprobación.)

## Plantilla de migración
```sql
-- Migración: <descripción>
-- Módulo: <modulo> | Decisión: D-XXX | Riesgo: BAJO/MEDIO/ALTO
-- Reversa:
--   <sentencias para revertir>

begin;
  <cambios>
commit;
```

## AppSheet / Google Sheets
- Nunca renombres ni muevas columnas de una hoja usada por AppSheet sin regenerar estructura y revisar fórmulas, slices, acciones, bots y scripts que la referencian por nombre o por letra.
- Agregar columnas al final. No insertar en medio.
- Antes de cambios masivos: duplicar la hoja/archivo como respaldo.
- Cambios masivos por Apps Script en lotes (getValues/setValues), con log de qué filas cambiaron.
