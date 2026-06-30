
## Diagnóstico

Los 2 errores del screenshot vienen del **orden** en que se encolan las operaciones al guardar una venta con devoluciones en `src/pages/ruta/RutaNuevaVenta/useRutaVenta.ts`:

```
queueOperation('devoluciones', insert, { venta_id: ventaId, … })   ← línea 626
queueOperation('devolucion_lineas', insert, { devolucion_id, … })  ← línea 629
… (más items) …
queueOperation('ventas', insert, { id: ventaId, … })               ← línea 734
queueOperation('venta_lineas', …)                                  ← línea 737
```

El `syncQueue` procesa por `createdAt` ascendente, así que en el primer pase:

1. **`devoluciones`** se envía **antes** que `ventas` → Postgres rechaza con `23503` (FK `devoluciones_venta_id_fkey`) porque la venta aún no existe en el servidor. Se difiere correctamente (`isFkMissing`), pero **queda con `createdAt = Date.now() + 1000`**.
2. **`devolucion_lineas`** se envía antes que su padre devolución exista en servidor → `42501` RLS. También se difiere.
3. La `ventas` sí se sube bien y desaparece de la cola — por eso en el screenshot **solo quedan** la devolución y su línea.

A partir de ahí el reintento automático **no se vuelve a disparar** solo: `processSyncQueue()` arranca por `queueOperation` (no hay más) o por `useOnlineReconnect` (no hay cambio de red). El usuario está online y mirando la página, pero no pasa nada — por eso ves "Intentos: 1, hace 55s" permanentes. El stock sí se restauró porque ese path es el trigger BD sobre `devolucion_lineas`, pero aplicado **localmente** en IndexedDB; en servidor sigue pendiente.

## Plan de corrección (mínimo, sin tocar UI ni lógica de negocio)

### 1) `src/pages/ruta/RutaNuevaVenta/useRutaVenta.ts` — orden de encolado
Mover el bloque `if (devoluciones.length > 0 && clienteId) { … }` (líneas 623–700) para que se ejecute **después** del `queueOperation('ventas', 'insert', …)` de la línea 734 (y también después del loop de `venta_lineas` para mantener coherencia padre→hijo). Así el primer pase ya encuentra la venta en servidor y la devolución entra a la primera.

No se cambia ningún cálculo, ni el restablecimiento de stock local, ni el contenido de los payloads — solo se reordena la inserción en la cola.

### 2) `src/lib/syncQueue.ts` — orden topológico padre→hijo
Antes de iterar `items`, ordenar usando una prioridad por tabla (padres primero), con `createdAt` como desempate:

```
PRIORIDAD: ventas, cargas, devoluciones, cobros, entregas, compras, cotizaciones, traspasos, mermas, descarga_ruta, cfdis, conteos_fisicos, auditorias, ...
HIJOS:     venta_lineas, carga_lineas, devolucion_lineas, cobro_aplicaciones, entrega_lineas, compra_lineas, ...
```

Esto cubre cualquier futuro path donde alguien encole un hijo antes del padre sin que el síncer se atore.

### 3) `src/lib/syncQueue.ts` — reintento inmediato dentro del mismo pase
Cuando un item se difiere por `isFkMissing` o RLS y dentro del **mismo pase** se sincroniza un item de la tabla padre que faltaba, hacer un segundo barrido de los items diferidos al final del loop. Evita esperar 30s a la siguiente ventana.

### 4) `src/pages/ruta/PendientesSincronizarPage.tsx` — re-trigger periódico
Mientras la página esté visible y haya items, llamar `processSyncQueue()` cada 15s si `isOnline`. Es un seguro para casos viejos ya en cola por bugs anteriores, sin requerir que el usuario presione "Reintentar todo".

### Recuperación de los 2 items del screenshot
Tras subir el fix, esos 2 items se reintentan solos en el siguiente pase (paso 4) o al tocar "Reintentar todo". No requieren limpieza manual: la venta ya existe en servidor, así que la devolución y su línea pasarán a la primera.

## Detalles técnicos

- Solo se editan 2 archivos de lógica (`useRutaVenta.ts`, `syncQueue.ts`) y 1 de UI mínima (`PendientesSincronizarPage.tsx`).
- Nada cambia en el esquema BD, RLS, triggers ni en los componentes de devoluciones.
- El restablecimiento de stock al almacén del vendedor sigue idéntico (lo aplica el trigger BD `trg_apply_devolucion_linea_inventory` cuando la línea sube; localmente ya se reflejó vía IndexedDB).
- Se bumpea `src/version.ts` para forzar refresco PWA.

¿Procedo?
