from pathlib import Path

path = Path('src/pages/DemandaPage.tsx')
text = path.read_text(encoding='utf-8')

text = text.replace(
    "import React, { useState, useMemo, Fragment } from 'react';",
    "import React, { useState, useMemo, Fragment, useDeferredValue } from 'react';",
    1,
)

start = text.index('interface DemandaFilters {')
end = text.index('\n\n\n// ─── Component', start)

new_data_hooks = r'''interface DemandaFilters {
  desde: string;
  hasta: string;
  fechaTipo: 'fecha' | 'fecha_entrega';
  vendedorIds?: string[];
  search?: string;
}

function usePedidosPendientes(filters: DemandaFilters) {
  const { empresa } = useAuth();

  return useQuery({
    queryKey: ['demanda', 'workspace-rpc', empresa?.id, filters],
    enabled: !!empresa?.id,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    placeholderData: previous => previous,
    queryFn: async () => {
      const rows = await fetchAllPages<any>((from, to) =>
        (supabase as any)
          .rpc('fn_logistica_pedidos_workspace', {
            p_empresa_id: empresa!.id,
            p_fecha_desde: filters.desde || null,
            p_fecha_hasta: filters.hasta || null,
            p_fecha_tipo: filters.fechaTipo === 'fecha_entrega' ? 'programada' : 'levantamiento',
            p_vendedor_ids: filters.vendedorIds?.length ? filters.vendedorIds : null,
            p_search: filters.search?.trim() || null,
          })
          .order('sort_date', { ascending: false })
          .range(from, to)
      );

      return rows.map((row: any) => ({
        id: row.id,
        folio: row.folio,
        cliente_id: row.cliente_id,
        clientes: {
          nombre: row.cliente_nombre,
          direccion: row.cliente_direccion,
          telefono: row.cliente_telefono,
        },
        vendedor_id: row.vendedor_id,
        vendedores: { nombre: row.vendedor_nombre },
        status: row.status,
        fecha: row.fecha,
        total: Number(row.total ?? 0),
        cerrado_at: row.cerrado_at,
        notas: row.notas,
        totalPendiente: Number(row.total_pendiente ?? 0),
        totalGenerada: Number(row.total_generada ?? 0),
        totalSurtido: Number(row.total_surtido ?? 0),
        totalEntregado: Number(row.total_entregado ?? 0),
        totalDemanda: Number(row.total_demanda ?? 0),
        totalValorPendiente: Number(row.total_valor_pendiente ?? 0),
        lineasPendientes: Number(row.lineas_pendientes ?? 0),
        pctGenerada: Number(row.pct_generada ?? 0),
        pctSurtido: Number(row.pct_surtido ?? 0),
        pctEntregado: Number(row.pct_entregado ?? 0),
        fullyGenerada: !!row.fully_generada,
        fullySurtido: !!row.fully_surtido,
        fullyDelivered: !!row.fully_delivered,
        enRuta: !!row.en_ruta,
        estadoOdoo: row.estado_odoo,
        fechaProgramada: row.fecha_programada,
        vendedorRutaId: row.vendedor_ruta_id,
        fechaEntrega: row.fecha_entrega_real,
      }));
    },
  });
}

async function fetchPedidoLineas(pedidoIds: string[]) {
  const ids = Array.from(new Set(pedidoIds.filter(Boolean)));
  const result: Record<string, any[]> = {};
  for (const id of ids) result[id] = [];
  if (ids.length === 0) return result;

  const lineas: any[] = [];
  const entregas: any[] = [];
  const chunkSize = 150;
  const concurrency = 4;
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += chunkSize) chunks.push(ids.slice(i, i + chunkSize));

  for (let i = 0; i < chunks.length; i += concurrency) {
    const batch = chunks.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map(async chunk => {
      const [ventasPart, entregasPart] = await Promise.all([
        fetchAllPages<any>((from, to) =>
          supabase
            .from('venta_lineas')
            .select('id, venta_id, producto_id, unidad_id, lote_id, cantidad, descripcion, precio_unitario, productos(id, codigo, nombre, unidades:unidad_venta_id(abreviatura))')
            .in('venta_id', chunk)
            .order('created_at', { ascending: true })
            .range(from, to)
        ),
        fetchAllPages<any>((from, to) =>
          supabase
            .from('entregas')
            .select('pedido_id, status, entrega_lineas(producto_id, cantidad_entregada)')
            .in('pedido_id', chunk)
            .neq('status', 'cancelado')
            .range(from, to)
        ),
      ]);
      return { ventasPart, entregasPart };
    }));

    for (const part of batchResults) {
      lineas.push(...part.ventasPart);
      entregas.push(...part.entregasPart);
    }
  }

  const generada: Record<string, Record<string, number>> = {};
  const surtida: Record<string, Record<string, number>> = {};
  const entregada: Record<string, Record<string, number>> = {};
  const SURTIDO_STATUSES = new Set(['surtido', 'asignado', 'cargado', 'en_ruta', 'hecho']);

  for (const e of entregas) {
    if (!e.pedido_id) continue;
    for (const l of (e.entrega_lineas ?? [])) {
      if (!l.producto_id) continue;
      const qty = Number(l.cantidad_entregada ?? 0);
      if (e.status === 'borrador') {
        generada[e.pedido_id] ??= {};
        generada[e.pedido_id][l.producto_id] = (generada[e.pedido_id][l.producto_id] ?? 0) + qty;
      } else if (SURTIDO_STATUSES.has(e.status)) {
        surtida[e.pedido_id] ??= {};
        surtida[e.pedido_id][l.producto_id] = (surtida[e.pedido_id][l.producto_id] ?? 0) + qty;
        if (e.status === 'hecho') {
          entregada[e.pedido_id] ??= {};
          entregada[e.pedido_id][l.producto_id] = (entregada[e.pedido_id][l.producto_id] ?? 0) + qty;
        }
      }
    }
  }

  for (const l of lineas) {
    const pedidoId = l.venta_id;
    const productoId = l.producto_id;
    const cantidadGenerada = productoId ? (generada[pedidoId]?.[productoId] ?? 0) : 0;
    const cantidadSurtida = productoId ? (surtida[pedidoId]?.[productoId] ?? 0) : 0;
    const cantidadEntregada = productoId ? (entregada[pedidoId]?.[productoId] ?? 0) : 0;
    const cantidad = Number(l.cantidad ?? 0);

    result[pedidoId] ??= [];
    result[pedidoId].push({
      ...l,
      cantidad,
      precio_unitario: Number(l.precio_unitario ?? 0),
      cantidad_generada: cantidadGenerada,
      cantidad_surtida: cantidadSurtida,
      cantidad_entregada: cantidadEntregada,
      cantidad_pendiente: cantidad - cantidadSurtida - cantidadGenerada,
    });
  }

  return result;
}

function PedidoLineasRows({ pedidoId, fmt }: { pedidoId: string; fmt: (n: number) => string }) {
  const { data: lineas = [], isLoading, isError } = useQuery({
    queryKey: ['demanda', 'lineas', pedidoId],
    enabled: !!pedidoId,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const byPedido = await fetchPedidoLineas([pedidoId]);
      return byPedido[pedidoId] ?? [];
    },
  });

  if (isLoading) {
    return <tr><td colSpan={9} className="py-3 text-center text-muted-foreground">Cargando productos…</td></tr>;
  }
  if (isError) {
    return <tr><td colSpan={9} className="py-3 text-center text-destructive">No se pudieron cargar los productos.</td></tr>;
  }
  if (lineas.length === 0) {
    return <tr><td colSpan={9} className="py-3 text-center text-muted-foreground">Sin productos</td></tr>;
  }

  return (
    <>
      {lineas.map((l: any) => (
        <tr key={l.id} className="border-b border-border/40 last:border-0">
          <td className="py-1 pr-2 font-mono text-[11px]">{l.productos?.codigo ?? '—'}</td>
          <td className="py-1 pr-2">{l.productos?.nombre ?? l.descripcion ?? '—'}</td>
          <td className="py-1 pr-2 text-right">{l.cantidad} {l.productos?.unidades?.abreviatura ?? ''}</td>
          <td className="py-1 pr-2 text-right text-blue-700">{l.cantidad_generada}</td>
          <td className="py-1 pr-2 text-right text-amber-700">{l.cantidad_surtida}</td>
          <td className="py-1 pr-2 text-right text-green-700">{l.cantidad_entregada}</td>
          <td className={cn("py-1 pr-2 text-right font-medium", l.cantidad_pendiente > 0 ? "text-foreground" : "text-muted-foreground")}>{Math.max(0, l.cantidad_pendiente)}</td>
          <td className="py-1 pr-2 text-right">{fmt(l.precio_unitario)}</td>
          <td className="py-1 text-right font-medium">{fmt(l.cantidad * l.precio_unitario)}</td>
        </tr>
      ))}
    </>
  );
}
'''

