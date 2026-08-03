# 01 · Arquitectura general

## 1. Qué es el sistema

RutApp es un **ERP SaaS multi-empresa para distribución y venta en ruta** (preventa,
reparto, autoventa). Un mismo despliegue atiende a muchas empresas ("licencias").
Cada empresa ve exclusivamente sus datos.

Tiene tres frentes de uso en la misma aplicación React:

| Frente | URL base | Layout | Usuario típico |
|---|---|---|---|
| **Escritorio / back-office** | `/dashboard`, `/ventas`, `/productos`, … | `AppLayout` | Administrador, capturista, supervisor |
| **Ruta móvil (PWA offline)** | `/ruta/*` | `MobileLayout` | Vendedor / repartidor en campo |
| **Público sin sesión** | `/`, `/precios`, `/catalogo/:token`, `/tienda/:slug`, `/pagar/:token` | ninguno / `TiendaLayout` | Prospecto o cliente final |

## 2. Stack

- **React 18 + TypeScript + Vite** (SPA, `react-router-dom` v6).
- **TanStack Query** para todo el estado de servidor (caché, invalidaciones, offline).
- **Zustand** (`src/stores/rutaStore.ts`) sólo para el estado local de la ruta móvil.
- **Tailwind CSS + shadcn/ui** (`src/components/ui/`), tokens semánticos en `src/index.css`.
- **Supabase (Lovable Cloud)**: Postgres + RLS + Auth + Storage + Realtime + Edge Functions (Deno).
- **PWA**: service worker generado por `vite-plugin-pwa` (`vite.config.ts`) + IndexedDB
  (`src/lib/offlineDb.ts`) para trabajar sin señal.
- **jsPDF** (import dinámico) para todos los PDF; **ESC/POS + Web Bluetooth** para tickets térmicos.

## 3. Estructura de carpetas

```
src/
├── App.tsx                  # ÚNICO lugar donde se declaran las rutas → ver docs/03
├── main.tsx                 # bootstrap, QueryClient, providers globales
├── contexts/AuthContext.tsx # sesión, profile, empresa activa, permisos base
├── pages/                   # una carpeta o archivo por vista (ver §6)
│   ├── VentaForm/           # vistas grandes = carpeta con index.tsx + hook + subcomponentes
│   ├── ventas/  ruta/  logistica/  tienda/  partner/  marketing/ ...
├── components/
│   ├── ui/                  # shadcn (no editar salvo necesidad real)
│   ├── layout/              # AppLayout, Sidebar, ListPage, OdooFilterBar, BulkActionsBar
│   ├── venta/ pos/ ruta/ lotes/ reportes/ ... # componentes por dominio
├── hooks/                   # capa de datos (React Query) + utilidades de UI
├── lib/                     # lógica pura: precios, impuestos, PDFs, tickets, sync, utils
├── types/index.ts           # tipos de dominio "amables" (Producto, Venta, Cliente…)
├── integrations/supabase/   # client.ts y types.ts AUTOGENERADOS — nunca editar
└── stores/rutaStore.ts

supabase/functions/          # Edge Functions (Deno): billing, WhatsApp, tienda, CFDI, IA
docs/                        # esta documentación
scripts/                     # auditorías y generadores (gen-docs-schema.ts)
```

**Regla de tamaño:** ningún archivo debe pasar de ~300 líneas. Las vistas grandes se
parten en `index.tsx` (montaje) + `useXForm.ts` (estado y mutaciones) + `XTab.tsx`
(secciones) + `types.ts`/`constants.ts`.

## 4. Multi-tenant: la regla más importante

Casi **toda** tabla de negocio tiene `empresa_id uuid NOT NULL` con FK a `empresas.id`.

1. **RLS en Postgres** filtra por la empresa del usuario autenticado. Es la barrera real.
2. **En el front**, además, toda query filtra por `empresa_id` **y** lo incluye en la
   *query key* de React Query:

```ts
useQuery({
  queryKey: ['productos', empresa?.id, filtros],   // ← empresa_id SIEMPRE en la key
  queryFn: () => supabase.from('productos').select('...').eq('empresa_id', empresa.id),
  enabled: !!empresa?.id,
});
```

Sin el `empresa_id` en la key, al cambiar de empresa (super admin) se muestran datos
de la empresa anterior. `scripts/audit-empresa-filter.ts` audita esto.

3. **Super admin** (`super_admins`, correo `diego.leon@uniline.mx`) puede suplantar la
empresa activa desde `SuperAdminEmpresaSelector`; el resto del código sigue leyendo
`empresa.id` del contexto, sin ramas especiales.

