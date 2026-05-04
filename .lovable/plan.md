## Objetivo

Agregar 3 nombres alternativos al producto, estilo Odoo, para que cada documento (compra, venta, ticket) muestre el nombre apropiado, con fallback automático al nombre principal cuando estén vacíos.

## Campos nuevos en `productos`

1. **`nombre_compra`** (text, nullable) — Nombre del producto en órdenes de compra y documentos al proveedor.
2. **`nombre_venta`** (text, nullable) — Nombre que aparece en cotizaciones, notas de venta, facturas y PDFs.
3. **`nombre_ticket`** (text, nullable) — Nombre corto/optimizado para tickets de POS y tickets térmicos (impresora 58/80mm).

Regla universal de fallback (estilo Odoo):
```
nombreMostrado = campoEspecífico?.trim() || producto.nombre
```

## UI — Formulario de producto

En `src/pages/ProductoForm/ProductoGeneralFields.tsx`, debajo del campo "Nombre" actual, agregar una sección colapsable **"Nombres alternativos (opcional)"**:

```text
┌─ Nombres alternativos (opcional) ──────────────┐
│ Nombre en Compras   [____________________]     │
│ (si está vacío usa: "Nombre")                  │
│                                                │
│ Nombre en Ventas    [____________________]     │
│ (si está vacío usa: "Nombre")                  │
│                                                │
│ Nombre en Ticket    [____________________]     │
│ (corto, para tickets térmicos)                 │
└────────────────────────────────────────────────┘
```

- Placeholders muestran el nombre principal en gris para dejar claro qué se usará si se deja vacío.
- Sin validaciones obligatorias.

## Helper centralizado

Crear `src/lib/productoNombres.ts` con utilidades reutilizables:

```ts
export const getNombreCompra = (p) => p?.nombre_compra?.trim() || p?.nombre || '';
export const getNombreVenta  = (p) => p?.nombre_venta?.trim()  || p?.nombre || '';
export const getNombreTicket = (p) => p?.nombre_ticket?.trim() || p?.nombre_venta?.trim() || p?.nombre || '';
```

Esto garantiza coherencia y un solo lugar para cambiar la lógica.

## Aplicación en el sistema

Actualizar los puntos donde se renderiza el nombre del producto, respetando el patrón de fallback de 3 niveles ya documentado en memoria (cache → JOIN → snapshot de línea):

**Ventas (usar `getNombreVenta`):**
- `src/pages/VentaForm/VentaPdfHandler.ts` (PDF de venta/cotización/nota)
- Listas de productos en POS y `VentaForm` (tabla de líneas)
- `src/components/facturacion/CfdiHistory.tsx`
- `src/components/venta/VentaEntregasTab.tsx`

**Tickets (usar `getNombreTicket`):**
- Componente unificado de ticket térmico POS/Ruta
- Reimpresión desde Cobranzas

**Compras (usar `getNombreCompra`):**
- Formulario de compras y su PDF
- Reportes/listas de compras al proveedor

**Snapshot en líneas (importante):**
Al crear una venta/compra, guardar en la columna `descripcion` de la línea el nombre ya resuelto con el helper correspondiente. Así, aunque el producto cambie de nombre después, los documentos históricos conservan el texto original (ya respetado por el patrón de fallback existente).

## Migración de base de datos

```sql
ALTER TABLE public.productos
  ADD COLUMN nombre_compra text,
  ADD COLUMN nombre_venta  text,
  ADD COLUMN nombre_ticket text;
```

Sin defaults: `NULL` significa "usar el nombre principal".

## Memoria

Crear `mem://features/producto-nombres-multiples` documentando los 3 campos, el helper y la regla de fallback, para que futuras pantallas lo apliquen automáticamente.

## Versión

Bump `APP_VERSION` en `src/version.ts`.

## Resumen para el usuario

- El campo "Nombre" sigue siendo el principal y obligatorio.
- Los 3 nuevos campos son **opcionales**: si los dejas vacíos, el sistema usa el nombre principal automáticamente.
- "Nombre Ticket" cae primero a "Nombre Venta" y luego al principal, ideal para abreviar en impresoras térmicas.
- Igual que Odoo: un producto, varios nombres según el contexto del documento.