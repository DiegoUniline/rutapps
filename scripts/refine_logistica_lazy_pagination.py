from pathlib import Path

# Pedidos: keep previous rows visible while server search/filter is running.
p = Path('src/pages/DemandaPage.tsx')
s = p.read_text(encoding='utf-8')
needle = "    refetchOnWindowFocus: false,\n    queryFn: async () => {"
if needle not in s:
    raise SystemExit('Pedidos query options marker not found')
s = s.replace(needle, "    refetchOnWindowFocus: false,\n    placeholderData: previous => previous,\n    queryFn: async () => {", 1)
s = s.replace("      {(isLoading || isFetching) && <p className=\"text-muted-foreground\">Cargando pedidos...</p>}", "      {isLoading && <p className=\"text-muted-foreground\">Cargando pedidos...</p>}", 1)
p.write_text(s, encoding='utf-8')

# Entregas: same smooth behavior during search/filter transitions.
p = Path('src/hooks/useEntregasWorkspace.ts')
s = p.read_text(encoding='utf-8')
marker = "      pageSize,\n    ],\n    enabled: !!empresa?.id,\n    staleTime: 45_000,\n    gcTime: 5 * 60_000,\n    refetchOnWindowFocus: false,\n    queryFn: async () => {"
if marker not in s:
    raise SystemExit('Entregas workspace query marker not found')
s = s.replace(marker, "      pageSize,\n    ],\n    enabled: !!empresa?.id,\n    staleTime: 45_000,\n    gcTime: 5 * 60_000,\n    refetchOnWindowFocus: false,\n    placeholderData: previous => previous,\n    queryFn: async () => {", 1)
p.write_text(s, encoding='utf-8')

# SQL: Todo is an explicit no-limit mode and must ignore any stale offset.
p = Path('supabase/migrations/20260910103500_logistica_lazy_pagination_v3.sql')
s = p.read_text(encoding='utf-8')
old_size = "v_page_size integer := CASE WHEN COALESCE(p_page_size, 50) <= 0 THEN NULL ELSE LEAST(GREATEST(p_page_size, 1), 500) END;"
new_size = "v_page_size integer := CASE WHEN COALESCE(p_page_size, 50) <= 0 THEN NULL ELSE LEAST(GREATEST(COALESCE(p_page_size, 50), 1), 500) END;"
if s.count(old_size) != 3:
    raise SystemExit(f'Expected 3 page size declarations, found {s.count(old_size)}')
s = s.replace(old_size, new_size)
old_offset = "v_offset integer := GREATEST(COALESCE(p_offset, 0), 0);"
new_offset = "v_offset integer := CASE WHEN COALESCE(p_page_size, 50) <= 0 THEN 0 ELSE GREATEST(COALESCE(p_offset, 0), 0) END;"
if s.count(old_offset) != 2:
    raise SystemExit(f'Expected 2 legacy offsets, found {s.count(old_offset)}')
s = s.replace(old_offset, new_offset)
p.write_text(s, encoding='utf-8')
