import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { TableSkeleton } from '@/components/TableSkeleton';
import { useNavigate } from 'react-router-dom';
import { Star } from 'lucide-react';

/**
 * Shows all tarifa_lineas that have comision_pct > 0,
 * grouped by tarifa, with product/category info and commission details.
 */
export default function ComisionesReglasTab() {
  const navigate = useNavigate();

  const { data: reglas, isLoading } = useQuery({
    queryKey: ['comision-reglas'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tarifa_lineas')
        .select('id, aplica_a, producto_ids, clasificacion_ids, comision_pct, tipo_calculo, precio, margen_pct, descuento_pct, tarifa_id, lista_precio_id, tarifas(id, nombre), lista_precios(id, nombre, es_principal)')
        .gt('comision_pct', 0)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  // Fetch product names for rules that apply to specific products
  const allProductIds = useMemo(() => {
    const ids = new Set<string>();
    (reglas ?? []).forEach(r => {
      if (r.aplica_a === 'producto' && r.producto_ids?.length) {
        r.producto_ids.forEach((id: string) => ids.add(id));
      }
    });
    return Array.from(ids);
  }, [reglas]);

  const { data: productosMap } = useQuery({
    queryKey: ['comision-reglas-productos', allProductIds],
    enabled: allProductIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from('productos')
        .select('id, nombre, codigo, costo, precio_principal')
        .in('id', allProductIds);
      const map: Record<string, any> = {};
      (data ?? []).forEach(p => { map[p.id] = p; });
      return map;
    },
  });

  // Fetch classification names
  const allClasIds = useMemo(() => {
    const ids = new Set<string>();
    (reglas ?? []).forEach(r => {
      if (r.aplica_a === 'categoria' && r.clasificacion_ids?.length) {
        r.clasificacion_ids.forEach((id: string) => ids.add(id));
      }
    });
    return Array.from(ids);
  }, [reglas]);

  const { data: clasificacionesMap } = useQuery({
    queryKey: ['comision-reglas-clasificaciones', allClasIds],
    enabled: allClasIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from('clasificaciones')
        .select('id, nombre')
        .in('id', allClasIds);
      const map: Record<string, string> = {};
      (data ?? []).forEach(c => { map[c.id] = c.nombre; });
      return map;
    },
  });

  // Group by tarifa
  const grouped = useMemo(() => {
    const map = new Map<string, { nombre: string; rules: any[] }>();
    (reglas ?? []).forEach(r => {
      if (!r.tarifas) return;
      const tid = r.tarifas.id;
      if (!map.has(tid)) map.set(tid, { nombre: r.tarifas.nombre, rules: [] });
      map.get(tid)!.rules.push(r);
    });
    return map;
  }, [reglas]);

  const aplicaLabel = (r: any) => {
    if (r.aplica_a === 'producto') {
      const names = (r.producto_ids ?? []).map((id: string) => {
        const p = productosMap?.[id];
        return p ? `${p.codigo ?? ''} ${p.nombre}`.trim() : id.slice(0, 6);
      });
      return names.join(', ') || 'Producto';
    }
    if (r.aplica_a === 'categoria') {
      const names = (r.clasificacion_ids ?? []).map((id: string) => clasificacionesMap?.[id] ?? id.slice(0, 6));
      return names.join(', ') || 'Categoría';
    }
    return 'Todos los productos';
  };

  const tipoLabel = (r: any) => {
    if (r.tipo_calculo === 'precio_fijo') return `Fijo $${r.precio?.toFixed(2)}`;
    if (r.tipo_calculo === 'margen_costo') return `Margen ${r.margen_pct}%`;
    if (r.tipo_calculo === 'descuento_precio') return `Desc. ${r.descuento_pct}%`;
    return r.tipo_calculo;
  };

  if (isLoading) return <TableSkeleton />;

  return (
    <div className="space-y-4">
      {Array.from(grouped.entries()).map(([tarifaId, { nombre, rules }]) => (
        <div key={tarifaId}>
          <h3
            className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 cursor-pointer hover:text-foreground"
            onClick={() => navigate(`/tarifas/${tarifaId}`)}
          >
            {nombre}
          </h3>
          <div className="overflow-x-auto border border-border rounded">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-table-border">
                  <th className="th-odoo text-left">Aplica a</th>
                  <th className="th-odoo text-left">Lista</th>
                  <th className="th-odoo text-left">Tipo precio</th>
                  <th className="th-odoo text-right">% Comisión</th>
                  <th className="th-odoo text-right">Ej. Venta $100</th>
                  <th className="th-odoo text-right">Comisión ganada</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((r: any) => {
                  const exVenta = 100;
                  const comisionEj = (exVenta * (r.comision_pct ?? 0)) / 100;
                  const listaName = r.lista_precios?.nombre;
                  const esPrincipal = r.lista_precios?.es_principal;
                  return (
                    <tr
                      key={r.id}
                      className="border-b border-table-border last:border-0 hover:bg-table-hover cursor-pointer"
                      onClick={() => navigate(`/tarifas/${tarifaId}`)}
                    >
                      <td className="py-1.5 px-3 text-xs max-w-[200px] truncate">{aplicaLabel(r)}</td>
                      <td className="py-1.5 px-3 text-xs">
                        {listaName ? (
                          <span className="flex items-center gap-1">
                            {esPrincipal && <Star className="h-3 w-3 text-amber-500 fill-amber-500" />}
                            {listaName}
                          </span>
                        ) : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="py-1.5 px-3 text-xs text-muted-foreground">{tipoLabel(r)}</td>
                      <td className="py-1.5 px-3 text-right font-mono font-semibold text-primary">{r.comision_pct}%</td>
                      <td className="py-1.5 px-3 text-right font-mono text-xs text-muted-foreground">$ {exVenta.toFixed(2)}</td>
                      <td className="py-1.5 px-3 text-right font-mono font-semibold text-odoo-teal">$ {comisionEj.toFixed(2)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
      {grouped.size === 0 && (
        <p className="text-sm text-muted-foreground py-8 text-center">
          No hay reglas de precio con comisión configurada. Configura el % de comisión en las reglas de tarifa.
        </p>
      )}
    </div>
  );
}