4. **Límite de 1000 filas de PostgREST**: para listados completos se usa
`fetchAllPages()` de `src/lib/supabasePaginate.ts` (itera con `.range()`).
`scripts/audit-pagination.ts` detecta queries sin paginar.

## 5. Autenticación, roles y permisos

```
auth.users (Supabase)
   └─ profiles          1:1  (user_id, empresa_id, almacen_id, nombre, ui_prefs…)
        ├─ roles        N:1  (rol por empresa)
        │    └─ role_permisos  (modulo_id, ver / editar / eliminar)
        ├─ vendedores / cobradores  (espejos sincronizados desde profiles)
        └─ super_admins (opcional, acceso global)
```

- `AuthContext` carga sesión → `profile` → `empresa` → rol y permisos.
- `usePermisos()` resuelve permisos por **módulo lógico** (`ventas`, `productos`, …).
  Es **estricto**: sin permiso explícito no hay acceso; **no hay herencia**.
- `PermissionGuard` envuelve rutas y acciones.
- Regla `solo_movil`: un vendedor marcado así nunca ve el botón "Ir a escritorio".
- Acciones críticas (borrar, editar precios en admin) piden **PIN** (`verify_admin_pin`).
- Nunca se guarda el rol en `profiles`: siempre en `roles` / `role_permisos`
  (evita escalación de privilegios).

## 6. Dónde nace cada vista

El flujo siempre es el mismo:

```
src/App.tsx  (<Route path="/ventas" element={<VentasListPage/>} />)
      ↓
src/pages/VentasListPage.tsx           ← "nace" la vista
      ↓ usa
src/components/layout/ListPage.tsx     ← shell estándar: header + filtros + tabla + paginación
src/components/layout/OdooFilterBar    ← búsqueda, fechas, filtros multi-select
src/hooks/useVentas.ts                 ← datos (React Query)
src/pages/ventas/*.tsx                 ← tabla desktop, fila expandible, tarjetas móvil
src/lib/*.ts                           ← cálculos, PDFs, tickets
```

El mapa exhaustivo ruta → componente → archivo está en
[docs/03-MAPA-DE-RUTAS.md](./03-MAPA-DE-RUTAS.md) (199 rutas).

Vistas de listado estandarizadas (todas comparten `ListPage`, altura fija de pantalla y
scroll únicamente en el contenedor de la tabla): Clientes, Productos, Ventas, Compras,
Cotizaciones, Traspasos, Proveedores, Listas de precio, Inventario, Lotes, Entregas…

Preferencias de listado (columnas visibles, filtros, rango de fechas) se persisten
**por usuario en localStorage** con `useListPreferences` + `useColumnPreferences`.

## 7. Capa de datos (hooks)

`src/hooks/` es la única puerta a Supabase desde la UI. Los más importantes:

| Hook | Responsabilidad |
|---|---|
| `useData.ts` | Catálogos: productos, clientes, marcas, unidades, almacenes, tarifas, impuestos… (~35 hooks) |
| `useVentas.ts` | Ventas y líneas, filtros de servidor, promociones aplicadas |
| `useClientes.ts` | Clientes, saldos, insights |
| `useLogistica.ts` / `useEntregas.ts` / `useCargas.ts` | Pedidos, entregas, cargas de camión |
| `useOfflineData.ts` / `usePendingQueue.ts` | Espejo IndexedDB y cola de sincronización |
| `usePromociones.ts` | Motor de promociones |
| `usePermisos.ts` / `useRoles.ts` / `useUsuarios.ts` | Seguridad |
| `useReportesData.ts` / `useDashboardData.ts` / `useControlData.ts` | Reportes, KPIs y auditoría |
| `useRealtimeInvalidate.ts` | Suscripciones Realtime → invalidación de caché |

**Convenciones de caché**

- Invalidación en `onSettled` sobre la **raíz** del key (`['productos']`), no sobre
  variantes: evita listas desfasadas.
- Realtime en lugar de polling; los canales se aíslan por `empresa_id`.
- `useBootstrapPrefetch` precarga catálogos al iniciar sesión.

## 8. Integridad de datos: el servidor manda

Todo lo que toca **dinero, stock o folios** se ejecuta en **RPC de Postgres atómicas**
con bloqueo de fila, nunca con varios `update` desde el cliente:

- Folios: `next_folio()` / `generate_folio()`.
- Cobros: `registrar_cobro()`, `aplicar_cobro()`, `reconciliar_saldos_cliente()`.
- Inventario: `surtir_linea_entrega*()`, `confirmar_traspaso()`, `registrar_merma()`,
  `recibir_linea_compra()`, `asignar_lote_masivo()`, `fn_disponible_almacen()`,
  `fn_disponible_lotes()`.
