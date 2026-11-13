import { useMemo, useState, useEffect } from 'react';
import { Search, Package, Eye, AlertTriangle } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { fmtDate } from '@/lib/utils';
import { ReportarMermaSheet } from '@/components/ruta/ReportarMermaSheet';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useOfflineQuery } from '@/hooks/useOfflineData';
import { useCurrency } from '@/hooks/useCurrency';
import { usePermisos } from '@/hooks/usePermisos';
import { ProductoDetalleModal } from '@/components/ruta/ProductoDetalleModal';
import { thumbUrl } from '@/lib/imageThumb';

export default function RutaStock() {
  const { empresa, profile } = useAuth();
  const { fmt } = useCurrency();
  const { hasPermiso, isOwner, hasPermisoMovil } = usePermisos();
  const canReportarMerma = hasPermisoMovil('ruta.devoluciones');
  const canViewPrice = isOwner || hasPermiso('ventas.cambiar_precio', 'ver') || hasPermiso('productos', 'ver');
  const [search, setSearch] = useState('');
  const [detalleProducto, setDetalleProducto] = useState<any | null>(null);
  const almacenId = profile?.almacen_id;
  // Disponible = stock a bordo que se puede vender. Merma = lo que este vendedor reportó como
  // merma desde su ruta (ya salió de su stock hacia el almacén Mermas; no se puede vender).
  const [vista, setVista] = useState<'disponible' | 'merma'>('disponible');
  const [mermaOpen, setMermaOpen] = useState(false);

  // Filtro con/sin stock, persistente por usuario hasta que él lo cambie.
  const [stockFilter, setStockFilter] = useState<'todos' | 'con' | 'sin'>('todos');
  useEffect(() => {
    if (!profile?.id) return;
    try {
      const v = localStorage.getItem(`ruta-stock-filter-${profile.id}`);
      if (v === 'con' || v === 'sin' || v === 'todos') setStockFilter(v);
    } catch { /* ignore */ }
  }, [profile?.id]);
  const changeStockFilter = (v: 'todos' | 'con' | 'sin') => {
    setStockFilter(v);
    if (profile?.id) { try { localStorage.setItem(`ruta-stock-filter-${profile.id}`, v); } catch { /* ignore */ } }
  };

  const { data: productos, isLoading } = useOfflineQuery('productos', {
    empresa_id: empresa?.id,
    se_puede_vender: true,
    status: 'activo',
  }, {
    enabled: !!empresa?.id,
    orderBy: 'nombre',
  });

  const { data: stockAlmacen, refetch: refetchStock } = useOfflineQuery('stock_almacen', {
    empresa_id: empresa?.id,
    almacen_id: almacenId,
  }, {
    enabled: !!empresa?.id && !!almacenId,
  });

  const { data: mermasRuta, isLoading: loadingMermas, refetch: refetchMermas } = useQuery({
    queryKey: ['ruta-mermas', empresa?.id, almacenId],
    enabled: !!empresa?.id && !!almacenId && vista === 'merma',
    queryFn: async () => {
      const { data, error } = await supabase
        .from('mermas')
        .select('id, folio, fecha, merma_motivos:motivo_id(nombre), merma_lineas(cantidad, productos:producto_id(nombre, codigo))')
        .eq('empresa_id', empresa!.id)
        .eq('almacen_origen_id', almacenId!)
        .eq('cancelada', false)
        .order('fecha', { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const productosConStock = useMemo(() => {
    const stockMap = new Map((stockAlmacen ?? []).map((item: any) => [item.producto_id, item.cantidad ?? 0]));

    return (productos ?? []).map((producto: any) => ({
      ...producto,
      stockRuta: almacenId ? (stockMap.get(producto.id) ?? 0) : (producto.cantidad ?? 0),
    }));
  }, [stockAlmacen, productos, almacenId]);

  const filtered = productosConStock.filter((p: any) => {
    const qty = p.stockRuta ?? 0;
    if (stockFilter === 'con' && qty <= 0) return false;
    if (stockFilter === 'sin' && qty > 0) return false;
    return !search || p.nombre.toLowerCase().includes(search.toLowerCase()) ||
      p.codigo.toLowerCase().includes(search.toLowerCase());
  });

  const getStockTextColor = (qty: number) => {
    if (qty <= 0) return 'text-destructive';
    if (qty <= 5) return 'text-amber-600 dark:text-amber-400';
    return 'text-foreground';
  };

  const conStock = productosConStock.filter((p: any) => (p.stockRuta ?? 0) > 0).length;
  const sinStock = productosConStock.filter((p: any) => (p.stockRuta ?? 0) <= 0).length;

  return (
    <div className="flex flex-col h-full">
      <div className="sticky top-0 z-10 bg-background px-3 pt-3 pb-2 border-b border-border">
        <div className="flex items-center justify-between mb-2 gap-2">
          <h1 className="text-[18px] font-bold text-foreground">Stock abordo</h1>
          {canReportarMerma && almacenId && (
            <button
              onClick={() => setMermaOpen(true)}
              className="inline-flex items-center gap-1 rounded-lg border border-destructive/40 text-destructive px-2.5 py-1.5 text-[11.5px] font-semibold active:scale-95"
            >
              <AlertTriangle className="h-3.5 w-3.5" /> Reportar merma
            </button>
          )}
        </div>
        {almacenId && (
          <div className="flex gap-0.5 bg-accent rounded-lg p-[3px] mb-2">
            {(['disponible', 'merma'] as const).map(v => (
              <button
                key={v}
                onClick={() => setVista(v)}
                className={cn('flex-1 py-1.5 rounded-md text-[11.5px] font-semibold transition-colors',
                  vista === v ? (v === 'merma' ? 'bg-destructive text-white shadow-sm' : 'bg-primary text-primary-foreground shadow-sm') : 'text-muted-foreground')}
              >
                {v === 'disponible' ? 'Disponible para vender' : 'Merma reportada'}
              </button>
            ))}
          </div>
        )}
        {vista === 'disponible' && (<>
        <div className="relative mb-2">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar producto o código..."
            className="w-full bg-card border border-border rounded-lg pl-8 pr-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-primary/30"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => changeStockFilter('todos')}
            className={cn('flex-1 py-1.5 rounded-lg text-[11px] font-semibold transition-colors',
              stockFilter === 'todos' ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-accent text-muted-foreground')}
          >
            Todos <span className="opacity-80">({productosConStock.length})</span>
          </button>
          <button
            onClick={() => changeStockFilter('con')}
            className={cn('flex-1 py-1.5 rounded-lg text-[11px] font-semibold transition-colors',
              stockFilter === 'con' ? 'bg-success text-white shadow-sm' : 'bg-accent text-muted-foreground')}
          >
            Con stock <span className="opacity-80">({conStock})</span>
          </button>
          <button
            onClick={() => changeStockFilter('sin')}
            className={cn('flex-1 py-1.5 rounded-lg text-[11px] font-semibold transition-colors',
              stockFilter === 'sin' ? 'bg-destructive text-white shadow-sm' : 'bg-accent text-muted-foreground')}
          >
            Sin stock <span className="opacity-80">({sinStock})</span>
          </button>
        </div>
        </>)}
      </div>

      {vista === 'merma' && (
        <div className="flex-1 overflow-auto px-3 py-2 space-y-2">
          {loadingMermas && <p className="text-center text-muted-foreground text-[13px] py-8">Cargando...</p>}
          {!loadingMermas && (mermasRuta ?? []).length === 0 && (
            <p className="text-center text-muted-foreground text-[13px] py-8">No has reportado merma</p>
          )}
          {(mermasRuta ?? []).map((m: any) => (
            <div key={m.id} className="rounded-xl border border-border bg-card p-2.5">
              <div className="flex items-center justify-between text-[11.5px]">
                <span className="font-semibold text-foreground">{m.folio}</span>
                <span className="text-muted-foreground">{fmtDate(m.fecha)} · {m.merma_motivos?.nombre ?? '—'}</span>
              </div>
              {(m.merma_lineas ?? []).map((l: any, i: number) => (
                <div key={i} className="flex items-center justify-between text-[12.5px] mt-1">
                  <span className="truncate pr-2 text-foreground">{l.productos?.nombre ?? 'Producto'}</span>
                  <span className="font-bold tabular-nums text-destructive shrink-0">{Number(l.cantidad)}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {vista === 'disponible' && (
      <div className="flex-1 overflow-auto">
        {isLoading && <p className="text-center text-muted-foreground text-[13px] py-8">Cargando...</p>}

        {!isLoading && filtered.length > 0 && (
          <table className="w-full text-[12px]">
            <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm z-[1]">
              <tr className="border-b border-border">
                <th className="text-left font-semibold text-muted-foreground px-2 py-1.5">Producto</th>
                <th className="text-right font-semibold text-muted-foreground px-2 py-1.5 w-[70px]">Stock</th>
                <th className="text-right font-semibold text-muted-foreground px-2 py-1.5 w-[80px]">Precio</th>
                <th className="px-1 py-1.5 w-[36px]"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p: any) => {
                const qty = p.stockRuta ?? 0;
                const unidad = p.unidades?.abreviatura || 'pz';
                return (
                  <tr key={p.id} className="border-b border-border/50 active:bg-accent/50">
                    <td className="px-2 py-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-7 h-7 rounded bg-accent flex items-center justify-center shrink-0 overflow-hidden">
                          {p.imagen_url ? (
                            <img src={thumbUrl(p.imagen_url, 96)} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />
                          ) : (
                            <Package className="h-3.5 w-3.5 text-accent-foreground" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[12.5px] font-medium text-foreground truncate leading-tight">{p.nombre}</p>
                          <p className="text-[10.5px] text-muted-foreground truncate leading-tight">{p.codigo}</p>
                        </div>
                      </div>
                    </td>
                    <td className={`px-2 py-2 text-right font-bold tabular-nums ${getStockTextColor(qty)}`}>
                      {qty}
                      <span className="text-[10px] font-normal text-muted-foreground ml-0.5">{unidad}</span>
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums text-foreground">
                      {fmt(p.precio_principal ?? 0)}
                    </td>
                    <td className="px-1 py-2 text-center">
                      {canViewPrice && (
                        <button
                          onClick={() => setDetalleProducto(p)}
                          aria-label="Ver detalle y precios"
                          className="w-7 h-7 rounded-md bg-accent/60 hover:bg-accent flex items-center justify-center text-muted-foreground hover:text-foreground active:scale-90 transition-all mx-auto"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {!isLoading && filtered.length === 0 && (
          <p className="text-center text-muted-foreground text-[13px] py-8">No hay productos</p>
        )}
      </div>
      )}

      {almacenId && (
        <ReportarMermaSheet
          open={mermaOpen}
          onOpenChange={setMermaOpen}
          almacenId={almacenId}
          productos={productosConStock as any}
          onRegistrada={() => { refetchStock(); refetchMermas(); setVista('merma'); }}
        />
      )}

      <ProductoDetalleModal
        open={!!detalleProducto}
        onClose={() => setDetalleProducto(null)}
        producto={detalleProducto}
        currentUnitPrice={detalleProducto?.precio_principal ?? 0}
        suggestedPrice={detalleProducto?.precio_principal ?? 0}
        isManual={false}
        currentListaPrecioId={null}
        canEditManual={false}
        canSelectLista={false}
        onSelectLista={() => {}}
        onSetManualPrice={() => {}}
        onResetToSuggested={() => {}}
      />
    </div>
  );
}
