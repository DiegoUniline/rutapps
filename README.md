# Rutapp: Ventas Inteligentes

RUTAPP – Sistema SaaS de Venta en Ruta

Construye la primera pantalla del módulo Productos & Tarifas de Rutapp, un SaaS multiempresa de venta en ruta. Stack: React + TypeScript + Tailwind + Supabase. Diseño: limpio, profesional, estilo Odoo moderno, responsive mobile-first.

ARQUITECTURA MULTIEMPRESA Cada empresa (empresa_id) es tenant independiente. Todas las tablas llevan empresa_id. El usuario autenticado pertenece a una empresa. No hay datos cruzados entre empresas.

MÓDULO: PRODUCTOS

Tabla productos:

id, empresa_id, codigo, nombre, clave_alterna, marca_id, proveedor_id,
costo, clasificacion_id, lista_id, imagen_url, precio_principal,
se_puede_comprar, se_puede_vender, vender_sin_stock, se_puede_inventariar,
es_combo, min, max, manejar_lotes, unidad_compra_id, unidad_venta_id,
factor_conversion, permitir_descuento, monto_maximo, cantidad,
tiene_comision, tipo_comision (enum: porcentaje/monto_fijo), pct_comision,
status (enum: activo/inactivo/borrador), almacenes (array),
tarifas (array de tarifa_id), tiene_iva, tiene_ieps,
tasa_iva_id, tasa_ieps_id, calculo_costo (enum), codigo_sat, udem_sat_id,
contador, contador_tarifas, created_at

Vista listado (tabla):

Columnas: Imagen miniatura · Código · Nombre · Marca · Precio Principal · IVA · Status · Acciones

Chips de status con color (activo=verde, inactivo=rojo, borrador=gris)

Búsqueda por nombre/código, filtro por status/clasificación/marca

Paginación

Botón "+ Nuevo Producto" top-right

Click en fila → abre detail/form

Vista detalle/formulario — Tabs:

Tab 1: General

Campos: Código, Nombre, Clave Alterna, Marca (select), Proveedor (select), Clasificación (select), Lista (select), Imagen (upload), Status

Toggle group visual: Se puede Comprar / Se puede Vender / Inventariar / Vender sin Stock / Es Combo / Manejar Lotes

Min / Max stock

Tab 2: Precios & Tarifas Mostrar un selector prominent al inicio del tab:

[ • Usar Precio Único ]   [ • Usar Tarifas ]

Modo Precio Único: campo precio_principal grande y visible. Toggle Permitir Descuento → si activo, muestra campo Monto Máximo Descuento.

Modo Tarifas: tabla inline de tarifas asignadas al producto (desde tabla tarifas). Columnas: Nombre Tarifa · Precio · Tipo (general/cliente/ruta) · Vigencia · Activa. Botón "Agregar Tarifa" tipo Odoo (link teal). Las tarifas se gestionan en su propio módulo pero aquí se visualizan y asignan.

Tab 3: Fiscal

IVA (toggle) → si activo: selector Tasa IVA

IEPS (toggle) → si activo: selector Tasa IEPS

Código SAT (input)

Unidad de Medida SAT (select udem_sat)

Cálculo de Costo (select: promedio/último/estándar/manual)

Tab 4: Unidades & Conversión

Unidad de Compra (select)

Unidad de Venta (select)

Factor de Conversión (decimal)

Tab 5: Comisiones

Toggle ¿Maneja Comisión?

Tipo: Porcentaje / Monto Fijo

Valor (% o $)

Tab 6: Almacenes

Multiselect de almacenes disponibles del tenant

MÓDULO: TARIFAS

Tabla tarifas:

id, empresa_id, nombre, descripcion, tipo (enum: general/por_cliente/por_ruta),
moneda, vigencia_inicio, vigencia_fin, activa, created_at

Tabla tarifa_lineas:

id, tarifa_id, producto_id, precio, precio_minimo, descuento_max, notas

Vista listado: tabla con Nombre · Tipo · Vigencia · # Productos · Activa · Acciones Vista detalle:

Header: Nombre, Tipo, Moneda, Vigencia (date range picker), toggle Activa

Tabla editable de líneas: Producto (search-select) · Precio · Precio Mínimo · Descuento Máx · Notas · Eliminar

Botón "Agregar Producto" estilo Odoo (link teal + Agregar una línea)

DISEÑO UI:

Sidebar izquierdo con módulos (Productos, Tarifas, Clientes, Rutas, Pedidos, Facturación, Reportes)

Top bar con logo Rutapp, nombre empresa activa, avatar usuario

Paleta: blanco base, gris muy claro para fondos de sección, azul marino #1a2e4a para sidebar, acento teal #00897b

Formularios con secciones colapsables tipo Odoo

Botones: Guardar (azul), Descartar (outline), Eliminar (rojo ghost)

Mobile: sidebar como drawer, tabs como scroll horizontal, tablas con scroll horizontal

Toasts para éxito/error

Loading skeletons en listas

SUPABASE:

Genera el schema SQL completo con RLS por empresa_id

Usa supabase-js para todas las operaciones

Auth con supabase.auth, el empresa_id viene del perfil del usuario

Empieza con el módulo Productos (listado + formulario completo con tabs) y el módulo Tarifas. Navbar lateral funcional. Todo en español.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://rutapps.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/5c545640-926f-4707-956f-099e41383e51).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