text = text[:start] + new_data_hooks + text[end:]

old_filters_call = '''  // Always load all relevant statuses; filter client-side per tab
  const statusesForTab = ['borrador', 'confirmado', 'entregado'];

  const { data: pedidos, isLoading } = usePedidosPendientes({
    desde, hasta, fechaTipo,
    vendedorIds: vendedorFilter.length > 0 ? vendedorFilter : undefined,
    statuses: statusesForTab,
  });
'''
new_filters_call = '''  const deferredSearch = useDeferredValue(search);

  const { data: pedidos, isLoading, error: pedidosError } = usePedidosPendientes({
    desde,
    hasta,
    fechaTipo,
    vendedorIds: vendedorFilter.length > 0 ? vendedorFilter : undefined,
    search: deferredSearch,
  });
'''
if old_filters_call not in text:
    raise SystemExit('No se encontró bloque de llamada a usePedidosPendientes')
text = text.replace(old_filters_call, new_filters_call, 1)

selected_anchor = "  const selectedPedidos = filtered.filter(p => selectedIds.has(p.id));\n"
selected_replacement = selected_anchor + '''
  const hydrateSelectedPedidos = async () => {
    const byPedido = await fetchPedidoLineas(selectedPedidos.map(p => p.id));
    return selectedPedidos.map(p => ({ ...p, venta_lineas: byPedido[p.id] ?? [] }));
  };
'''
if selected_anchor not in text:
    raise SystemExit('No se encontró selectedPedidos')
