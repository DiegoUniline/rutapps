import { useState, useMemo } from 'react';
import { Tag, Check, Star, Pencil } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { resolveProductPricing, type TarifaLineaRule, type ProductForPricing } from '@/lib/priceResolver';
import { useCurrency } from '@/hooks/useCurrency';
import { cn } from '@/lib/utils';

interface Props {
  producto: any | null;
  currentListaPrecioId?: string | null;
  currentTarifaId?: string | null;
  isManual?: boolean;
  disabled?: boolean;
  onSelectLista: (
    listaPrecioId: string | null,
    tarifaId: string | null,
    unitPrice: number,
    displayPrice: number,
    listaNombre: string,
  ) => void;
  /** Render trigger as compact badge */
  compact?: boolean;
}

interface ListaOption {
  lista_precio_id: string | null;
  lista_nombre: string;
  tarifa_id: string | null;
  tarifa_nombre: string;
  es_principal: boolean;
  unitPrice: number;
  displayPrice: number;
  hasRule: boolean;
}

/**
 * Popover that shows all active price lists with the calculated price for the
 * selected product, plus the product's base price as a fallback. Lets user
 * switch the price list per line.
 */
export function ListaPrecioPicker({
  producto, currentListaPrecioId, currentTarifaId, isManual, disabled, onSelectLista, compact,
}: Props) {
  const { empresa } = useAuth();
  const { fmt } = useCurrency();
  const [open, setOpen] = useState(false);

  // Fetch all active tarifas + their lista_precios + their rules (only when popover opens)
  const { data: pricingData } = useQuery({
    queryKey: ['venta-line-pricing-options', empresa?.id],
    enabled: !!empresa?.id && open,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data: tarifas } = await supabase.from('tarifas').select('id, nombre, activa').eq('empresa_id', empresa!.id).eq('activa', true);
      const tarifaIds = (tarifas ?? []).map((t: any) => t.id);
      const [{ data: listas }, { data: rules }] = await Promise.all([
        supabase.from('lista_precios').select('id, nombre, tarifa_id, es_principal, activa').eq('empresa_id', empresa!.id),
        tarifaIds.length
          ? supabase.from('tarifa_lineas')
              .select('tarifa_id, aplica_a, producto_ids, clasificacion_ids, tipo_calculo, precio, precio_minimo, margen_pct, descuento_pct, redondeo, base_precio, lista_precio_id')
              .in('tarifa_id', tarifaIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);
      return {
        tarifas: tarifas ?? [],
        listas: (listas ?? []).filter((l: any) => l.activa !== false),
        rules: rules ?? [],
      };
    },
  });

  const options: ListaOption[] = useMemo(() => {
    if (!producto || !pricingData) return [];
    const { tarifas, listas, rules } = pricingData;
    const pf: ProductForPricing = {
      id: producto.id,
      precio_principal: Number(producto.precio_principal) || 0,
      costo: Number(producto.costo) || 0,
      clasificacion_id: producto.clasificacion_id,
      tiene_iva: producto.tiene_iva,
      iva_pct: Number(producto.iva_pct ?? 16),
      tiene_ieps: producto.tiene_ieps,
      ieps_pct: Number(producto.ieps_pct ?? 0),
      ieps_tipo: producto.ieps_tipo,
      usa_listas_precio: producto.usa_listas_precio,
    };

    const result: ListaOption[] = [];
    // For each lista_precio, compute price using its tarifa's rules
    for (const lista of listas) {
      const tarifa = tarifas.find((t: any) => t.id === lista.tarifa_id);
      if (!tarifa) continue;
      const tarifaRules = (rules as TarifaLineaRule[]).filter((r: any) => r.tarifa_id === tarifa.id);
      const r = resolveProductPricing(tarifaRules, pf, lista.id);
      result.push({
        lista_precio_id: lista.id,
        lista_nombre: lista.nombre,
        tarifa_id: tarifa.id,
        tarifa_nombre: tarifa.nombre,
        es_principal: !!lista.es_principal,
        unitPrice: r.unitPrice,
        displayPrice: r.displayPrice,
        hasRule: !!r.appliedRule,
      });
    }
    // Sort: principal first, then by name
    result.sort((a, b) => (a.es_principal === b.es_principal ? a.lista_nombre.localeCompare(b.lista_nombre) : a.es_principal ? -1 : 1));
    return result;
  }, [producto, pricingData]);

  const currentLabel = useMemo(() => {
    if (isManual) return 'Manual';
    if (!currentListaPrecioId) return 'Base';
    const opt = options.find(o => o.lista_precio_id === currentListaPrecioId);
    return opt?.lista_nombre ?? '—';
  }, [isManual, currentListaPrecioId, options]);

  if (!producto) return null;

  const triggerCls = compact
    ? cn(
        "inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md font-medium transition-colors border",
        isManual
          ? "bg-amber-500/15 border-amber-500/40 text-amber-700 dark:text-amber-300"
          : "bg-primary/10 border-primary/20 text-primary hover:bg-primary/20",
        disabled && "opacity-60 cursor-not-allowed",
      )
    : cn(
        "inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-md font-medium transition-colors border",
        isManual
          ? "bg-amber-500/15 border-amber-500/40 text-amber-700 dark:text-amber-300"
          : "bg-primary/10 border-primary/20 text-primary hover:bg-primary/20",
        disabled && "opacity-60 cursor-not-allowed",
      );

  return (
    <Popover open={open} onOpenChange={(v) => !disabled && setOpen(v)}>
      <PopoverTrigger asChild>
        <button type="button" disabled={disabled} className={triggerCls} title={isManual ? 'Precio modificado manualmente · clic para elegir lista' : 'Elegir lista de precios'}>
          {isManual ? <Pencil className="h-3 w-3" /> : <Tag className="h-3 w-3" />}
          <span className="truncate max-w-[100px]">{currentLabel}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="end">
        <div className="px-3 py-2 border-b border-border">
          <div className="text-xs font-semibold">Listas de precios</div>
          <div className="text-[10px] text-muted-foreground truncate">{producto.nombre}</div>
        </div>
        <div className="max-h-64 overflow-y-auto">
          {options.length === 0 && (
            <div className="px-3 py-4 text-xs text-muted-foreground text-center">Sin listas configuradas</div>
          )}
          {options.map(opt => {
            const isCurrent = !isManual && opt.lista_precio_id === currentListaPrecioId;
            return (
              <button
                key={opt.lista_precio_id ?? 'base'}
                type="button"
                onClick={() => {
                  onSelectLista(opt.lista_precio_id, opt.tarifa_id, opt.unitPrice, opt.displayPrice, opt.lista_nombre);
                  setOpen(false);
                }}
                className={cn(
                  "w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-accent border-b border-border/50 last:border-0",
                  isCurrent && "bg-primary/5",
                )}
              >
                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                  {isCurrent && <Check className="h-3 w-3 text-primary shrink-0" />}
                  {opt.es_principal && <Star className="h-3 w-3 text-amber-500 fill-amber-500 shrink-0" />}
                  <div className="min-w-0">
                    <div className="font-medium truncate">{opt.lista_nombre}</div>
                    <div className="text-[10px] text-muted-foreground truncate">
                      {opt.tarifa_nombre}{!opt.hasRule && ' · sin regla (precio base)'}
                    </div>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-semibold">{fmt(opt.displayPrice)}</div>
                  {opt.displayPrice !== opt.unitPrice && (
                    <div className="text-[9px] text-muted-foreground">neto: {fmt(opt.unitPrice)}</div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
        {isManual && (
          <div className="px-3 py-2 border-t border-border bg-amber-500/5">
            <div className="text-[10px] text-amber-700 dark:text-amber-300">
              El precio fue modificado manualmente. Selecciona una lista para reemplazar.
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
