-- Devoluciones atascadas: causa raíz del error
--   "invalid input value for enum tipo_devolucion: —"
--
-- Builds viejos de la PWA encolaron devoluciones con tipo = un guion basura
-- ("—", "–" o "-"). Esas operaciones viven en la cola offline del teléfono del
-- vendedor y, al sincronizar, la base de datos las rechaza porque ese valor no
-- es válido en el enum. Por más que el vendedor le da "Reintentar", vuelve a
-- fallar por la misma razón y nunca se libera.
--
-- Solución (parte 1 de 2): aceptar las variantes de guion como valores del enum
-- para que la operación deje de rebotar y la devolución por fin entre. La parte
-- 2 (normalización a un valor válido + limpieza) va en la siguiente migración,
-- de modo que NUNCA quede basura almacenada.
--
-- Se cubren las tres variantes de guion más probables porque no sabemos con
-- certeza cuál encoló el build viejo:
--   —  guion largo (em dash, U+2014)
--   –  guion medio (en dash, U+2013)
--   -  guion normal (hyphen-minus, U+002D)
--
-- IMPORTANTE: ADD VALUE va SOLO en su propia migración. PostgreSQL no permite
-- USAR un valor de enum recién agregado dentro de la misma transacción que lo
-- agrega; por eso la normalización va en un archivo aparte.
ALTER TYPE public.tipo_devolucion ADD VALUE IF NOT EXISTS '—';
ALTER TYPE public.tipo_devolucion ADD VALUE IF NOT EXISTS '–';
ALTER TYPE public.tipo_devolucion ADD VALUE IF NOT EXISTS '-';
