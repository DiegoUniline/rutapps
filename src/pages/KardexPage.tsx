import { useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useAlmacenes, useProductosForSelect } from '@/hooks/useData';
import { useKardexUbicacion } from '@/hooks/useKardexUbicacion';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowDownCircle, ArrowUpCircle, RefreshCw, Download, Search, BookOpen, ExternalLink } from 'lucide-react';
import { cn, fmtNum } from '@/lib/utils';
import { Link } from 'react-router-dom';

const REFERENCIA_LABELS: Record<string, string> = {
  ajuste: 'Ajuste inventario',
  auditoria: 'Auditoría',
  compra: 'Compra',
  venta: 'Venta',
  venta_ruta: 'Venta ruta',
  traspaso: 'Traspaso',
  entrega: 'Surtido / Entrega',
  carga: 'Carga camión',
  devolucion: 'Devolución',
  descarga: 'Descarga ruta',
  cancelacion_venta: 'Cancel. venta',
  conteo: 'Conteo físico',
  manual: 'Manual',
};

const TIPO_CONFIG: Record<string, { label: string; icon: any; color: string }> = {
  entrada: { label: 'Entrada', icon: ArrowDownCircle, color: 'text-green-600' },
  salida: { label: 'Salida', icon: ArrowUpCircle, color: 'text-destructive' },
  transferencia: { label: 'Transferencia', icon: RefreshCw, color: 'text-primary' },
};

function getReferenciaRoute(tipo: string | null, id: string | null): string | null {
  if (!tipo || !id) return null;
  switch (tipo) {
    case 'venta':
    case 'venta_ruta':
    case 'cancelacion_venta':
      return `/ventas/${id}`;
    case 'compra':
      return `/almacen/compras/${id}`;
    case 'traspaso':
      return `/almacen/traspasos/${id}`;
    case 'entrega':
      return `/entregas/${id}`;
    case 'auditoria':
      return `/almacen/auditorias/${id}/resultados`;
    case 'ajuste':
      return `/almacen/ajustes`;
    case 'conteo':
      return `/almacen/conteos`;
    case 'descarga':
      return `/almacen/descargas`;
    case 'devolucion':
      return `/ventas/devoluciones`;
    case 'merma':
      return `/almacen/mermas`;
    default:
      return null;
  }
}

