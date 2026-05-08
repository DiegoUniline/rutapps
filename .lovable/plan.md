# Mostrar en el mapa el orden guardado por cliente / vendedor / día

## Estado actual

✅ **Lo que YA funciona** (no hay que tocar):
- Tabla `cliente_orden_ruta` con columnas `cliente_id`, `vendedor_id`, `dia`, `orden`, `origin_lat`, `origin_lng`, `origin_label`.
- Cada vez que se optimiza, `persistOrder()` borra el grupo (vendedor+día) e inserta 1..N.
- Al cargar el mapa, `savedOrder` query trae esas filas y arma `multiResults[].optimized_order`.

❌ **Lo que NO funciona** (origen del bug de duplicados):
El marcador (línea 922) pinta `c.orden`, que es el campo legacy de la tabla `clientes` (manual, sin unicidad). Nunca lee del orden guardado en `cliente_orden_ruta`.

## Cambios (solo frontend, `src/pages/MapaClientesPage.tsx`)

1. **Construir `ordenRutaMap`** (`useMemo`) a partir de `multiResults`:
   - Para cada ruta visible (`routeVisibility[vendedor_id]` true), recorrer `optimized_order` y mapear `clienteId → posición (1..N)`.
   - Cada cliente solo aparece en una ruta del grupo, por lo que no hay colisiones.

2. **Reemplazar `c.orden` por `ordenRutaMap.get(c.id)`** en:
   - Filtro de marcadores numerados (línea 909): `ordenRutaMap.has(c.id)` en vez de `c.orden > 0`.
   - Label del pin (línea 922): `${ordenRutaMap.get(c.id)}`.
   - InfoWindow "Orden de ruta" (líneas 968-969).

3. **Fallback opcional**: si NO hay ruta optimizada guardada para el filtro actual (`ordenRutaMap` vacío), mostrar pines sin número (cluster gris) en lugar de caer al `c.orden` legacy. Así nunca vuelven a aparecer los duplicados.

## Resultado

- Filtrando "Viernes + VENDEDOR 2-4-6" → 51 pines numerados **1..51 únicos**, en el orden real que generó el optimizador y que está guardado en BD.
- Cambiar el filtro a otro día/vendedor → muestra el orden guardado de ESE grupo (cada combinación tiene su propia secuencia).
- Multi-vendedor (sin filtro) → cada ruta mantiene su 1..N por color, sin colisiones entre grupos.

## Lo que NO se toca
- Edge function `optimize-route` (sin cambios).
- Esquema de BD (la tabla ya tiene todo lo necesario).
- Lógica de filtros (ya funciona correctamente).
