import { useMemo, useState } from 'react';
import { Search, Package } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useOfflineQuery } from '@/hooks/useOfflineData';

export default function RutaStock() {
  const { empresa, profile } = useAuth();
  const [search, setSearch] = useState('');
  const almacenId = profile?.almacen_id;

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

  const filtered = productosConStock.filter((p: any) =>
    !search || p.nombre.toLowerCase().includes(search.toLowerCase()) ||
    p.codigo.toLowerCase().includes(search.toLowerCase())
  );

  const getStockColor = (qty: number) => {
    if (qty <= 0) return 'text-destructive bg-destructive/10';
    if (qty <= 5) return 'text-warning bg-warning/10';
    return 'text-success bg-success/10';
  };

  return (
    <div className="flex flex-col h-full">
      <div className="sticky top-0 z-10 bg-background px-4 pt-4 pb-3">
        <h1 className="text-[20px] font-bold text-foreground mb-3">Stock abordo</h1>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar producto..."
            className="w-full bg-card border border-border rounded-xl pl-9 pr-3 py-2.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-primary/30"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="px-4 mb-3">
        <div className="flex gap-2">
          <div className="flex-1 bg-card border border-border rounded-xl p-3 text-center">
            <p className="text-[20px] font-bold text-foreground">{productosConStock.length}</p>
            <p className="text-[11px] text-muted-foreground">Productos</p>
          </div>
          <div className="flex-1 bg-card border border-border rounded-xl p-3 text-center">
            <p className="text-[20px] font-bold text-success">{productosConStock.filter((p: any) => (p.stockRuta ?? 0) > 0).length}</p>
            <p className="text-[11px] text-muted-foreground">Con stock</p>
          </div>
          <div className="flex-1 bg-card border border-border rounded-xl p-3 text-center">
            <p className="text-[20px] font-bold text-destructive">{productosConStock.filter((p: any) => (p.stockRuta ?? 0) <= 0).length}</p>
            <p className="text-[11px] text-muted-foreground">Sin stock</p>
          </div>
        </div>
      </div>

      <div className="flex-1 px-4 space-y-2 pb-4">
        {isLoading && <p className="text-center text-muted-foreground text-[13px] py-8">Cargando...</p>}
        {filtered.map((p: any) => {
          const qty = p.stockRuta ?? 0;
          const unidad = p.unidades?.abreviatura || p.unidades?.nombre || 'pz';
          return (
            <div key={p.id} className="bg-card border border-border rounded-xl p-3.5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center shrink-0 overflow-hidden">
                  {p.imagen_url ? (
                    <img src={p.imagen_url} alt={p.nombre} className="w-full h-full object-cover" />
                  ) : (
                    <Package className="h-5 w-5 text-accent-foreground" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-foreground truncate">{p.nombre}</p>
                  <p className="text-[11px] text-muted-foreground">{p.codigo}</p>
                </div>
                <div className={`px-3 py-1.5 rounded-xl text-[14px] font-bold ${getStockColor(qty)}`}>
                  {qty} {unidad}
                </div>
              </div>
              <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/50">
                <span className="text-[12px] text-muted-foreground">
                  Precio: <span className="font-semibold text-foreground">$ {(p.precio_principal ?? 0).toLocaleString('es-MX', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                </span>
              </div>
            </div>
          );
        })}
        {!isLoading && filtered.length === 0 && (
          <p className="text-center text-muted-foreground text-[13px] py-8">No hay productos</p>
        )}
      </div>
    </div>
  );
}
