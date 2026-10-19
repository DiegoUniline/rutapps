---
name: rendimiento-escalabilidad
description: Diseño y optimización de consultas, índices y crecimiento en Postgres/Supabase (EXPLAIN, paginación, N+1, agregados, realtime, archivado, particionamiento) y en AppSheet/Sheets. Úsala al proponer un modelo de datos, al revisar pantallas/reportes lentos o al estimar cómo crecerá el sistema.
---

# Consultas, rendimiento y escalabilidad

## Diseña desde las consultas
Antes de cerrar un modelo, lista las consultas reales (pantallas, búsquedas, reportes, dashboards) con sus filtros y orden. El modelo e índices se diseñan para ellas.

## Estimar volumen
Filas = empresas × registros por empresa por día × días de retención.
Ejemplo: 300 restaurantes × 400 líneas de pedido/día × 365 = 43.8 M filas/año en `pedido_lineas`.
Umbrales orientativos (Supabase, hardware estándar):
- < 1 M filas: casi cualquier cosa funciona con índices básicos.
- 1–50 M: índices compuestos correctos, paginación keyset, agregados precalculados para reportes.
- > 50 M o crecimiento continuo: archivado, particionamiento por fecha, vistas materializadas, réplicas de lectura.

## Índices
- Toda FK con índice.
- Compuesto empezando por `empresa_id`, luego filtro de igualdad, luego rango/orden:
  `create index on pedidos (empresa_id, estado, created_at desc);`
- Parciales para subconjuntos calientes: `... where estado = 'abierto'`.
- Búsqueda de texto: `pg_trgm` con índice GIN para `ilike '%texto%'`; full-text (`tsvector`) para búsquedas de palabras.
- Únicos parciales con baja lógica: `create unique index ... where activo`.
- No indexes todo: cada índice cuesta en escrituras. Justifica cada uno con una consulta.

## Verificar con EXPLAIN
```sql
explain (analyze, buffers) select … ;
```
Busca: `Seq Scan` en tablas grandes, `rows` estimadas muy distintas de las reales, `Sort` en disco. Corre `analyze <tabla>` tras cargas grandes.
Supabase: `pg_stat_statements` para las consultas más costosas; advisors de rendimiento.

## Patrones en el front (Lovable/React + supabase-js)
- Nunca traer todo: `.select('col1,col2')` explícito, nunca `*` en listados grandes.
- Paginación keyset para listas largas: `.lt('created_at', ultimo).order('created_at',{ascending:false}).limit(50)`; `range()`/offset solo para listas chicas.
- Evitar N+1: usar joins embebidos de PostgREST (`select('*, cliente:clientes(nombre)')`) o una RPC/vista.
- Conteos: `count: 'exact'` es caro en tablas grandes; usar `estimated` o contadores mantenidos.
- Reportes y dashboards: RPC con agregados en SQL, no sumar en JavaScript.
- Debounce en búsquedas; cache (React Query) con invalidación por evento.

## Agregados y reportes
- Totales del documento guardados en el encabezado (calculados en BD), no recalculados en cada lectura.
- Reportes históricos: tablas resumen diarias (`ventas_diarias`) mantenidas por trigger o job, o vistas materializadas con `refresh materialized view concurrently` programado.
- Nunca reportes pesados sobre la misma tabla transaccional en horas pico si pueden precalcularse.

## Concurrencia y bloqueos
- Operaciones críticas en RPC con `select … for update` sobre la fila específica, transacciones cortas.
- Folios con tabla de contadores (`update … returning`), nunca `max()+1`.
- Idempotencia: llave única de operación (`idempotency_key`) para pagos, webhooks y reintentos.

## Realtime
- Suscribirse por filtro (`empresa_id=eq.X`, `sucursal_id=eq.Y`), nunca a la tabla completa.
- Solo tablas que de verdad lo necesitan (cocina, tablero, mapa). Las políticas RLS aplican y cuestan por cada evento.

## Crecimiento
- Retención: definir con el dueño cuánto historial vive en la tabla caliente.
- Archivado: mover a `<tabla>_historico` o particiones antiguas por job.
- Particionamiento por rango de fecha (`partition by range (created_at)`) cuando una tabla supera decenas de millones y las consultas filtran por fecha.
- Archivos (fotos, PDFs, XML): Supabase Storage, nunca base64 en la BD.
- Edge functions: tiempos y memoria limitados; procesos largos en jobs/colas (pg_cron, pgmq).

## AppSheet / Google Sheets
- Una hoja degrada con decenas de miles de filas y fórmulas: limitar con security filters, mover histórico a otra hoja/archivo, preferir columnas reales sobre virtuales costosas (SELECT/LOOKUP sobre tablas grandes).
- Si el volumen proyectado supera lo que Sheets aguanta, proponer migrar esa tabla a una BD (Cloud SQL/Supabase) conectada a AppSheet.

## Documentar
En cada módulo, sección "Consultas y escalabilidad": consulta → filtros → índice → volumen 1 y 3 años → estrategia.
