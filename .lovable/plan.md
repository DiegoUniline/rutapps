
Problema aislado: sí sé qué está pasando. El stock actual y el historial de ajustes se están mezclando de forma engañosa.

1. Hallazgo principal
- En los datos actuales de RubiPets, hoy:
  - GUA20 tiene 10 en Ruta Chica y 0 en Ruta Grande.
  - GUAJR20 está en 0.
- El desfase que ves no parece ser solo “stock mal guardado”; también hay un error de historial:
  - `src/pages/AjustesInventarioPage.tsx` agrupa por `fecha + user + motivo + almacen`.
  - Eso junta varios conteos/ajustes distintos del mismo día en una sola tarjeta.
  - Por eso una tarjeta puede enseñar movimientos mezclados que no corresponden al stock final actual.

2. Plan de corrección
- Separar cada corrida de ajuste en un lote real:
  - agregar un `batch_id`/`lote_id` en `ajustes_inventario`
  - al aplicar ajustes o reinicio, generar un solo lote y guardarlo en todas las filas de esa operación
  - mostrar el historial agrupado por ese lote, no por día/motivo
- Unificar la lógica de actualización de stock:
  - crear una sola rutina reutilizable para:
    1) guardar ajuste
    2) upsert en `stock_almacen`
    3) recalcular `productos.cantidad` como suma de ubicaciones
    4) registrar movimiento
  - reutilizarla tanto en `AjustesInventarioPage` como en `ConteoDetailModal`
- Corregir refresco/caché:
  - agregar `stock_almacen` al offline cache (`offlineDb` y `offlineSync`)
  - forzar refresco local después de ajustes para que móvil, ubicaciones y rutas vean el mismo dato
- Validar con el caso RubiPets:
  - revisar GUA20 y GUAJR20 después del cambio
  - confirmar que historial y stock final coincidan en Ruta Chica, Ruta Grande y Almacén General

3. Archivos a tocar
- `src/pages/AjustesInventarioPage.tsx`
- `src/components/conteos/ConteoDetailModal.tsx`
- `src/lib/offlineDb.ts`
- `src/lib/offlineSync.ts`
- `src/hooks/useOfflineData.ts`
- posible migración nueva en `supabase/migrations/` para `ajustes_inventario.batch_id`

4. Cambio técnico propuesto
- Base de datos:
  - añadir `batch_id uuid`
  - indexarlo
  - opcionalmente backfill básico para históricos recientes usando cercanía de `created_at`
- Frontend:
  - reemplazar el agrupado actual del historial por `batch_id`
  - al terminar un ajuste, invalidar queries y disparar refresco offline
- Integridad:
  - usar `upsert` consistente en `stock_almacen`
  - recalcular siempre el global desde ubicaciones, nunca “a ojo”

5. Resultado esperado
- Cada ajuste aparecerá como una operación separada y entendible.
- El stock final de cada ubicación coincidirá con el historial de esa operación.
- Las vistas de inventario, rutas activas y móvil dejarán de mostrar números distintos por caché o agrupación incorrecta.

6. Validación que haré al implementarlo
- Caso 1: mismo producto ajustado varias veces el mismo día en la misma ruta
  - debe verse en varias tarjetas/lotes separados
- Caso 2: reinicio a ceros después de un conteo
  - el historial debe mostrar primero el conteo y luego el reinicio, no mezclados
- Caso 3: RubiPets
  - GUA20: Ruta Chica 10
  - GUAJR20: 0
  - historial separado y consistente con esas existencias
