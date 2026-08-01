# Diagnóstico: consumo de 4 GB de datos móviles en un mes

## Resumen de la causa

La causa principal **no** es la sincronización maestra (esa sí usa deltas y está bien acotada). Es el hook `useOfflineQuery`, que usan casi todas las pantallas de `/Ruta`: cada pantalla, además del sync maestro, **descarga la tabla COMPLETA del servidor** (`select('*')`, sin ventana de fechas, paginando hasta el último renglón), con un anti-repetición de apenas **30 segundos por consulta**.

Lo que eso significa en una empresa real (Distribuidora Tampico, medido hoy):

| Tabla | Filas | Peso en BD | Peso aprox. en JSON por descarga |
|---|---|---|---|
| ventas (completa, sin ventana) | 4,660 | 1.0 MB | ~2.5–3 MB |
| clientes | 1,626 | 0.55 MB | ~1.4 MB |
| cobros | 4,513 | — | ~1.5 MB |

Y `ventas` se pide con **4 llaves de caché distintas** (RutaVentas, RutaCobrar, RutaCxC, RutaDashboard), así que el throttle de 30 s no se comparte: navegar entre pantallas vuelve a bajar todo. Un vendedor que trabaja 8 h y cambia de pantalla constantemente baja fácilmente **100–200 MB al día → 3–4 GB al mes**. Coincide exactamente con lo reportado.

## Causas secundarias confirmadas (multiplican el efecto)

1. **Tormenta de invalidaciones por Realtime.** En `useData.ts`, los canales de `venta_lineas`, `entrega_lineas` y `cobro_aplicaciones` **no llevan filtro de empresa** y cada evento invalida `ventas`, `ventas-list` y `venta-lineas`, sin debounce. Una venta de 10 renglones dispara 10+ refetch de listas pesadas (`ventas` con `venta_lineas(*, productos(...))` y `fetchAllPages`).
2. **Imágenes a resolución completa en móvil.** `RutaStock`, `ProductoDetalleModal` y `RutaClienteDetalle` pintan `imagen_url` / `foto_url` crudas, sin miniatura (`useThumb`) y sin `loading="lazy"`. Promedio real en Storage: 84 KB por imagen de producto (máximo 6 MB) y 133 KB por foto de ruta (máximo 11 MB). Un catálogo de 1,600–4,900 productos hace decenas de MB por sesión.
3. **Fotos subidas sin comprimir en algunos flujos** (hay objetos de hasta 11 MB en `ruta-fotos`); la subida también consume del plan de datos.
4. **Sync completo forzado en cada cambio de versión de la app.** Cada publicación dispara `downloadAllData` (además de re-bajar el bundle). Con publicaciones frecuentes esto suma.
5. Menores y ya razonables: latido GPS 60 s (~1 MB/mes), chequeo de conexión 15 s, refresco de "pendientes" cada 3 s (solo IndexedDB, sin red).

## Plan de corrección (por impacto)

### 1. Cortar la doble descarga en `/Ruta` (el 80% del problema)
- `useOfflineQuery`: dejar de hacer `select('*')` de tabla completa. Pasar a modo **cache-first real**: si IndexedDB tiene datos y el sync maestro corrió hace menos de X minutos, **no** ir al servidor.
- Cuando sí haya que ir al servidor, hacerlo **delta por `updated_at`** (igual que el sync maestro) y con **ventana de 30 días** para tablas transaccionales (`ventas`, `cobros`, `venta_lineas`, `entregas`, `gastos`, `devoluciones`), nunca la tabla histórica completa.
- Subir el TTL de 30 s a varios minutos y **compartir el throttle por tabla**, no por combinación de filtros, para que cambiar de pantalla no vuelva a descargar.
- Limitar columnas (`select` explícito) en lugar de `*`.

### 2. Domar el Realtime
- Filtrar `venta_lineas` / `entrega_lineas` / `cobro_aplicaciones` por empresa (por `venta_id` del tenant o agregando `empresa_id` a la suscripción donde exista la columna).
- Agrupar las invalidaciones con un debounce de ~2–3 s para que una venta de N renglones provoque **un** refetch, no N.
- En móvil, no invalidar listas pesadas: refrescar solo el registro afectado.

### 3. Imágenes
- Usar `useThumb()` (miniatura de Storage) en `RutaStock`, `ProductoDetalleModal`, `RutaClienteDetalle` y demás vistas móviles; añadir `loading="lazy"` y `decoding="async"`.
- Verificar que la transformación de imágenes esté activa; si no lo está, generar miniaturas al subir.
- Forzar compresión antes de subir en todos los flujos de foto (hoy hay archivos de hasta 11 MB).

### 4. Modo ahorro de datos por defecto en móvil
- Activar "Ahorro de datos" por defecto para perfiles de ruta (hoy está apagado), lo que ya salta el fetch al servidor cuando hay datos locales y espacia los intervalos.
- Mostrar en Ruta › Sincronizar un contador de **MB descargados** por sesión y en el mes, para poder medir la mejora con datos reales.

### 5. Medición
- Instrumentar el sync maestro y `useOfflineQuery` con un acumulador de bytes (tamaño de respuesta) guardado en IndexedDB, para comparar antes/después y detectar regresiones.

## Detalles técnicos

Archivos a tocar: `src/hooks/useOfflineData.ts` (núcleo del arreglo), `src/hooks/useData.ts` (Realtime), `src/lib/dataSaver.ts` (default móvil), `src/pages/ruta/RutaStock.tsx`, `src/components/ruta/ProductoDetalleModal.tsx`, `src/pages/ruta/RutaClienteDetalle.tsx` (miniaturas), `src/lib/offlineSync.ts` (exponer helpers de ventana/cursor para reutilizarlos en `useOfflineQuery`) y `src/pages/ruta/RutaSincronizarPage.tsx` (contador de MB).

Sin cambios de base de datos: las columnas `updated_at` y sus triggers ya existen en `productos`, `clientes`, `stock_almacen`, `stock_apartado`, `ventas` y `cobros`. Cero cambios de esquema, cero riesgo para saldos o inventario: solo se toca **cuánto y cada cuándo** se descarga.

Prueba primero con Licencia 12324489 y luego con Distribuidora Tampico (el caso más pesado) antes de liberar.