export default function KardexPage() {
  const { empresa } = useAuth();
  const { data: almacenes } = useAlmacenes({ includeMermas: true });
  const { data: productos } = useProductosForSelect();

  const [almacenId, setAlmacenId] = useState<string>('');
  const [productoId, setProductoId] = useState<string>('');
  const [productoSearch, setProductoSearch] = useState('');
  const [productoDropdownOpen, setProductoDropdownOpen] = useState(false);
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  const [filterTipo, setFilterTipo] = useState('todos');
  const [search, setSearch] = useState('');

  const productosFiltered = useMemo(() => {
    const list = productos ?? [];
    if (!productoSearch.trim()) return list.slice(0, 200);
    const q = productoSearch.toLowerCase();
    return list.filter((p: any) =>
      (p.nombre ?? '').toLowerCase().includes(q) || (p.codigo ?? '').toLowerCase().includes(q)
    ).slice(0, 200);
  }, [productos, productoSearch]);

  const productoSel = useMemo(
    () => (productos ?? []).find((p: any) => p.id === productoId),
    [productos, productoId],
  );
  const almacenSel = useMemo(
    () => (almacenes ?? []).find((a: any) => a.id === almacenId),
    [almacenes, almacenId],
  );

  // Real current stock from stock_almacen
  const { data: stockActual } = useQuery({
    queryKey: ['stock-almacen-kardex', empresa?.id, almacenId, productoId],
    enabled: !!empresa?.id && !!almacenId && !!productoId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stock_almacen')
        .select('cantidad')
        .eq('empresa_id', empresa!.id)
        .eq('almacen_id', almacenId)
        .eq('producto_id', productoId)
        .maybeSingle();
      if (error) throw error;
      return Number(data?.cantidad ?? 0);
    },
  });

  const { rows, isLoading, refetch } = useKardexUbicacion(
    productoId || null,
    almacenId || null,
    'almacen',
    fechaDesde || undefined,
    fechaHasta || undefined,
  );

  const filtered = useMemo(() => {
    let list = [...rows].reverse();
    if (filterTipo.startsWith('ref:')) {
      const refKey = filterTipo.slice(4);
      list = list.filter(r => r.referencia_tipo === refKey);
    } else if (filterTipo !== 'todos') {
      list = list.filter(r => r.tipo === filterTipo);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(r =>
        (r.referencia_tipo ?? '').toLowerCase().includes(q) ||
        (r.notas ?? '').toLowerCase().includes(q) ||
        (REFERENCIA_LABELS[r.referencia_tipo ?? ''] ?? '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [rows, filterTipo, search]);

  const saldoFinal = rows.length > 0 ? rows[rows.length - 1].saldo : 0;
  const cuadra = stockActual !== undefined && Math.abs(saldoFinal - (stockActual ?? 0)) < 0.001;

  const handleExportCSV = () => {
    if (!productoSel || !almacenSel) return;
    const header = 'Fecha,Tipo,Referencia,Entrada,Salida,Saldo,Notas';
    const csvRows = filtered.map(r => {
      const fecha = new Date(r.created_at).toLocaleString('es-MX');
      const tipo = REFERENCIA_LABELS[r.referencia_tipo ?? ''] ?? r.referencia_tipo ?? '';
      const entrada = r.delta > 0 ? r.delta : '';
      const salida = r.delta < 0 ? Math.abs(r.delta) : '';
      const notas = (r.notas ?? '').replace(/,/g, ' ');
      return `${fecha},${tipo},${r.referencia_id ?? ''},${entrada},${salida},${r.saldo},${notas}`;
    });
    const blob = new Blob([header + '\n' + csvRows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kardex_${productoSel.nombre.replace(/\s+/g, '_')}_${almacenSel.nombre.replace(/\s+/g, '_')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center gap-2">
        <BookOpen className="h-5 w-5 text-primary" />
        <h1 className="text-xl font-bold">Kardex</h1>
        <span className="text-sm text-muted-foreground">— Consulta de movimientos por producto y almacén</span>
      </div>

      {/* Selectors */}
      <div className="bg-card border border-border rounded-lg p-3 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] font-medium text-muted-foreground uppercase">Almacén</label>
            <select
              className="w-full mt-1 h-9 text-sm border border-border rounded px-2 bg-background"
              value={almacenId}
              onChange={e => setAlmacenId(e.target.value)}
            >
              <option value="">— Selecciona almacén —</option>
              {(almacenes ?? []).map((a: any) => (
                <option key={a.id} value={a.id}>{a.nombre}{a.es_merma ? ' (Mermas)' : ''}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[11px] font-medium text-muted-foreground uppercase">Producto</label>
            <div className="relative mt-1">
              <Input
                placeholder="Buscar por nombre o código..."
                className="h-9 text-sm"
                value={productoSearch}
                onChange={e => { setProductoSearch(e.target.value); setProductoDropdownOpen(true); }}
                onFocus={() => setProductoDropdownOpen(true)}
                onBlur={() => setTimeout(() => setProductoDropdownOpen(false), 150)}
              />
              {productoDropdownOpen && productosFiltered.length > 0 && (
                <div className="absolute z-20 mt-1 w-full max-h-72 overflow-auto bg-popover border border-border rounded-md shadow-lg">
                  {productosFiltered.map((p: any) => (
                    <button
                      key={p.id}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setProductoId(p.id);
                        setProductoSearch(`${p.codigo} · ${p.nombre}`);
                        setProductoDropdownOpen(false);
                      }}
                      className={cn(
                        "w-full text-left px-3 py-2 text-sm hover:bg-accent border-b border-border/40 last:border-0",
                        productoId === p.id && "bg-accent"
                      )}
                    >
                      <div className="font-medium truncate">{p.nombre}</div>
                      <div className="text-[11px] text-muted-foreground">{p.codigo}</div>
                    </button>
                  ))}
                </div>
              )}
              {productoDropdownOpen && productoSearch.trim() && productosFiltered.length === 0 && (
                <div className="absolute z-20 mt-1 w-full bg-popover border border-border rounded-md shadow-lg p-3 text-sm text-muted-foreground">
                  Sin resultados
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Empty state */}
      {(!almacenId || !productoId) && (
        <div className="bg-accent/30 border border-border rounded-lg p-10 text-center text-sm text-muted-foreground">
          Selecciona un almacén y un producto para ver el kardex.
        </div>
      )}

      {/* Kardex view */}
      {almacenId && productoId && (
        <>
          {/* Header summary */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-card border border-border rounded-lg p-3">
            <div className="min-w-0">
              <div className="text-base font-semibold truncate">{productoSel?.nombre}</div>
              <div className="text-xs text-muted-foreground">{productoSel?.codigo} · {almacenSel?.nombre}</div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-sm px-3 py-1">
                Saldo kardex: {fmtNum(saldoFinal)}
              </Badge>
              <Badge variant="secondary" className="text-sm px-3 py-1">
                Stock real: {fmtNum(stockActual ?? 0)}
              </Badge>
              {stockActual !== undefined && (
                cuadra ? (
                  <Badge className="bg-green-600 text-white text-xs">Cuadra ✓</Badge>
                ) : (
                  <Badge variant="destructive" className="text-xs">
                    Δ {fmtNum((stockActual ?? 0) - saldoFinal)}
                  </Badge>
                )
              )}
            </div>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[150px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input placeholder="Buscar referencia/notas..." className="pl-8 h-8 text-[12px]" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <Input type="date" className="h-8 text-[12px] w-[140px]" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)} />
            <Input type="date" className="h-8 text-[12px] w-[140px]" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)} />
            <select
              className="h-8 text-[12px] border border-border rounded px-2 bg-background"
              value={filterTipo}
              onChange={e => setFilterTipo(e.target.value)}
            >
              <option value="todos">Todos los tipos</option>
              <option value="entrada">Solo entradas</option>
              <option value="salida">Solo salidas</option>
              <optgroup label="Por concepto">
                {Object.entries(REFERENCIA_LABELS).map(([k, v]) => (
                  <option key={k} value={`ref:${k}`}>{v}</option>
                ))}
              </optgroup>
            </select>
            <Button variant="outline" size="sm" className="h-8 text-[11px]" onClick={() => refetch()}>
              <RefreshCw className="h-3 w-3 mr-1" /> Actualizar
            </Button>
            <Button variant="outline" size="sm" className="h-8 text-[11px]" onClick={handleExportCSV} disabled={filtered.length === 0}>
              <Download className="h-3 w-3 mr-1" /> CSV
            </Button>
          </div>

          {/* Summary */}
          {rows.length > 0 && (
            <div className="flex gap-4 text-[12px]">
              <span className="text-muted-foreground">{rows.length} movimientos</span>
              <span className="text-green-600 font-medium">
                + {rows.filter(r => r.delta > 0).reduce((s, r) => s + r.delta, 0).toLocaleString('es-MX')} entradas
              </span>
              <span className="text-destructive font-medium">
                − {Math.abs(rows.filter(r => r.delta < 0).reduce((s, r) => s + r.delta, 0)).toLocaleString('es-MX')} salidas
              </span>
            </div>
          )}

          {/* Table */}
          <div className="border border-border rounded overflow-auto max-h-[65vh]">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card z-10">
                <tr className="border-b border-border">
                  <th className="text-left text-[11px] font-medium px-3 py-2 text-muted-foreground">Fecha</th>
                  <th className="text-left text-[11px] font-medium px-3 py-2 text-muted-foreground">Tipo</th>
                  <th className="text-left text-[11px] font-medium px-3 py-2 text-muted-foreground">Referencia</th>
                  <th className="text-right text-[11px] font-medium px-3 py-2 text-muted-foreground">Entrada</th>
                  <th className="text-right text-[11px] font-medium px-3 py-2 text-muted-foreground">Salida</th>
                  <th className="text-right text-[11px] font-semibold px-3 py-2 text-muted-foreground">Saldo</th>
                  <th className="text-left text-[11px] font-medium px-3 py-2 text-muted-foreground">Notas</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={7} className="py-8 text-center text-[12px] text-muted-foreground">Cargando kardex...</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={7} className="py-8 text-center text-[12px] text-muted-foreground">
                    {rows.length === 0 ? 'Sin movimientos registrados' : 'Sin resultados con los filtros actuales'}
                  </td></tr>
                ) : (
                  filtered.map(row => {
                    const cfg = TIPO_CONFIG[row.tipo] ?? TIPO_CONFIG.entrada;
                    const Icon = cfg.icon;
                    return (
                      <tr key={row.id} className="border-b border-border/50 last:border-0 hover:bg-accent/30">
                        <td className="py-1.5 px-3 text-[12px] whitespace-nowrap">
                          {new Date(row.created_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: '2-digit' })}
                          <span className="text-muted-foreground ml-1 text-[10px]">
                            {new Date(row.created_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </td>
                        <td className="py-1.5 px-3">
                          <span className={cn("flex items-center gap-1 text-[12px] font-medium", cfg.color)}>
                            <Icon className="h-3.5 w-3.5" />
                            {cfg.label}
                          </span>
                        </td>
                        <td className="py-1.5 px-3 text-[12px]">
                          {REFERENCIA_LABELS[row.referencia_tipo ?? ''] ?? row.referencia_tipo ?? '—'}
                          {row.referencia_id && <span className="text-muted-foreground ml-1 text-[10px]">#{row.referencia_id.slice(0, 8)}</span>}
                        </td>
                        <td className="py-1.5 px-3 text-right tabular-nums text-[12px] text-green-600">
                          {row.delta > 0 ? fmtNum(row.delta) : ''}
                        </td>
                        <td className="py-1.5 px-3 text-right tabular-nums text-[12px] text-destructive">
                          {row.delta < 0 ? fmtNum(Math.abs(row.delta)) : ''}
                        </td>
                        <td className="py-1.5 px-3 text-right tabular-nums text-[12px] font-semibold">
                          {fmtNum(row.saldo)}
                        </td>
                        <td className="py-1.5 px-3 text-[11px] text-muted-foreground max-w-[260px] truncate">
                          {row.notas ?? ''}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