text = text.replace(selected_anchor, selected_replacement, 1)

# Hidratar sólo al ejecutar Crear entregas.
create_start = text.index('  // Bulk create entregas mutation')
create_end = text.index('  // ── Surtir masivo', create_start)
create_block = text[create_start:create_end]
create_block = create_block.replace(
    "    mutationFn: async () => {\n      if (selectedPedidos.length === 0) throw new Error('Selecciona al menos un pedido');",
    "    mutationFn: async () => {\n      if (selectedPedidos.length === 0) throw new Error('Selecciona al menos un pedido');\n      const pedidosConLineas = await hydrateSelectedPedidos();",
    1,
)
create_block = create_block.replace('selectedPedidos.filter(', 'pedidosConLineas.filter(', 1)
create_block = create_block.replace('for (const pedido of selectedPedidos)', 'for (const pedido of pedidosConLineas)', 1)
text = text[:create_start] + create_block + text[create_end:]

# Hidratar sólo al ejecutar Surtir disponible.
surtir_start = text.index('  // ── Surtir masivo')
surtir_end = text.index('  const borradorSelectedIds', surtir_start)
surtir_block = text[surtir_start:surtir_end]
surtir_block = surtir_block.replace(
    "      if (selectedPedidos.length === 0) throw new Error('Selecciona al menos un pedido');",
    "      if (selectedPedidos.length === 0) throw new Error('Selecciona al menos un pedido');\n      const pedidosConLineas = await hydrateSelectedPedidos();",
    1,
)
surtir_block = surtir_block.replace('selectedPedidos.filter(', 'pedidosConLineas.filter(', 1)
surtir_block = surtir_block.replace('selectedPedidos.flatMap(', 'pedidosConLineas.flatMap(', 1)
surtir_block = surtir_block.replace('for (const pedido of selectedPedidos)', 'for (const pedido of pedidosConLineas)', 1)
text = text[:surtir_start] + surtir_block + text[surtir_end:]

old_total = '''  const totalValorPendiente = filtered.reduce((s, p) => {
    return s + p.venta_lineas.reduce((ls: number, l: any) => ls + Math.max(0, l.cantidad_pendiente) * l.precio_unitario, 0);
  }, 0);
'''
new_total = '''  const totalValorPendiente = filtered.reduce((s, p) => s + Number(p.totalValorPendiente ?? 0), 0);
'''
if old_total not in text:
    raise SystemExit('No se encontró totalValorPendiente anterior')
text = text.replace(old_total, new_total, 1)

# El detalle visual de productos se carga únicamente al expandir una fila.
tbody_start_marker = '                          <tbody>\n                            {(pedido.venta_lineas ?? []).map((l: any) => ('
tbody_start = text.index(tbody_start_marker)
tbody_end_marker = '                          </tbody>'
tbody_end = text.index(tbody_end_marker, tbody_start) + len(tbody_end_marker)
new_tbody = '''                          <tbody>
                            <PedidoLineasRows pedidoId={pedido.id} fmt={fmt} />
                          </tbody>'''
text = text[:tbody_start] + new_tbody + text[tbody_end:]

text = text.replace(
    "{p.venta_lineas.filter((l: any) => l.cantidad_pendiente > 0).length}",
    "{p.lineasPendientes}",
    1,
)

# Mostrar el error real de la consulta resumida en lugar de una tabla vacía silenciosa.
loading_marker = "      {isLoading && <p className=\"text-muted-foreground\">Cargando...</p>}\n"
error_ui = loading_marker + '''      {pedidosError && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          No se pudieron cargar los pedidos: {(pedidosError as any)?.message ?? 'error de consulta'}
        </div>
      )}
'''
if loading_marker not in text:
    raise SystemExit('No se encontró indicador de carga')
text = text.replace(loading_marker, error_ui, 1)

path.write_text(text, encoding='utf-8')
