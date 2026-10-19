---
name: modelado-supabase
description: Convenciones para diseñar tablas, campos, tipos, catálogos, estados y funciones en Postgres/Supabase para SaaS multiempresa (frontend Lovable/React). Úsala al proponer o revisar un modelo de datos.
---

# Modelado en Supabase / Postgres

## Nombres
- snake_case en español. Tablas en plural (`clientes`, `tipos_habitacion`). FK como `<entidad_singular>_id`.
- Booleanos como afirmación: `activo`, `factura`, `es_sistema`.
- Fechas: `fecha_<evento>` (date) o `<evento>_at` (timestamptz).

## Columnas base en toda tabla de negocio
```sql
id uuid primary key default gen_random_uuid(),
empresa_id uuid not null references empresas(id),
-- sucursal_id uuid references sucursales(id),   -- si aplica
activo boolean not null default true,
created_at timestamptz not null default now(),
created_by uuid references auth.users(id),
updated_at timestamptz,
updated_by uuid references auth.users(id)
```
Trigger estándar de updated_at:
```sql
create or replace function set_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
create trigger trg_<tabla>_updated before update on <tabla>
for each row execute function set_updated_at();
```

## Tipos
| Dato | Tipo |
|---|---|
| Dinero | numeric(14,2) |
| Cantidades/pesos/medidas | numeric(14,4) |
| Porcentajes | numeric(7,4) (0.1600 = 16%) |
| Fecha con hora | timestamptz |
| Solo fecha | date |
| Texto | text + CHECK de longitud/formato si aplica |
| Teléfono | text normalizado (`^\d{10}$` México) |
| RFC | text upper + CHECK formato SAT |
| Listas fijas | text + CHECK (… in (…)) |
| Datos flexibles sin reglas | jsonb (solo si de verdad no se consultan/validan) |
Nunca float/real/double para dinero. Nunca text para fechas.

## Catálogos
- **FIJO** (lo define el sistema, el código depende de los valores): `text check (x in ('a','b'))`.
- **CONFIGURABLE** (el cliente agrega): tabla
```sql
create table tipos_x (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id),
  nombre text not null check (length(trim(nombre)) > 0),
  orden int not null default 0,
  es_sistema boolean not null default false,   -- seed protegido
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  unique (empresa_id, nombre)
);
```
- Seed por empresa: función `seed_<catalogo>(empresa_id)` llamada al crear empresa (trigger o RPC de onboarding).

## Unicidad
Siempre por empresa: `unique (empresa_id, codigo)`. Si hay baja lógica y se permite reutilizar: índice único parcial `where activo`.

## Estados
```sql
estado text not null default 'borrador'
  check (estado in ('borrador','confirmado','cancelado','cerrado'))
```
Transiciones válidas en función SQL o trigger, no solo en front. Documentar máquina de estados en el módulo.

## Documentos que congelan valores
Líneas de venta/pedido/reserva copian `precio_unitario`, `impuesto_tasa`, `descripcion` al crearse. Nunca se calculan leyendo el catálogo vivo.

## Totales
Calculados en BD (función o trigger) a partir de las líneas. El front solo muestra. Redondeo definido en un solo lugar.

## Folios
Consecutivo por empresa (y serie/sucursal si aplica) con tabla `folios (empresa_id, serie, ultimo)` y `update … returning` dentro de la misma transacción. Nunca `max()+1`.

## Procesos de varios pasos
Función RPC `security invoker` (o `definer` validando empresa del usuario) que hace todo en una transacción:
```sql
create or replace function cobrar_cuenta(p_cuenta_id uuid, p_pagos jsonb)
returns uuid language plpgsql security invoker as $$
begin
  -- validar estado con lock
  perform 1 from cuentas where id = p_cuenta_id and estado = 'abierta' for update;
  if not found then raise exception 'La cuenta no está abierta'; end if;
  -- insertar pagos, cerrar cuenta, mover inventario, etc.
  return p_cuenta_id;
end $$;
```

## Baja y borrado
- Por defecto baja lógica (`activo=false`).
- DELETE físico solo vía función que verifica que no haya movimientos, o si el dueño lo aprobó.
- FKs: `on delete restrict` por defecto. `cascade` solo para hijos que no tienen sentido sin el padre y sin historial propio (ej. líneas de un borrador).

## Índices
- Toda FK lleva índice.
- `(empresa_id, <campo de búsqueda>)` para listados/búsquedas.
- Índices parciales para estados activos si la tabla crece.

## Lovable
- `src/integrations/supabase/types.ts` se regenera: tras migración, regenerar tipos.
- Lovable tiende a validar solo en front: toda regla también va en BD.

## Reglas que dependen de la fecha actual
Nunca en CHECK (`check (fecha >= current_date - 3)`): los registros viejos dejan de cumplir y falla restaurar respaldos o re-validar. Van en trigger `before insert or update` o en la función RPC.
