import { useState } from 'react';
import { Search, Package, Minus, Plus } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useQuery } from '@tanstack/react-query';

export default function RutaStock() {
  const { empresa } = useAuth();
  const [search, setSearch] = useState('');

  const { data: productos, isLoading } = useQuery({
    queryKey: ['ruta-stock', empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from('productos')
        .select('id, codigo, nombre, cantidad, precio_principal, imagen_url, unidades:unidad_venta_id(nombre, abreviatura)')
        .eq('empresa_id', empresa!.id)
        .eq('se_puede_vender', true)
        .eq('status', 'activo')
        .order('nombre');
      return data ?? [];
    },
  });

  const filtered = productos?.filter(p =>
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
      {/* Header */}
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

      {/* Summary */}
      <div className="px-4 mb-3">
        <div className="flex gap-2">
          <div className="flex-1 bg-card border border-border rounded-xl p-3 text-center">
            <p className="text-[20px] font-bold text-foreground">{productos?.length ?? 0}</p>
            <p className="text-[11px] text-muted-foreground">Productos</p>
          </div>
          <div className="flex-1 bg-card border border-border rounded-xl p-3 text-center">
            <p className="text-[20px] font-bold text-success">{productos?.filter(p => (p.cantidad ?? 0) > 0).length ?? 0}</p>
            <p className="text-[11px] text-muted-foreground">Con stock</p>
          </div>
          <div className="flex-1 bg-card border border-border rounded-xl p-3 text-center">
            <p className="text-[20px] font-bold text-destructive">{productos?.filter(p => (p.cantidad ?? 0) <= 0).length ?? 0}</p>
            <p className="text-[11px] text-muted-foreground">Sin stock</p>
          </div>
        </div>
      </div>

      {/* Product list */}
      <div className="flex-1 px-4 space-y-2 pb-4">
        {isLoading && <p className="text-center text-muted-foreground text-[13px] py-8">Cargando...</p>}
        {filtered?.map(p => {
          const qty = p.cantidad ?? 0;
          const unidad = (p.unidades as any)?.abreviatura || (p.unidades as any)?.nombre || 'pz';
          return (
            <div key={p.id} className="bg-card border border-border rounded-xl p-3.5">
              <div className="flex items-center gap-3">
                {/* Product icon or image */}
                <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center shrink-0 overflow-hidden">
                  {p.imagen_url ? (
                    <img src={p.imagen_url} alt="" className="w-full h-full object-cover" />
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
                  Precio: <span className="font-semibold text-foreground">$ {(p.precio_principal ?? 0).toFixed(2)}</span>
                </span>
              </div>
            </div>
          );
        })}
        {!isLoading && filtered?.length === 0 && (
          <p className="text-center text-muted-foreground text-[13px] py-8">No hay productos</p>
        )}
      </div>
    </div>
  );
}
