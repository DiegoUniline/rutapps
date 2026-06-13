## Idea
El botón "Marcar recibida" debe aparecer **siempre que quede producto pendiente por recibir**, sin importar el estado de pago. El usuario puede recibir línea por línea o todo de un jalón. Así ellos mismos arreglan los casos viejos (COM-0001, COM-0002, etc.) sin migración correctiva.

## Cambios

### 1. Base de datos
Agregar `cantidad_recibida NUMERIC NOT NULL DEFAULT 0` a `compra_lineas` para llevar el avance real de recepción por línea.

Modificar el RPC `recibir_linea_compra` para que:
- Reciba `p_cantidad` (piezas a recibir ahora, no el total).
- Sume al `cantidad_recibida` de la línea (con `FOR UPDATE` para evitar dobles).
- Rechace si `cantidad_recibida + p_cantidad > cantidad * factor_conversion`.
- Sume stock + cree `movimientos_inventario` solo por lo recibido en esa llamada (idempotente y parcial).
- Cuando todas las líneas de la compra estén 100% recibidas, marque la compra como `recibida` automáticamente.

Backfill: para compras existentes con `status in ('recibida','pagada')` setear `cantidad_recibida = cantidad * factor_conversion` (ya están reflejadas en stock). Para `borrador`/`confirmada`/`cancelada` queda en 0 → ahí es donde el usuario podrá presionar el botón y completar lo que falte (incluyendo los casos rotos como COM-0001/COM-0002).

### 2. UI — Formulario de Compra
- Mostrar en cada línea: `recibido X / Y` y un botón **"Recibir"** (recibe el faltante de esa línea). Habilitado mientras `cantidad_recibida < cantidad_total` y la compra no esté `borrador`/`cancelada`.
- Botón global **"Marcar todo recibido"** en el header: visible mientras exista al menos una línea con faltante. Recibe el pendiente de cada línea en una sola operación.
- El status de la compra se actualiza por el RPC, no por el frontend.
- Quitar la restricción actual de que solo aparece en `confirmada`: ahora aparece también si está `pagada` con faltantes (caso COM-0001 actual).

### 3. Pagos (sin cambios respecto al turno anterior)
Pagar sigue sin tocar el status; el saldo baja y ya. Recibir y pagar son independientes.

## Detalles técnicos

Archivos:
- Migración SQL: columna `compra_lineas.cantidad_recibida`, nueva versión de `recibir_linea_compra(p_compra_id, p_linea_id, p_cantidad, p_almacen_id, p_empresa_id, p_user_id, p_folio)`, backfill.
- `src/pages/CompraForm/types.ts`: agregar `cantidad_recibida` a `CompraLinea`.
- `src/pages/CompraForm/useCompraForm.ts`:
  - Hidratar `cantidad_recibida` desde la query.
  - Nuevas funciones `recibirLinea(idx)` y `recibirTodo()` que llaman al RPC con el faltante (`pendiente = cantidad*factor - cantidad_recibida`).
  - Quitar el loop actual de recibir dentro de `handleStatusChange`.
- `src/pages/CompraForm/CompraLineasTab.tsx`: columna "Recibido" + botón "Recibir" por línea.
- `src/pages/CompraForm/CompraHeader.tsx`: reemplazar el botón actual por "Marcar todo recibido" condicionado a `hayPendiente`.

Invalidaciones: `['compra', id]`, `['compras']`, `['inventario']`, `['productos']`, `['stock-almacen']`.

## Resultado para el usuario
- Carlos entra a COM-0001, ve que dice "Recibido 0/50" en cada línea, le pica "Marcar todo recibido" y el stock se suma. Cero migración correctiva, cero soporte.
- Puede recibir parcial cuando llega media compra, terminar el resto otro día.
- Pagar antes/después de recibir es indistinto.
