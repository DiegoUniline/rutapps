# Solicitudes de traspaso / resurtido con mínimos y máximos por almacén

## Lo que ya existe (auditoría)

- `stock_almacen(empresa_id, almacen_id, producto_id, cantidad)` es la existencia física por almacén.
- `stock_apartado` guarda lo comprometido por pedidos; disponible = físico − apartado.
- `traspasos` + `traspaso_lineas` + `traspaso_linea_lotes` es el documento de transferencia, con estados `borrador / confirmado / cancelado`.
- `confirmar_traspaso(p_traspaso_id, p_user_id)` y `cancelar_traspaso(...)` son RPC atómicas con `FOR UPDATE` que mueven stock y escriben `movimientos_inventario` (tipo `transferencia`/`entrada`/`salida`). **Este sigue siendo el único motor de inventario.**
- `productos.min` / `productos.max` son globales (se conservan, pero dejan de usarse para resurtido).
- Offline: `syncQueue` es genérico por tabla (`queueInsert/queueUpdate`), con id local inmutable, reintentos y clasificación de errores. No requiere cambios estructurales.

## Arquitectura propuesta

La solicitud es un **documento previo** que NO toca inventario. Al surtir, genera un `traspaso` real y llama a `confirmar_traspaso`. Cero lógica de inventario duplicada.

```text
stock bajo -> solicitud BORRADOR -> SOLICITADA -> APROBADA
   -> surtir (parcial o total) -> crea traspaso + confirmar_traspaso()
   -> stock sale de origen y entra a destino -> PARCIALMENTE_SURTIDA / SURTIDA
```

## Esquema SQL (nuevo)

**`producto_almacen_config`** — mínimos/máximos por producto + almacén
- `id, empresa_id, producto_id, almacen_id, stock_minimo numeric NOT NULL DEFAULT 0, stock_maximo numeric NOT NULL DEFAULT 0, activo, created_at, updated_at`
- `UNIQUE (producto_id, almacen_id)`, índices en `empresa_id`, `almacen_id`, `producto_id`
- CHECK `stock_maximo >= stock_minimo`

**`solicitudes_traspaso`** — encabezado
- `id (uuid, generado en cliente = id local inmutable), empresa_id, folio, fecha, status, almacen_origen_id (default Almacén General), almacen_destino_id, solicitante_user_id, observaciones, aprobado_por, aprobado_at, rechazado_por, rechazado_at, motivo_rechazo, created_at, updated_at`
- Enum `status_solicitud_traspaso`: `borrador, solicitada, aprobada, parcialmente_surtida, surtida, rechazada, cancelada`
- Folio `SOL-000123` vía trigger reutilizando `next_folio(prefix, empresa_id)`

**`solicitud_traspaso_lineas`** — detalle con trazabilidad completa
- `id, solicitud_id, producto_id, presentacion_id (nullable), stock_actual_snapshot, stock_minimo_snapshot, stock_maximo_snapshot, cantidad_sugerida, cantidad_solicitada, cantidad_aprobada, cantidad_surtida (acumulada), notas`
- Los snapshots preservan el histórico aunque después cambien los mínimos/máximos.

**`solicitud_traspaso_surtidos`** — un renglón por evento de surtido, ligado al traspaso que movió inventario
- `id, solicitud_id, traspaso_id (FK a traspasos), surtido_por, created_at`

**`solicitud_traspaso_historial`** — auditoría de eventos
- `id, solicitud_id, accion (creada/modificada/enviada/aprobada/rechazada/surtida/cancelada), user_id, detalle jsonb, created_at`

Todas: `GRANT SELECT/INSERT/UPDATE/DELETE` a `authenticated`, `GRANT ALL` a `service_role`, RLS activada con políticas por `empresa_id` usando el helper existente + override de super admin, igual que el resto del sistema.

## Funciones / RPC

- `fn_sugerencias_resurtido(p_almacen_id)` → productos del almacén con `stock_actual <= stock_minimo`, devolviendo actual, mínimo, máximo y sugerido (`max − actual`).
- `enviar_solicitud_traspaso(p_solicitud_id)` → valida líneas > 0, pasa a `solicitada`, registra historial.
- `aprobar_solicitud_traspaso(p_solicitud_id, p_lineas jsonb)` → fija `cantidad_aprobada` por línea, valida contra disponible del origen (`físico − apartado`), pasa a `aprobada`.
- `surtir_solicitud_traspaso(p_solicitud_id, p_lineas jsonb)` → **atómica**: bloquea la solicitud, crea `traspasos` (tipo `almacen_almacen`) + `traspaso_lineas`, llama `confirmar_traspaso`, acumula `cantidad_surtida`, registra el surtido y ajusta estado a `parcialmente_surtida` o `surtida`.
- `rechazar_solicitud_traspaso` y `cancelar_solicitud_traspaso`.

Todas `SECURITY DEFINER` con `SET search_path = public`, validando `empresa_id` del usuario dentro de la función y con `FOR UPDATE` sobre la solicitud.

## Frontend — panel administrativo

- **Configuración de mínimos/máximos**: nueva pestaña en el detalle de producto (matriz producto × almacén, editable inline) y edición masiva desde `/inventario` por almacén.
- **`/almacen/solicitudes`** (lista): filtros por folio, fecha, almacén origen/destino, solicitante, estado y producto; fila expandible con detalle, historial y traspasos generados.
- **`/almacen/solicitudes/:id`** (detalle/edición): en borrador permite agregar/quitar productos, botón **Agregar productos por resurtir**, cambiar cantidades y observaciones. En `solicitada` muestra columna *Cantidad aprobada* editable + disponible del origen. En `aprobada` muestra el modal **Surtir** con cantidades pendientes.
- Acciones: Guardar borrador · Enviar solicitud · Aprobar · Rechazar · Surtir · Cancelar, siguiendo el estándar visual actual (etiqueta izquierda / valor derecha).

## Frontend — móvil (`/ruta`)

- Nueva entrada **Solicitar mercancía** en el menú de ruta.
- Pantalla de lista con las solicitudes propias y su estado.
- Alta: botón *Sugerir por mínimos* (llena desde la config del almacén de la ruta), búsqueda de productos para agregar manualmente, y por producto se muestra Existencia / Mínimo / Máximo / Sugerido con el input de cantidad editable.
- Acciones **Guardar borrador** y **Enviar solicitud**.

## Offline

- Borradores y envíos usan el `syncQueue` actual: `id` uuid generado localmente (inmutable), `queueInsert`/`queueUpdate` sobre las tablas nuevas, reintentos y resolución de conflictos ya existentes.
- Nuevos stores en `offlineDb` para solicitudes, líneas y la config de mínimos/máximos del almacén de la ruta (se descargan en el sync scoped del vendedor).
- La aprobación y el surtido son **solo en línea**: cualquier afectación de inventario se confirma en servidor mediante RPC, evitando duplicidades.

## Indicadores de inventario

En `/inventario` y en el stock de ruta, etiqueta discreta por fila:
- **Sin existencia** cuando `stock = 0`
- **Stock bajo** cuando `stock <= mínimo`
- sin etiqueta cuando está correcto

## Fuera de alcance

No se modifica el motor de traspasos, el cálculo de existencias, apartados, ventas ni entregas. Los `productos.min/max` globales quedan intactos.
