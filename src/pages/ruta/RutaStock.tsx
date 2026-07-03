import { useMemo, useState, useEffect } from 'react';
import { Search, Package, Eye } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useOfflineQuery } from '@/hooks/useOfflineData';
import { useCurrency } from '@/hooks/useCurrency';
import { usePermisos } from '@/hooks/usePermisos';
import { ProductoDetalleModal } from '@/components/ruta/ProductoDetalleModal';

export default function RutaStock() {
  const { empresa, profile } = useAuth();
  const { fmt } = useCurrency();
  const { hasPermiso, isOwner } = usePermisos();
  const canViewPrice = isOwner || hasPermiso('ventas.cambiar_precio', 'ver') || hasPermiso('productos', 'ver');
  const [search, setSearch] = useState('');
  const [detalleProducto, setDetalleProducto] = useState<any | null>(null);
  const almacenId = profile?.almacen_id;

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

  const { data: stockAlmacen } = useOfflineQuery('stock_almacen', {
    empresa_id: empresa?.id,
    almacen_id: almacenId,
  }, {
    enabled: !!empresa?.id && !!almacenId,
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
        <h1 className="text-[18px] font-bold text-foreground mb-2">Stock abordo</h1>
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
      </div>

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
                            <img src={p.imagen_url} alt="" className="w-full h-full object-cover" />
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

      <ProductoDetalleModal
        open={!!detalleProducto}
        onClose={() => setDetalleProducto(null)}
        producto={detalleProducto}
        currentUnitPrice={detalleProducto?.precio_principal ?? 0}
        suggestedPrice={detalleProducto?.precio_principal ?? 0}
        isManual={false}
        currentListaPrecioId={null}
        canEdit={false}
        onSelectLista={() => {}}
        onSetManualPrice={() => {}}
        onResetToSuggested={() => {}}
      />
    </div>
  );
}
