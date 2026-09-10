from pathlib import Path

# Keep predicates index-friendly and harden the temporary row trigger implementation.
p = Path('supabase/migrations/20260910111500_pedidos_operacion_v4.sql')
s = p.read_text(encoding='utf-8')
s = s.replace("v.tipo::text = 'pedido'", "v.tipo = 'pedido'")
s = s.replace('v.fecha::date', 'v.fecha')
s = s.replace('v.fecha_entrega::date', 'v.fecha_entrega')
s = s.replace('e.fecha::date', 'e.fecha')
s = s.replace('e.fecha_entrega::date', 'e.fecha_entrega')
s = s.replace(
    "CREATE INDEX IF NOT EXISTS idx_log_pedido_resumen_empresa_programada\n  ON public.logistica_pedido_resumen (empresa_id, fecha_programada DESC, pedido_id);",
    "CREATE INDEX IF NOT EXISTS idx_log_pedido_resumen_empresa_programada\n  ON public.logistica_pedido_resumen (empresa_id, fecha_programada DESC, pedido_id);\n\nCREATE INDEX IF NOT EXISTS idx_log_pedido_resumen_empresa_bucket_programada\n  ON public.logistica_pedido_resumen (empresa_id, bucket, fecha_programada DESC, pedido_id);"
)
s = s.replace(
    '  RETURN COALESCE(NEW, OLD);\nEND;\n$$;\n\nDROP TRIGGER IF EXISTS trg_logistica_pedido_resumen_entrega_linea',
    "  IF TG_OP = 'DELETE' THEN\n    RETURN OLD;\n  END IF;\n  RETURN NEW;\nEND;\n$$;\n\nDROP TRIGGER IF EXISTS trg_logistica_pedido_resumen_entrega_linea"
)
p.write_text(s, encoding='utf-8')

# Search resets the page immediately, before the 350 ms debounce expires, avoiding
# a transient request for the previous page with the new search term.
p = Path('src/pages/DemandaPage.tsx')
s = p.read_text(encoding='utf-8')
s = s.replace(
    'value={search} onChange={e => setSearch(e.target.value)}',
    'value={search} onChange={e => { setSearch(e.target.value); setPage(0); }}',
    1
)
p.write_text(s, encoding='utf-8')