- Pedidos parciales: `cerrar_pedido_parcial()` / `reabrir_pedido_parcial()`.
- Promociones: `fn_reevaluar_promos_venta()`, `admin_reparar_promociones()`.

**Triggers clave** (no duplicar su lógica en el front):

| Trigger / función | Efecto |
|---|---|
| `trg_recalc_venta_saldo` → `fn_recalc_venta_saldo` | Recalcula `ventas.saldo_pendiente` al cambiar total o pagos |
| `fn_recalc_venta_header` | Recalcula subtotal/IVA/IEPS/total del encabezado desde las líneas |
| `trg_promocion_aplicada_netear` → `fn_netear_linea_promo` | Netea la línea cuando se registra/borra una promoción |
| `trg_fill_venta_linea_desglose` | Rellena el desglose de precios en líneas creadas por apps viejas |
| Trigger de entrega (`entregas.status = 'hecho'`) | Descuenta stock; idempotente ante cachés móviles viejas |
| `log_venta_historial` | Bitácora JSON de cambios de venta |

La lista completa de funciones está al final de
[docs/02](./02-ESQUEMA-BASE-DE-DATOS.md#funciones--rpc-disponibles).

## 9. Edge Functions (`supabase/functions/`)

Agrupadas por dominio:

- **Facturación / suscripciones**: `daily-billing`, `check-subscription`, `create-checkout`,
  `create-trial-checkout`, `customer-portal`, `manage-subscription`, `select-plan`,
  `openpay`, `openpay-public`, `purchase-timbres`, `purchase-route-credits`.
- **CFDI**: `facturama-reconcile`, `factura-redirect`, `parse-csf`, `admin-backfill-facturas`.
- **WhatsApp / correo**: `whatsapp-evolution`, `whatsapp-sender`, `wa-campaign`,
  `wa-scheduler-*`, `send-transactional-email`, `process-email-queue`.
- **Público sin sesión**: `public-catalog`, `cotizacion-publica`, `cliente-portal`,
  `tienda-*` (catálogo, login, checkout, pedidos).
- **IA**: `dashboard-ai-advisor`, `landing-chat`, `soporte-chat`, `onboarding-parse`.

Reglas: la clave service role sólo vive dentro de la función; toda función que no sea
pública valida el JWT y la pertenencia a la empresa.

## 10. Offline y PWA (ruta móvil)

1. Al iniciar jornada se descarga el paquete de datos a IndexedDB (`offlineDb.ts`):
   clientes, productos, precios/tarifas, promociones, stock del camión.
2. Ventas, cobros, entregas y gastos hechos sin señal se encolan
   (`syncQueue.ts`, `usePendingQueue`) con **folios híbridos** e IDs deterministas
   (`deterministicId.ts`) para que no se dupliquen al sincronizar.
3. `useNetworkStatus` + `useOnlineReconnect` disparan **sincronización delta**
   (no descarga completa) al recuperar señal; `dataSaver.ts` limita consumo de datos.
4. Assets estáticos se sirven `CacheFirst`; las imágenes se comprimen en canvas antes de subir.
5. `/ruta/sincronizar` y `/ruta/pendientes` permiten forzar sync y ver la cola;
   `Hard reset` limpia service worker y Cache Storage.

Consecuencia práctica: **una app móvil con caché viejo puede crear ventas con precios o
promociones desactualizados**. Por eso existen los triggers de reparación del §8.

## 11. Convenciones de código obligatorias

- Prohibido `any`; tipar con los tipos generados de Supabase o los de `src/types`.
- No editar: `src/integrations/supabase/client.ts`, `src/integrations/supabase/types.ts`, `.env`.
- Colores sólo con tokens semánticos del design system, nunca `text-white`/`bg-[#...]`.
- Dinero con `fmtMoney` / `roundMoney` (`src/lib/currency.ts`), fechas **DD/MM/YYYY**
  (`src/lib/date-format.ts`), zona horaria de la empresa (`empresas.zona_horaria`;
  los procesos de servidor usan `America/Mexico_City`).
- UI en español, identificadores técnicos en inglés.
- Funcionalidad nueva sale detrás de **feature flag** (`feature_flags`, Panel Master →
  "Funciones en pruebas"), probada primero con la licencia `12324489`.
- Terminología: en UI se dice **"Lista de precios"**, en base de datos la tabla es `tarifas`.
- Tests: `bunx vitest run` (`src/test/`, cubre precios, impuestos, promociones,
  distribución de pagos, cola de sync). E2E con Playwright en `e2e/`.
- Antes de entregar: `tsc --noEmit` en 0 errores.
