## Tienda en línea por empresa — `rutapp.mx/tienda/:slug`

Tienda pública por empresa donde **el cliente se loguea con su correo/teléfono**, ve los productos con **su Lista de Precios asignada**, arma carrito y envía el pedido. Entra al sistema como **Pedido (venta en estado `borrador`/`pedido`, no entregado)**, igual que un pedido normal.

### 1. Base de datos (migración)

**Tabla `tienda_config`** (1 por empresa):
- `empresa_id` (unique), `slug` (unique, ej. `botanas-don-nacho`), `activa`, `nombre_tienda`, `banner_url`, `logo_url`, `color_primario`, `whatsapp_pedidos`, `lista_precios_default_id` (para visitantes sin login), `permitir_invitados` (bool), `mensaje_bienvenida`.

**Tabla `tienda_clientes`** (login del cliente final):
- `id`, `empresa_id`, `cliente_id` (FK a `clientes`), `email`, `password_hash` *(o auth.users link)*, `telefono`, `verificado`, `ultimo_login`.
- El cliente al loguearse ve la `lista_precios_id` asignada en su registro `clientes`.

**Tabla `tienda_pedidos`** (staging antes de convertirse a venta):
- Se crea como `venta` con `estado_logistica = 'pedido'`, `origen = 'tienda_web'`, `vendedor_id = null` (o usuario sistema), `cliente_id` del logueado.
- Nuevo enum value en `ventas.origen`: `'tienda_web'`.

### 2. Backend (Edge Functions)

Reutilizar/extender `public-catalog`:
- `tienda-resolve` → recibe `slug`, devuelve config + lista default.
- `tienda-login` → email/pass o magic link → token JWT scoped a `empresa_id + cliente_id`.
- `tienda-catalog` → con token devuelve productos con precios resueltos de **su lista asignada** (usa `priceResolver` existente).
- `tienda-checkout` → recibe carrito + token → crea `venta` en estado `pedido` + `venta_lineas` + notificación interna al admin.

### 3. Frontend público (rutas nuevas)

```
/tienda/:slug                  → Home (hero, banners, categorías destacadas, productos top)
/tienda/:slug/productos        → Grid con filtros (categoría, marca, precio, búsqueda)
/tienda/:slug/producto/:id     → Detalle con galería, stock, "agregar al carrito"
/tienda/:slug/carrito          → Carrito + resumen
/tienda/:slug/checkout         → Datos de envío + confirmar pedido
/tienda/:slug/login            → Login / registro cliente
/tienda/:slug/mis-pedidos      → Historial del cliente
```

Diseño **Rutapp brand**: blanco, azul `#0061e8`, naranja `#ff7a00`, negro. Layout estilo e-commerce premium: header sticky con buscador grande, categorías horizontales, grid 4 col desktop / 2 col móvil, hover cards con sombra, badges de descuento naranjas, CTA azules, footer con WhatsApp.

### 4. Admin (panel existente)

Nueva sección **Configuración → Tienda en línea**:
- Toggle activar/desactivar.
- Editar slug, logo, banner, mensaje, WhatsApp.
- Lista de precios default para visitantes.
- Vista previa con link copiable `rutapp.mx/tienda/{slug}`.
- Lista de **Clientes registrados en tienda** (gestionar accesos).
- Los pedidos entran a `/ventas` filtrables por `origen = tienda_web` con badge "🌐 Tienda".

### 5. Multi-tenant + seguridad

- RLS estricto: `tienda_clientes` solo ve su propio `cliente_id`; edge function valida `cliente_id ∈ empresa_id`.
- Stock se valida al checkout (no se aparta, se respeta `vender_sin_stock`).
- Pedidos NO descuentan inventario (entran como pedido borrador, se procesan manualmente).

### 6. Detalles técnicos

- Auth de cliente final: tabla propia `tienda_clientes` con `bcrypt` vía edge function (NO usar `auth.users` para no mezclar con usuarios admin del sistema).
- Token: JWT firmado con secret, almacenado en localStorage del navegador del cliente.
- Imágenes: usar `imagen_url` existente de productos.
- Carrito: localStorage por slug.
- Sin pagos online en v1 → confirmación de pedido + notificación al admin por WhatsApp/email.

### Entrega por fases

**Fase 1** (esta entrega): Migración + edge functions + tienda pública funcionando con login, carrito y checkout → pedido en sistema.
**Fase 2**: Panel admin de configuración + gestión de clientes tienda.
**Fase 3** (futuro, si pides): pagos online, cupones, seguimiento de pedido, reseñas.

---

¿Avanzo con **Fase 1 completa** en este turno (base de datos + edge functions + frontend público con diseño Rutapp brand)?
