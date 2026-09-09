from pathlib import Path

path = Path('src/pages/DemandaPage.tsx')
text = path.read_text(encoding='utf-8')

old_query = """          .eq('tipo', 'pedido')
          .in('status', filters.statuses as any)
          .gte(filters.fechaTipo, filters.desde)
          .lte(filters.fechaTipo, filters.hasta)
          .order(filters.fechaTipo, { ascending: true })
          .range(from, to);
        if (filters.vendedorIds && filters.vendedorIds.length > 0) q = q.in('vendedor_id', filters.vendedorIds);
        return q;
"""
new_query = """          .eq('tipo', 'pedido')
          .in('status', filters.statuses as any)
          .order(filters.fechaTipo, { ascending: true })
          .range(from, to);
        // Un rango vacío significa TODO el histórico: no mandar gte/lte vacíos a PostgREST.
        if (filters.desde) q = q.gte(filters.fechaTipo, filters.desde);
        if (filters.hasta) q = q.lte(filters.fechaTipo, filters.hasta);
        if (filters.vendedorIds && filters.vendedorIds.length > 0) q = q.in('vendedor_id', filters.vendedorIds);
        return q;
"""
if old_query not in text:
    raise SystemExit('No se encontró el bloque de consulta de pedidos esperado')
text = text.replace(old_query, new_query, 1)

old_chunks = """      if (pedidoIds.length > 0) {
        // Chunk pedidoIds to avoid URL limits, paginate each chunk
        const chunkSize = 200;
        for (let i = 0; i < pedidoIds.length; i += chunkSize) {
          const chunk = pedidoIds.slice(i, i + chunkSize);
          const part = await fetchAllPages<any>((from, to) =>
            supabase
              .from('entregas')
            .select('pedido_id, status, fecha, fecha_entrega, vendedor_ruta_id, entrega_lineas(producto_id, cantidad_entregada)')
              .in('pedido_id', chunk)
              .range(from, to)
          );
          entregasData.push(...part);
        }
      }
"""
new_chunks = """      if (pedidoIds.length > 0) {
        // Chunk pedidoIds to avoid URL limits. Process a few chunks concurrently so
        // a large historical query does not wait for every group sequentially.
        const chunkSize = 200;
        const chunkConcurrency = 4;
        const chunks: string[][] = [];
        for (let i = 0; i < pedidoIds.length; i += chunkSize) {
          chunks.push(pedidoIds.slice(i, i + chunkSize));
        }

        for (let i = 0; i < chunks.length; i += chunkConcurrency) {
          const batch = chunks.slice(i, i + chunkConcurrency);
          const parts = await Promise.all(batch.map(chunk =>
            fetchAllPages<any>((from, to) =>
              supabase
                .from('entregas')
                .select('pedido_id, status, fecha, fecha_entrega, vendedor_ruta_id, entrega_lineas(producto_id, cantidad_entregada)')
                .in('pedido_id', chunk)
                .range(from, to)
            )
          ));
          for (const part of parts) entregasData.push(...part);
        }
      }
"""
if old_chunks not in text:
    raise SystemExit('No se encontró el bloque de entregas asociadas esperado')
text = text.replace(old_chunks, new_chunks, 1)

text = text.replace(
    '<SelectItem value="fecha">Fecha de pedido</SelectItem>',
    '<SelectItem value="fecha">Fecha de levantamiento</SelectItem>',
    1,
)
text = text.replace(
    '<SelectItem value="fecha_entrega">Fecha de entrega</SelectItem>',
    '<SelectItem value="fecha_entrega">Fecha programada de entrega</SelectItem>',
    1,
)

path.write_text(text, encoding='utf-8')
