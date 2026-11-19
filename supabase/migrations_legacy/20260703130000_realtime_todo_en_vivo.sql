-- TIEMPO REAL EN TODO EL SISTEMA (sin inflar el costo).
--
-- El dueño quiere que cualquier cambio se refleje al instante en todas las
-- pantallas. Hoy solo ~15 tablas estaban en la publicación supabase_realtime;
-- muchas vistas operativas (cotizaciones, descargas, ajustes, traspasos,
-- compras, mermas, conteos, caja, tarifas, listas de precio, proveedores,
-- jornadas de ruta, apartados) NO empujaban cambios en vivo.
--
-- Esta migración agrega esas tablas a la publicación. Todas tienen empresa_id,
-- así que el hook useRealtimeInvalidate (que filtra por empresa_id) funciona tal
-- cual y NO hay fuga de tráfico entre empresas.
--
-- DECISIONES DE COSTO/EGRESS (a propósito):
--   1. NO se agrega movimientos_inventario: es append-only de alto volumen; cada
--      venta/ajuste/traspaso inserta filas y generaría una lluvia de eventos.
--      En su lugar se escuchan las CABECERAS (ajustes_inventario, traspasos),
--      que son de bajo volumen y ya reflejan el cambio.
--   2. NO se usa REPLICA IDENTITY FULL: el patrón solo invalida y refresca (no
--      lee la fila anterior del evento), así que la identidad por PK basta y
--      genera mucho menos WAL/tráfico de replicación. (Efecto secundario menor:
--      los borrados FÍSICOS no se empujan en vivo; se ven al siguiente refetch.
--      En este sistema los registros se cancelan por status, no se borran, así
--      que en la práctica no se nota.)
--
-- Idempotente: solo agrega la tabla si existe y si aún no está publicada.

DO $$
DECLARE
  t text;
  tbls text[] := ARRAY[
    'stock_apartado',       -- arregla bug: InventarioPage se suscribía sin estar publicada
    'cotizaciones',
    'descarga_ruta',
    'ajustes_inventario',
    'tarifas',
    'lista_precios',
    'proveedores',
    'traspasos',
    'compras',
    'mermas',
    'conteos_fisicos',
    'caja_turnos',
    'caja_movimientos',
    'ruta_sesiones',
    'cliente_orden_ruta'
  ];
BEGIN
  FOREACH t IN ARRAY tbls LOOP
    -- Solo si la tabla realmente existe (evita fallar si algún nombre difiere).
    IF to_regclass('public.' || t) IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = t
      ) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
      END IF;
    END IF;
  END LOOP;
END $$;
