import { Fragment, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Percent, Star } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { fetchAllPages } from '@/lib/supabasePaginate';
import { useClasificaciones } from '@/hooks/useData';
import { useCurrency } from '@/hooks/useCurrency';
import { useIsMobile } from '@/hooks/use-mobile';
import { OdooFilterBar } from '@/components/OdooFilterBar';
import { TableSkeleton } from '@/components/TableSkeleton';
import { resolveProductPricing, type ProductForPricing, type TarifaLineaRule } from '@/lib/priceResolver';
import { round2 } from '@/lib/salePricing';
import { cn } from '@/lib/utils';
import { ListPage, TABLE_CARD, SCROLL_AREA } from '@/components/layout/ListPage';

interface ProductoPrecioRow extends ProductForPricing {
  codigo: string;
  nombre: string;
  tiene_comision: boolean;
  tipo_comision: 'porcentaje' | 'monto_fijo';
  pct_comision: number;
}

interface ListaPrecioCol {
  id: string;
  tarifa_id: string;
  nombre: string;
  es_principal: boolean;
  activa: boolean;
}

function usePreciosComisionesData() {
  const { empresa } = useAuth();
  const empresaId = empresa?.id;
  return useQuery({
    queryKey: ['precios-comisiones-matrix', empresaId],
    enabled: !!empresaId,
    staleTime: 60_000,
    queryFn: async () => {
      const eid = empresaId!;

      const [productos, listasRes, tarifasRes] = await Promise.all([
        fetchAllPages<ProductoPrecioRow>((from, to) => supabase.from('productos')
          .select('id, codigo, nombre, precio_principal, costo, costo_incluye_impuestos, clasificacion_id, tiene_iva, iva_pct, tiene_ieps, ieps_pct, ieps_tipo, usa_listas_precio, tiene_comision, tipo_comision, pct_comision')
          .eq('empresa_id', eid)
          .eq('status', 'activo')
          .order('nombre')
          .range(from, to)),
        supabase.from('lista_precios')
          .select('id, tarifa_id, nombre, es_principal, activa')
          .eq('empresa_id', eid)
          .order('es_principal', { ascending: false })
          .order('nombre'),
        supabase.from('tarifas').select('id').eq('empresa_id', eid),
      ]);

      if (listasRes.error) throw listasRes.error;
      if (tarifasRes.error) throw tarifasRes.error;

      const tarifaIds = (tarifasRes.data ?? []).map((t: any) => t.id as string);
      let tarifaLineas: (TarifaLineaRule & { comision_pct?: number })[] = [];
      if (tarifaIds.length > 0) {
        tarifaLineas = await fetchAllPages<any>((from, to) => supabase.from('tarifa_lineas')
          .select('id, tarifa_id, lista_precio_id, aplica_a, producto_ids, clasificacion_ids, grupos, tipo_calculo, precio, precio_minimo, margen_pct, descuento_pct, redondeo, base_precio, comision_pct')
          .in('tarifa_id', tarifaIds)
          .order('created_at')
          .order('id')
          .range(from, to));
      }

      return {
        productos,
        listas: (listasRes.data ?? []) as ListaPrecioCol[],
        tarifaLineas,
      };
    },
  });
}

interface CellResult {
  precio: number;
  comisionPct: number | null;
  comisionMonto: number;
}

function resolveCell(producto: ProductoPrecioRow, listaId: string | null, rules: TarifaLineaRule[]): CellResult {
  const pricing = resolveProductPricing(rules, producto, listaId);
  const rule = pricing.appliedRule;

  if (rule && (rule.comision_pct ?? 0) > 0) {
    return {
      precio: pricing.displayPrice,
      comisionPct: rule.comision_pct!,
      comisionMonto: round2(pricing.displayPrice * (rule.comision_pct! / 100)),
    };
  }

  if (!producto.usa_listas_precio && producto.tiene_comision) {
    if (producto.tipo_comision === 'monto_fijo') {
      return { precio: pricing.displayPrice, comisionPct: null, comisionMonto: producto.pct_comision ?? 0 };
    }
    return {
      precio: pricing.displayPrice,
      comisionPct: producto.pct_comision ?? 0,
      comisionMonto: round2(pricing.displayPrice * ((producto.pct_comision ?? 0) / 100)),
    };
  }

  return { precio: pricing.displayPrice, comisionPct: null, comisionMonto: 0 };
}

