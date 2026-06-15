import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { fetchAllPages } from '@/lib/supabasePaginate';
import { useAuth } from '@/contexts/AuthContext';
import { Brain, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import HelpButton from '@/components/HelpButton';
import { HELP } from '@/lib/helpContent';
import InventarioInteligenciaTab from '@/pages/inventario/InventarioInteligenciaTab';

function useProductosConStock() {
  const { empresa } = useAuth();
  return useQuery({
    queryKey: ['inteligencia-productos', empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const eid = empresa!.id;

      const productos = await fetchAllPages<any>((from, to) =>
        supabase
          .from('productos')
          .select('id, codigo, nombre, cantidad, costo, precio_principal, status, dias_cobertura, unidades:unidad_venta_id(abreviatura)')
          .eq('empresa_id', eid)
          .eq('status', 'activo')
          .order('nombre')
          .range(from, to)
      );

      const stockAlmacenData = await fetchAllPages<any>((from, to) =>
        supabase
          .from('stock_almacen')
          .select('producto_id, cantidad')
          .eq('empresa_id', eid)
          .range(from, to)
      );

      const stockByProd: Record<string, number> = {};
      for (const sa of (stockAlmacenData ?? [])) {
        stockByProd[sa.producto_id] = (stockByProd[sa.producto_id] ?? 0) + (sa.cantidad ?? 0);
      }
      const hasWarehouseStock = (stockAlmacenData?.length ?? 0) > 0;

      return (productos ?? []).map(p => ({
        ...p,
        stockTotal: hasWarehouseStock ? (stockByProd[p.id] ?? 0) : (p.cantidad ?? 0),
      }));
    },
  });
}

export default function InteligenciaAlmacenPage() {
  const { data: productos, isLoading } = useProductosConStock();
  const [search, setSearch] = useState('');

  return (
    <div className="p-4 space-y-4 min-h-full">
      <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
        <Brain className="h-5 w-5 text-primary" /> Inteligencia de Almacén
        <HelpButton
          title="Inteligencia de Almacén"
          sections={[
            { title: '¿Qué es?', content: 'Análisis estadístico de tu inventario basado en el historial de ventas de los últimos 60–90 días. No usa IA — son cálculos exactos.' },
            { title: 'Quiebre inminente', content: 'Productos con menos de 7 días de stock al ritmo actual de ventas.' },
            { title: 'Punto de reorden', content: 'Productos por debajo de los días de cobertura deseados (configurables por producto).' },
            { title: 'Productos muertos', content: 'Productos con stock pero sin venta en los últimos 90 días — capital atorado.' },
            { title: 'Análisis ABC', content: 'Clasificación Pareto: A = 80% de los ingresos, B = siguiente 15%, C = el resto.' },
          ]}
        />
      </h1>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar producto..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {isLoading && <p className="text-muted-foreground">Cargando...</p>}

      {productos && (
        <InventarioInteligenciaTab productos={productos as any} search={search} />
      )}
    </div>
  );
}
