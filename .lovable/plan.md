## Objetivo

Permitir que cada vendedor cobre comisión bajo UNO de dos modelos:

- **Por producto** (lo actual): % por línea de venta, registrado en `venta_comisiones`.
- **Por volumen** (nuevo): se calcula sobre el total vendido en un periodo, con tres modalidades:
  - % fijo sobre el total
  - Escalones (tiers): distinto % según el monto alcanzado
  - Bono al alcanzar una meta (monto fijo o % extra)

Cada vendedor usa solo uno de los dos esquemas. Configurables por vendedor: el periodo (semanal / quincenal / mensual) y la base (solo cobradas / todas las ventas).

## Cambios de base de datos

Nueva tabla `comision_esquemas` (multi-tenant, RLS por `empresa_id`):

- `nombre` (texto)
- `tipo`: `'producto' | 'volumen_pct' | 'volumen_tiers' | 'bono_meta'`
- `periodo`: `'semanal' | 'quincenal' | 'mensual'`
- `base`: `'cobradas' | 'todas'`
- `config` (JSON): guarda el % fijo, los escalones, o `{ meta, bono, bono_pct }` según `tipo`.
- `activo` (bool)

En `profiles`: nueva columna `comision_esquema_id` (FK a `comision_esquemas`, nullable). Null = mantiene comportamiento actual por producto.

Trigger `venta_comisiones`: si el vendedor tiene un esquema de volumen asignado, no se insertan filas por línea (queda excluyente, evita doble pago).

## UI

1. **Ajustes → Comisiones (nueva sección)**
   - Lista de esquemas, botón "Nuevo esquema".
   - Formulario según tipo: % fijo, editor de escalones (desde/hasta/%), o meta + bono.
   - Selector de periodo y base.
   - Asignación rápida: tabla de vendedores con dropdown "Esquema de comisión".

2. **Finanzas → Comisiones**: nueva pestaña **"Por volumen"** al lado de "Por pagar".
   - Selector de periodo (auto-detecta según vendedor) con navegación anterior/siguiente.
   - Tarjeta por vendedor mostrando: total vendido en el periodo (filtrado por base), comisión calculada según su esquema, y desglose (tier alcanzado o meta cumplida).
   - Botón "Generar recibo" que crea un `pago_comisiones` con el monto calculado y marca el periodo como pagado (snapshot del cálculo).
   - Filtro existente "cobradas / pendientes / todas" se sigue aplicando para la pestaña "Por producto"; la pestaña de volumen respeta lo configurado en el esquema.

3. **Etiqueta visual**: en la lista de vendedores, mostrar chip "Por producto" o "Por volumen (semanal 5%)" para que sea obvio qué esquema tiene cada uno.

## Recibos

`pago_comisiones` ya existe. Se reutiliza, agregando dos columnas opcionales:

- `tipo_calculo` (`'producto' | 'volumen'`)
- `periodo_desde` / `periodo_hasta` y `detalle_calculo` (JSON con el desglose: ventas incluidas, tier aplicado, etc.) para auditoría y reimpresión del recibo.

## Detalles técnicos

- Esquemas son por empresa (RLS estándar con `empresa_id`).
- El cálculo de volumen se hace **en el servidor** vía RPC `calcular_comision_volumen(vendedor_id, periodo_desde, periodo_hasta)` para evitar manipulación desde el cliente.
- La pestaña "Por volumen" llama a la RPC y solo presenta resultados.
- Al generar recibo de volumen: insert en `pago_comisiones` + (opcional) marca las ventas del periodo con `comision_volumen_pagada = true` para que no se vuelvan a contar.
- Periodo "semanal" = lunes–domingo; "quincenal" = 1–15 y 16–fin de mes; "mensual" = 1–fin de mes. Todo en `zona_horaria` de la empresa.

## Fuera de alcance (por ahora)

- Mezclar ambos esquemas para un mismo vendedor (excluyente confirmado).
- Esquemas por equipo / supervisor.
- Edición retroactiva de recibos ya generados.
