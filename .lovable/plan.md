## Problema

En `/ruta/gastos`, al registrar un gasto el listado no refleja el nuevo registro al instante. Hay que recargar la vista para verlo.

## Causa

`RutaGastos.tsx` usa `useOfflineQuery('gastos', ...)`. El flujo de `refetch()` después del insert:

1. `queueOperation` escribe el registro en IndexedDB y lo encola para sync.
2. `loadData` lee IndexedDB → muestra el nuevo gasto.
3. Si hay conexión, **inmediatamente** consulta al servidor con `fetchAllPages` y **sobrescribe** el estado con `serverData`. Como la cola aún no terminó de sincronizar (o el realtime del servidor todavía no propaga), el `serverData` no incluye el nuevo registro y el gasto recién creado “desaparece” visualmente hasta el siguiente refresh manual.

Además, no hay suscripción Realtime para `gastos`, por lo que cambios hechos desde otros dispositivos (ej. desktop) tampoco se ven al instante.

## Solución

1. **Habilitar Realtime en `gastos`** vía migración:
   ```sql
   ALTER PUBLICATION supabase_realtime ADD TABLE public.gastos;
   ALTER TABLE public.gastos REPLICA IDENTITY FULL;
   ```

2. **Suscribir `RutaGastos.tsx` a cambios Realtime** filtrados por `empresa_id`, y en cada evento llamar `refetch()` (que ya re-lee IndexedDB + servidor). Esto refleja inserts/updates/deletes de cualquier origen.

3. **Evitar el “parpadeo a vacío” tras insertar**: en `useOfflineQuery`, no sobrescribir `data` con `serverData` cuando:
   - el fetch al servidor falla, o
   - `serverData.length === 0` pero IndexedDB tiene registros locales (potencialmente pendientes de sync).

   Mantener los datos locales hasta que el servidor confirme un set no vacío o el sync queue procese los pendientes (`uniline:sync-complete` ya dispara refetch).

4. **Forzar refetch tras sync exitoso**: ya existe el listener `uniline:sync-complete` — verificar que `syncQueue` emite ese evento tras subir el gasto (sí lo hace en el flujo actual).

## Archivos a tocar

- Nueva migración `supabase/migrations/*_realtime_gastos.sql`
- `src/pages/ruta/RutaGastos.tsx` — agregar `useEffect` con `supabase.channel('gastos-ruta').on('postgres_changes', { event: '*', schema: 'public', table: 'gastos', filter: 'empresa_id=eq.<id>' }, refetch).subscribe()` con cleanup.
- `src/hooks/useOfflineData.ts` — no sobrescribir con `serverData` vacío si hay `hasLocalData`.

## Alcance

Sólo afecta la vista móvil `/ruta/gastos` y el hook genérico `useOfflineQuery` (mejora silenciosa para todas las vistas offline-first).