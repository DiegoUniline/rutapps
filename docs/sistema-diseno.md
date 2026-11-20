# Sistema de diseño — RutApp (pantallas administrativas)

Reglas de presentación vigentes para todo lo que NO está en `src/pages/ruta/`. Complementa D-029 (`docs/decisiones.md`).

## Colores de botones (D-029)
- Azul sólido: confirmar, guardar, cobrar, crear/nueva (`btn-odoo-primary`, `Button` default).
- Naranja: editar (`btn-odoo-editar`, `Button variant="editar"`).
- Rojo contorno: cancelar, eliminar, devolución (`btn-odoo-danger`, `Button variant="destructive"`).
- Gris contorno: secundarias, consulta, impresión, exportar (`btn-odoo-secondary`, `Button variant="outline"`).
- Solo colores del tema RutApp.

## Teléfono (360–430 px) y tablet (768 px)
- **Hoja única (D-037).** Fondo de la app gris; todo el contenido de cada pantalla en una sola hoja blanca (`bg-card border rounded-xl shadow-sm`), sin cuadros anidados: secciones separadas por `border-t`/`divide-y`, KPIs como franja con `divide-x`. `ListPage` ya pinta la hoja (Header/Toolbar/Footer con `px-3 md:px-4`, Body `card` = solo línea arriba); fuera de `ListPage` se usa `p-2 md:p-4` + hoja. No poner `overflow-hidden`/`rounded` en ancestros de un área con scroll.
- **Listas en teléfono (estándar de Productos, sustituye a la «tarjeta de Ventas»).** Debajo de `md` (768 px, `useIsMobile()`), con los componentes de `src/components/layout/ListaTarjetaMovil.tsx`:
  - `EncabezadoListaMovil`: título `text-lg` (si el filtro de estado no es el de por omisión, «· Estado» en pequeño) y botón redondo «+» (`h-10 w-10 bg-primary`) para Nuevo; acciones secundarias de la pantalla como botones redondos (`extra`). Debajo, `OdooFilterBar` a lo ancho con placeholder corto («Buscar …»); el estado/pestañas de estado pasa a la opción «Estado» de Filtros (selección única). Sin tarjetas de resumen, sin pestañas de estado y sin paginación arriba.
  - `ListaTarjetasMovil`: un solo contenedor con renglones `divide-y` (dentro de la hoja va a todo lo ancho `-mx-3 md:-mx-4 border-y`; `aLoAncho` en hojas propias) y al final «Cargar más (n de total)» de 50 en 50 (`useCargarMasMovil` para listas en memoria; en listas paginadas en servidor se sube el `pageSize` en página 1 y el hook usa `placeholderData` para no parpadear).
  - `ListaTarjetaMovil`: renglón-botón con título `text-primary` truncado, segunda línea gris (monto · fecha · folio) y a la derecha una píldora con el dato clave (`estadoPildora()` o saldo/monto; verde `bg-success/10`, rojo `bg-destructive/10`, aviso, primario o neutro `bg-accent`). «⋯» solo cuando la lista no tiene pantalla de detalle o la acción rápida es indispensable.
  - Escritorio sin cambios: se conserva la tabla.
- **Detalles en teléfono (ejemplo `CompraHeaderMovil`).** Renglón 1: regresar + título truncado + chip de estado + «⋯» (`MenuAcciones`, destructivas en rojo). Debajo, solo 1–2 acciones principales a lo ancho (`flex-1 h-10`, D-029, texto corto sin montos: «Recibir», «Cobrar», «Guardar»…). Todo lo demás dentro de «⋯».
- Encabezados de detalle: `flex-wrap`; acciones secundarias en el menú «⋯» (`MasAccionesMovil`) en teléfono; regresar con ícono solo y `aria-label`.
- KPIs: 2–3 columnas compactas en teléfono (menos padding, texto `text-lg`), nunca una por renglón.
- Diálogos: `w-[calc(100vw-1rem)]`, `max-h` con scroll interno.
- Sin scroll horizontal de página: tablas que deban quedarse con `overflow-x-auto` contenido.
- Gutter 12–16 px; objetivos táctiles ≥ 36–40 px; acciones que en escritorio aparecen al pasar el mouse se muestran siempre en pantallas táctiles (`[@media(hover:none)]:opacity-100`).
