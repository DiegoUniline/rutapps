-- Add batch_id to ajustes_inventario for proper grouping
ALTER TABLE public.ajustes_inventario ADD COLUMN IF NOT EXISTS batch_id uuid;
CREATE INDEX IF NOT EXISTS idx_ajustes_inventario_batch_id ON public.ajustes_inventario(batch_id);

-- Backfill: group rows created within 3 seconds of each other with same user/motivo/almacen
WITH ranked AS (
  SELECT id, user_id, motivo, almacen_id,
    created_at,
    LAG(created_at) OVER (PARTITION BY user_id, motivo, almacen_id, fecha ORDER BY created_at) AS prev_at
  FROM public.ajustes_inventario
  WHERE batch_id IS NULL
),
grouped AS (
  SELECT id,
    SUM(CASE WHEN prev_at IS NULL OR created_at - prev_at > interval '3 seconds' THEN 1 ELSE 0 END)
      OVER (PARTITION BY user_id, motivo, almacen_id ORDER BY created_at) AS grp,
    user_id, motivo, almacen_id
  FROM ranked
),
batched AS (
  SELECT id,
    md5(user_id::text || coalesce(motivo,'') || coalesce(almacen_id::text,'') || grp::text)::uuid AS new_batch
  FROM grouped
)
UPDATE public.ajustes_inventario ai
SET batch_id = b.new_batch
FROM batched b
WHERE ai.id = b.id AND ai.batch_id IS NULL;