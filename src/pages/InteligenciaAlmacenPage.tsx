import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Brain, RefreshCw, Search } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { fetchAllPages } from '@/lib/supabasePaginate';
import { useAuth } from '@/contexts/AuthContext';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import HelpButton from '@/components/HelpButton';
import InventarioInteligenciaTab, {
  type IntelligenceProduct,
  type IntelligenceStockRow,
  type IntelligenceWarehouse,
} from '@/pages/inventario/InventarioInteligenciaTab';

function useInventoryBase() {
  const { empresa } = useAuth();
  return useQuery({
    queryKey: ['inventory-intelligence-base', empresa?.id],
    enabled: Boolean(empresa?.id),
    staleTime: 2 * 60 * 1000,
    queryFn: async () => {
      const empresaId = empresa!.id;
      const [products, stockRows, warehousesResult] = await Promise.all([
        fetchAllPages<IntelligenceProduct>((from, to) => supabase
          .from('productos')
          .select('id,codigo,nombre,cantidad,costo,precio_principal,status,dias_cobertura,lead_time_dias,min,max,maneja_lote,created_at')
          .eq('empresa_id', empresaId)
          .eq('status', 'activo')
          .order('nombre')
          .range(from, to)),
        fetchAllPages<IntelligenceStockRow>((from, to) => supabase
          .from('stock_almacen')
          .select('almacen_id,producto_id,cantidad')
          .eq('empresa_id', empresaId)
          .range(from, to)),
        supabase.from('almacenes').select('id,nombre,tipo').eq('empresa_id', empresaId).eq('activo', true).order('nombre'),
      ]);
      if (warehousesResult.error) throw warehousesResult.error;

      const totalByProduct = new Map<string, number>();
      stockRows.forEach(row => totalByProduct.set(row.producto_id, (totalByProduct.get(row.producto_id) || 0) + Number(row.cantidad || 0)));
      const hasStockRows = stockRows.length > 0;

      return {
        products: products.map(product => ({
          ...product,
          stockTotal: hasStockRows ? (totalByProduct.get(product.id) || 0) : Number(product.cantidad || 0),
        })),
        stockRows,
        warehouses: (warehousesResult.data || []) as IntelligenceWarehouse[],
      };
    },
  });
}

export default function InteligenciaAlmacenPage() {
  const base = useInventoryBase();
  const [search, setSearch] = useState('');

  return (
    <div className="min-h-full space-y-5 bg-muted/20 p-4 md:p-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex items-center gap-2">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <Brain className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight text-foreground">Inteligencia de inventario</h1>
            <p className="text-sm text-muted-foreground">Dinero, rotación, movimientos, riesgo y caducidades en una sola vista.</p>
          </div>
          <HelpButton
            title="Inteligencia de inventario"
            sections={[
              { title: 'Capital detenido', content: 'Existencia con costo que no ha tenido salida comercial durante 90 días o más. La antigüedad se estima desde la última venta, entrada o alta disponible.' },
              { title: 'Cobertura', content: 'Días que alcanzará el stock actual usando la velocidad de venta del periodo seleccionado.' },
              { title: 'Caducidades', content: 'Sólo considera lotes con existencia mayor a cero y muestra dónde se encuentran.' },
              { title: 'Auditabilidad', content: 'Cada indicador abre el detalle que lo compone; esta pantalla no modifica inventario ni genera movimientos.' },
            ]}
          />
        </div>
        <div className="flex w-full gap-2 xl:w-auto">
          <div className="relative flex-1 xl:w-80">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar producto, código o lote…" className="pl-9" />
          </div>
          <Button variant="outline" size="icon" aria-label="Actualizar inteligencia" onClick={() => base.refetch()} disabled={base.isFetching}>
            <RefreshCw className={`h-4 w-4 ${base.isFetching ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {base.isLoading && <div className="rounded-xl border bg-card p-12 text-center text-sm text-muted-foreground">Analizando inventario…</div>}
      {base.error && <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive">{base.error instanceof Error ? base.error.message : 'No se pudo consultar el inventario'}</div>}
      {base.data && (
        <InventarioInteligenciaTab
          productos={base.data.products}
          stockRows={base.data.stockRows}
          warehouses={base.data.warehouses}
          search={search}
        />
      )}
    </div>
  );
}
