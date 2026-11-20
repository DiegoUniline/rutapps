# Sistema de diseño — RutApp (pantallas administrativas)

Reglas de presentación vigentes para todo lo que NO está en `src/pages/ruta/`. Complementa D-029 (`docs/decisiones.md`).

## Colores de botones (D-029)
- Azul sólido: confirmar, guardar, cobrar, crear/nueva (`btn-odoo-primary`, `Button` default).
- Naranja: editar (`btn-odoo-editar`, `Button variant="editar"`).
- Rojo contorno: cancelar, eliminar, devolución (`btn-odoo-danger`, `Button variant="destructive"`).
- Gris contorno: secundarias, consulta, impresión, exportar (`btn-odoo-secondary`, `Button variant="outline"`).
- Solo colores del tema RutApp.

## Teléfono (360–430 px) y tablet (768 px)
- **Listas en teléfono = tarjeta estándar.** Debajo de `md` (768 px, `useIsMobile()`) toda lista administrativa se muestra como tarjetas `ListaTarjetaMovil` (`src/components/layout/ListaTarjetaMovil.tsx`), el mismo diseño que la lista móvil de Ventas: título (cliente/proveedor/producto), subtítulo con folio o referencia, estado como badge (`StatusChip`), campos en dos columnas (fecha, monto, saldo opcional…) y acciones de la fila en el menú «⋯». Contenedor y estado vacío con `ListaTarjetasMovil`. Desde `md` se conserva la tabla.
  - Tocar la tarjeta abre el detalle (si la fila de escritorio se expande, en teléfono navega al detalle).
  - Si la lista tiene selección masiva, el checkbox va como `leading` de la tarjeta.
  - Solo presentación: las tarjetas usan los mismos datos ya cargados para la tabla; no se agregan consultas.
- Encabezados de detalle: `flex-wrap`; acciones secundarias en el menú «⋯» (`MasAccionesMovil`) en teléfono; regresar con ícono solo y `aria-label`.
- KPIs: 2–3 columnas compactas en teléfono (menos padding, texto `text-lg`), nunca una por renglón.
- Diálogos: `w-[calc(100vw-1rem)]`, `max-h` con scroll interno.
- Sin scroll horizontal de página: tablas que deban quedarse con `overflow-x-auto` contenido.
- Gutter 12–16 px; objetivos táctiles ≥ 36–40 px; acciones que en escritorio aparecen al pasar el mouse se muestran siempre en pantallas táctiles (`[@media(hover:none)]:opacity-100`).
