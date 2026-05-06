# Productos a granel con presentaciones (paquetes)

## Caso de uso
"Carne de Res" se vende a granel y el inventario se lleva en **kilos**, pero los vendedores manejan **paquetes** de 1, 2, 5, 7 kg, etc. Hoy cada producto tiene su propio stock; queremos que **todas las presentaciones descuenten kilos del mismo producto madre**.

Ejemplo: vender 2 paquetes de 7 kg → descontar **14 kg** del stock de "Carne de Res".

---

## Resumen de la solución

1. Cada producto a granel (`es_granel = true`) puede tener una lista de **presentaciones** (1 kg, 2 kg, 5 kg, 7 kg…), cada una con un **factor en unidad base** (kg).
2. Al vender, el usuario puede:
   - Tocar una presentación + cantidad (rápido, factor fijo).
   - Editar el peso real del paquete si varía (ej. 7 → 7.250).
   - O capturar peso libre directamente (sin presentación).
3. El **stock siempre se descuenta en la unidad base** (kg). La presentación es solo presentación: línea = `cantidad_paquetes × factor_kg`, y eso es lo que se mueve en inventario.
4. **Precio por kg** como base. Cada presentación puede tener un **precio especial** opcional (descuento por volumen). Si no, se calcula como `precio_kg × factor`.

---

## Cambios técnicos

### 1. Base de datos (migración)

Nueva tabla:
```
producto_presentaciones
- id, empresa_id, producto_id (FK)
- nombre (ej. "Paquete 7 kg")
- factor_base   numeric(12,3)   -- cuántos kg representa
- precio_especial numeric(12,2) NULL  -- override opcional
- orden int, activo bool
- created_at, updated_at
- RLS por empresa_id (mismo patrón que productos)
```

En `venta_lineas` y `entrega_lineas` agregar columnas opcionales (no rompen nada existente):
```
- presentacion_id uuid NULL
- presentacion_nombre text NULL          -- snapshot para historia
- presentacion_factor numeric(12,3) NULL -- snapshot
- paquetes numeric(12,3) NULL            -- # paquetes capturados (UI)
```

`cantidad` sigue siendo la cantidad en **unidad base (kg)** — así el trigger de inventario y todos los reportes existentes siguen funcionando sin cambios.

### 2. Producto (formulario)
- En `ProductoForm`, cuando `es_granel = true`, mostrar nueva sub-tab **"Presentaciones"**.
- CRUD inline: nombre, factor (kg), precio especial (opcional), orden, activo.

### 3. POS y App Móvil de ruta
- Al agregar un producto granel al carrito:
  - Si tiene presentaciones, abrir un **selector**: chips con cada presentación + opción "Peso libre".
  - Chip seleccionado → input de # paquetes (entero por defecto, editable a decimal).
  - "Peso libre" → input directo en kg con 3 decimales (comportamiento actual).
- La línea se guarda con `cantidad = paquetes × factor`, snapshot de la presentación, y precio = `precio_especial ?? precio_kg × factor`.
- Indicador en línea: "2 × Paquete 7 kg = 14.000 kg".

### 4. Stock / inventario
- Sin cambios en triggers ni en `stock_almacen`: ya descuenta `cantidad` (kg).
- En vistas de stock se sigue mostrando en kg (correcto). Opcionalmente, en el detalle del producto, mostrar "equivalente: ~14 paquetes de 1 kg" como info.

### 5. Tickets / PDFs
- Si la línea tiene `presentacion_nombre`, mostrar: `2 × Paquete 7 kg (14.000 kg) — $X`.
- Si no, mostrar como hoy (`14.000 kg`).

### 6. Importación masiva / catálogos públicos
- Fuera de alcance esta iteración (se maneja después si hace falta). El catálogo público sigue mostrando precio por kg.

---

## Archivos principales a tocar
- `supabase/migrations/...` (nueva tabla + columnas)
- `src/pages/ProductoForm/` (nueva tab Presentaciones)
- `src/pages/ruta/RutaNuevaVenta/StepProductos.tsx` + `useRutaVenta.ts` + `types.ts`
- `src/pages/VentaForm/VentaLineaDesktop.tsx` y `VentaLineaMobile.tsx` (POS escritorio)
- `src/lib/salePricing.ts` / `posPricing.ts` (cálculo cuando hay presentación)
- `src/lib/ventaPdf.ts`, `ticketHtml.ts`, `entregaPdf.ts` (mostrar presentación)

---

## Lo que NO cambia
- El stock se sigue almacenando y mostrando en la unidad base (kg).
- Productos no-granel siguen igual.
- Triggers de inventario, kardex, balances y reportes existentes siguen funcionando porque `cantidad` mantiene su semántica (unidad base).

¿Procedo con esta implementación o quieres ajustar algo (nombres, alcance de la primera entrega, etc.)?
