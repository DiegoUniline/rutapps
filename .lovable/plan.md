
# Reorganización de Navegación — RUTAPP

Análisis como Senior Product Designer. El sidebar actual tiene **14 grupos** con submenús anidados de hasta 9 items. Eso es ruido cognitivo: el usuario operativo (vendedor de ruta, cajera POS, supervisor) recorre los mismos 5–6 módulos todo el día y nunca toca los otros 30+.

## 1. Clasificación de módulos por frecuencia de uso real

### 🟢 Uso DIARIO — múltiples veces al día → **Sidebar fijo**
- **Dashboard** — pantalla de aterrizaje, KPIs del día
- **Punto de Venta (POS)** — caja activa todo el día
- **Ventas** (incluye Cotizaciones como tab) — captura constante de pedidos
- **Logística** (Pedidos · Pendientes · Entregas · Jornadas · Mapas)
- **Cobranza** (CxC, aplicar pagos, saldos cliente)
- **Clientes**
- **Reportes** (generales + personalizados + reporte diario)

### 🟡 Uso SEMANAL — 1–3 veces/semana → **Topbar "Operación"**
- Compras (órdenes, sugeridas, CxP, proveedores)
- Almacén (inventario, traspasos, ajustes, conteos)
- Promociones
- Devoluciones
- Liquidar ruta / Descargas
- Comisiones
- Gastos
- Supervisor / Monitor de rutas

### 🔵 Uso OCASIONAL — quincenal/mensual → **Topbar "Configuración"**
- Catálogos (Productos, Listas de precios, Categorías, Marcas, Unidades, Zonas)
- Proveedores
- Usuarios · Roles · Permisos
- Metas y seguimiento
- Vehículos · Almacenes
- WhatsApp · Bot WA
- Homologación de catálogo
- Facturación CFDI (+ avanzado)
- Saldos iniciales · Control · Auditoría
- Configuración general
- Mi suscripción · Tutoriales · Soporte · Actualizaciones

---

## 2. Nuevo layout

```text
┌──────────────────────────────────────────────────────────────────────┐
│  RUTAPP  [⌘K Buscar]      Operación ▾  Catálogos ▾  Config ▾   🔔 👤│ ← Topbar
├────────────┬─────────────────────────────────────────────────────────┤
│ 🏠 Inicio  │                                                         │
│ 🛒 POS     │                                                         │
│ 💵 Ventas  │              CONTENIDO                                  │
│ 🚚 Logística│                                                        │
│ 💰 Cobranza│                                                         │
│ 👥 Clientes│                                                         │
│ 📊 Reportes│                                                         │
│            │                                                         │
│ ⭐ Favoritos│                                                        │
│ ─────────  │                                                         │
│ v2026.06.x │                                                         │
└────────────┴─────────────────────────────────────────────────────────┘
```

### Sidebar (7 items + favoritos)
- Sin acordeones. Cada item es un destino directo; las sub-vistas viven como **tabs internos** de su página (ya existen en Ventas, Logística, Reportes, etc.).
- Conserva la marca de color por dominio (verde ingresos, cyan operaciones, ámbar finanzas) en el ícono — visual ya implementado, solo se reduce el set.
- Colapsable a íconos (estado actual).

### Topbar (3 menús de baja frecuencia, estilo Stripe)
1. **Operación ▾** — Compras, Almacén, Promociones, Devoluciones, Gastos, Liquidar Ruta, Comisiones, Supervisor.
2. **Catálogos ▾** — Productos, Listas de precios, Categorías, Marcas, Unidades, Zonas, Proveedores, Homologación.
3. **Configuración ▾** — Usuarios, Metas, Vehículos, Almacenes, WhatsApp, Bot WA, Facturación CFDI, Saldos iniciales, Control, Auditoría, General, Mi suscripción, Tutoriales, Soporte.

Cada menú es un `DropdownMenu` con secciones agrupadas (header gris + items). Estilo Stripe/Linear: tipografía pequeña, denso, 1 nivel.

### Mobile
La `MobileLayout` ya tiene la lógica correcta (5 tabs bottom + "Más"). Se ajusta el contenido de "Más" para reflejar la nueva taxonomía.

---

## 3. Justificación UX (resumen)

| Cambio | Por qué |
|---|---|
| 14 → 7 items en sidebar | Ley de Hick: tiempo de decisión escala con log(opciones). |
| Eliminar acordeones de nivel 2 | Doble navegación duplica clics; las páginas ya usan tabs internas. |
| Mover Catálogos al topbar | Se editan al onboarding y luego raras veces. No deben competir con ventas. |
| Configuración fuera del sidebar | Patrón validado: Stripe, Linear, HubSpot, Shopify Admin. |
| Cobranza promovida a top-level | Es trabajo diario, hoy está enterrada bajo "Ventas". |
| POS top-level | Es la pantalla de mayor uso por hora. |
| Reportes top-level | Consultado diariamente por dueños/supervisores. |

---

## 4. Alcance técnico

**Archivo principal:** `src/components/AppLayout.tsx`
- Reescribir `navItems` con los 7 destinos directos (sin `children`).
- Añadir un componente `<TopNavMenus />` en el header que renderice los 3 `DropdownMenu` con la taxonomía nueva.
- Conservar: PermissionGuard, filtrado por `PATH_MODULE_MAP`, favoritos, command palette (⌘K), superadmin selector, banners.
- No tocar rutas (`App.tsx`), no tocar permisos, no tocar lógica de negocio. Solo capa de presentación de navegación.

**Mobile:** ajuste menor a `MobileLayout.tsx` (`ALL_MORE_ITEMS`) — agregar Cobranza y Reportes como tabs principales del bottom nav del modo "clásico".

**No se cambia:**
- Rutas, permisos, tablas, edge functions.
- Páginas internas (siguen con sus tabs).
- Versión: bump a `2026.06.24.1`.

---

## 5. Riesgos / mitigaciones

- **Usuarios acostumbrados al sidebar viejo** → Command Palette (⌘K) ya existe y resuelve búsqueda directa de cualquier ruta. Favoritos preserva atajos personales.
- **Permisos** → cada link en topbar se filtra con `hasModulo()` igual que hoy.
- **Super admin** → conserva su selector de empresa y módulos extra (Facturación, Partners, DB Health) dentro de "Configuración ▾".

¿Confirmas para implementar?