export default function PreciosComisionesPage() {
  const { data, isLoading } = usePreciosComisionesData();
  const { data: clasificaciones } = useClasificaciones();
  const { fmt } = useCurrency();
  const isMobile = useIsMobile();

  const [search, setSearch] = useState('');
  const [clasificacionFilter, setClasificacionFilter] = useState('');

  const productos = data?.productos ?? [];
  const listas = data?.listas ?? [];
  const tarifaLineas = data?.tarifaLineas ?? [];

  /** Reglas agrupadas por tarifa: cada lista sólo debe ver las reglas de SU tarifa. */
  const rulesByTarifa = useMemo(() => {
    const map = new Map<string, TarifaLineaRule[]>();
    for (const r of tarifaLineas) {
      const key = (r as any).tarifa_id as string;
      if (!key) continue;
      const arr = map.get(key) ?? [];
      arr.push(r);
      map.set(key, arr);
    }
    return map;
  }, [tarifaLineas]);

  const rulesFor = (l: ListaPrecioCol) => rulesByTarifa.get(l.tarifa_id) ?? [];


  const filtered = useMemo(() => productos.filter(p => {
    if (clasificacionFilter && p.clasificacion_id !== clasificacionFilter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return p.nombre?.toLowerCase().includes(q) || p.codigo?.toLowerCase().includes(q);
  }), [productos, search, clasificacionFilter]);

  return (
    <ListPage>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
          <Percent className="h-4 w-4 text-primary" /> Precios y Comisiones
        </h1>
      </div>
      <p className="text-[12px] text-muted-foreground -mt-2">
        Precio de venta y comisión de cada producto en cada lista de precios.
      </p>

      <OdooFilterBar search={search} onSearchChange={setSearch} placeholder="Buscar producto por nombre o código...">
        <select
          value={clasificacionFilter}
          onChange={e => setClasificacionFilter(e.target.value)}
          className="h-8 text-[12px] border border-input rounded-md bg-background px-2 text-foreground"
        >
          <option value="">Todas las categorías</option>
          {(clasificaciones ?? []).map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
      </OdooFilterBar>

      {isLoading ? (
        <div className="p-4"><TableSkeleton rows={6} cols={5} /></div>
      ) : listas.length === 0 ? (
        <p className="text-center py-12 text-muted-foreground text-sm">
          Aún no hay listas de precios. Crea una en <a href="/listas-precio" className="text-primary underline">Listas de precios</a>.
        </p>
      ) : isMobile ? (
        /* ─── Mobile: card layout ─── */
        <div className="space-y-2">
          {filtered.length === 0 && (
            <p className="text-center py-12 text-muted-foreground text-sm">No hay productos.</p>
          )}
          {filtered.map(p => (
            <div key={p.id} className="bg-card border border-border rounded-xl p-3.5">
              <div className="text-[14px] font-semibold text-foreground">{p.nombre}</div>
              <div className="text-[11px] text-muted-foreground font-mono mb-2">{p.codigo}</div>
              {p.usa_listas_precio === false ? (
                (() => {
                  const c = resolveCell(p, null, []);
                  return (
                    <div className="text-[12px] flex items-center justify-between border-t border-border pt-1.5">
                      <span className="text-muted-foreground">Precio directo (no usa listas)</span>
                      <span className="font-mono font-semibold text-odoo-teal">{fmt(c.precio)}</span>
                    </div>
                  );
                })()
              ) : (
                <div className="space-y-1">
                  {listas.map(l => {
                    const c = resolveCell(p, l.id, rulesFor(l));
                    return (
                      <div key={l.id} className="text-[12px] flex items-center justify-between border-t border-border pt-1.5">
                        <span className="text-muted-foreground flex items-center gap-1 truncate">
                          {l.es_principal && <Star className="h-3 w-3 text-amber-500 fill-amber-500 shrink-0" />}
                          {l.nombre}
                        </span>
                        <span className="flex items-center gap-2 shrink-0">
                          <span className="font-mono font-semibold text-odoo-teal">{fmt(c.precio)}</span>
                          <span className="font-mono text-green-600">
                            {c.comisionMonto > 0 ? fmt(c.comisionMonto) : '—'}
                          </span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        /* ─── Desktop: matrix table ─── */
        <div className={TABLE_CARD}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-table-border">
                <th rowSpan={2} className="th-odoo text-left sticky left-0 bg-card z-10 align-bottom">Producto</th>
                {listas.map(l => (
                  <th key={l.id} colSpan={2} className={cn('th-odoo text-center border-l border-table-border', !l.activa && 'opacity-50')}>
                    <span className="flex items-center justify-center gap-1">
                      {l.es_principal && <Star className="h-3 w-3 text-amber-500 fill-amber-500" />}
                      {l.nombre}
                      {!l.activa && <span className="text-[9px] text-muted-foreground">(inactiva)</span>}
                    </span>
                  </th>
                ))}
              </tr>
              <tr className="border-b border-table-border">
                {listas.map(l => (
                  <Fragment key={l.id}>
                    <th className="th-odoo text-right border-l border-table-border text-[10px] font-normal text-muted-foreground">Precio</th>
                    <th className="th-odoo text-right text-[10px] font-normal text-muted-foreground">Comisión</th>
                  </Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={1 + listas.length * 2} className="text-center py-12 text-muted-foreground text-sm">No hay productos.</td></tr>
              )}
              {filtered.map(p => {
                const directo = p.usa_listas_precio === false ? resolveCell(p, null, []) : null;
                return (
                  <tr key={p.id} className="border-b border-table-border hover:bg-table-hover">
                    <td className="py-1.5 px-3 sticky left-0 bg-card z-[1]">
                      <div className="font-medium text-foreground text-[13px]">{p.nombre}</div>
                      <div className="text-[11px] text-muted-foreground font-mono">{p.codigo}</div>
                    </td>
                    {directo ? (
                      <td colSpan={listas.length * 2} className="py-1.5 px-3 text-[12px] border-l border-table-border text-muted-foreground">
                        <span className="text-foreground font-medium">Precio directo:</span>{' '}
                        <span className="font-mono text-odoo-teal font-semibold">{fmt(directo.precio)}</span>
                        {directo.comisionMonto > 0 && (
                          <>
                            {' · '}<span className="text-foreground font-medium">Comisión:</span>{' '}
                            <span className="font-mono text-green-600 font-semibold">{fmt(directo.comisionMonto)}</span>
                          </>
                        )}
                        <span className="ml-2 text-[10px] italic">(no usa listas de precio)</span>
                      </td>
                    ) : (
                      listas.map(l => {
                        const c = resolveCell(p, l.id, rulesFor(l));
                        return (
                          <Fragment key={l.id}>
                            <td className="py-1.5 px-3 text-right border-l border-table-border font-mono text-odoo-teal font-semibold text-[13px]">{fmt(c.precio)}</td>
                            <td className="py-1.5 px-3 text-right font-mono text-[13px]">
                              {c.comisionMonto > 0 ? (
                                <span className="text-green-600 font-semibold">
                                  {fmt(c.comisionMonto)}
                                  {c.comisionPct != null && <span className="text-muted-foreground font-normal"> ({c.comisionPct}%)</span>}
                                </span>
                              ) : <span className="text-muted-foreground">—</span>}
                            </td>
                          </Fragment>
                        );
                      })
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </ListPage>
  );
}
