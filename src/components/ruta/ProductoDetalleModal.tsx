import { useEffect, useMemo, useState } from 'react';
import { X, Tag, Check, Star, Pencil, Package, ImageOff } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { resolveProductPricing, type TarifaLineaRule, type ProductForPricing } from '@/lib/priceResolver';
import { useCurrency } from '@/hooks/useCurrency';
import { cn } from '@/lib/utils';

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

interface Props {
  open: boolean;
  onClose: () => void;
  producto: any | null;
  /** Current applied unit price (from cart line, or suggested if not in cart) */
  currentUnitPrice: number;
  /** Suggested price from active client tarifa (read-only reference) */
  suggestedPrice: number;
  /** True when user has manually overridden the price */
  isManual: boolean;
  /** Currently active lista_precio_id (if any) */
  currentListaPrecioId?: string | null;
  /** When false the modal stays read-only (no list switching, no manual entry) */
  canEdit?: boolean;
  /** Apply a price from a list (or back to suggested) */
  onSelectLista: (
    listaPrecioId: string | null,
    tarifaId: string | null,
    unitPrice: number,
    listaNombre: string,
  ) => void;
  /** Apply a manually-typed price */
  onSetManualPrice: (price: number) => void;
  /** Reset to the suggested (tarifa) price */
  onResetToSuggested: () => void;
}

/**
 * Mobile-first product detail modal: shows photo, suggested price,
 * alternative price lists and manual override input.
 */
export function ProductoDetalleModal({
  open, onClose, producto, currentUnitPrice, suggestedPrice, isManual,
  currentListaPrecioId, canEdit = true, onSelectLista, onSetManualPrice, onResetToSuggested,
}: Props) {
  const { empresa } = useAuth();
  const { fmt, symbol } = useCurrency();
  const [manualInput, setManualInput] = useState<string>('');
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    if (open) {
      setManualInput(currentUnitPrice ? currentUnitPrice.toString() : '');
      setImgError(false);
    }
  }, [open, currentUnitPrice]);

  const { data: pricingData } = useQuery({
    queryKey: ['ruta-producto-detalle-pricing', empresa?.id],
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
    result.sort((a, b) => (a.es_principal === b.es_principal ? a.lista_nombre.localeCompare(b.lista_nombre) : a.es_principal ? -1 : 1));
    return result;
  }, [producto, pricingData]);

  const handleApplyManual = () => {
    const v = Number(manualInput.replace(',', '.'));
    if (!isFinite(v) || v < 0) return;
    onSetManualPrice(v);
    onClose();
  };

  if (!open || !producto) return null;

  const fotoUrl: string | null = producto.foto_url || producto.imagen_url || null;
  const stockAbordo = producto.cantidad ?? 0;
  const unidadAbrev = (producto.unidades as any)?.abreviatura || (producto.es_granel ? producto.unidad_granel : 'pz');
  const ivaTxt = producto.tiene_iva ? `IVA ${producto.iva_pct ?? 16}%` : 'Sin IVA';

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-md bg-background rounded-t-2xl shadow-2xl max-h-[92vh] flex flex-col animate-in slide-in-from-bottom duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle + header */}
        <div className="px-4 pt-2.5 pb-2 border-b border-border">
          <div className="w-10 h-1 bg-muted-foreground/30 rounded-full mx-auto mb-2.5" />
          <div className="flex items-start gap-2">
            <div className="flex-1 min-w-0">
              <h3 className="text-[15px] font-bold text-foreground truncate">{producto.nombre}</h3>
              <p className="text-[11px] text-muted-foreground font-mono">{producto.codigo}</p>
            </div>
            <button
              onClick={onClose}
              aria-label="Cerrar"
              className="w-8 h-8 rounded-lg bg-accent/60 flex items-center justify-center active:scale-95 transition-transform shrink-0"
            >
              <X className="h-4 w-4 text-foreground" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Photo */}
          <div className="px-4 pt-3">
            <div className="aspect-[16/9] w-full rounded-xl overflow-hidden bg-accent/40 flex items-center justify-center">
              {fotoUrl && !imgError ? (
                <img
                  src={fotoUrl}
                  alt={producto.nombre}
                  className="w-full h-full object-contain"
                  onError={() => setImgError(true)}
                />
              ) : (
                <div className="flex flex-col items-center gap-1.5 text-muted-foreground">
                  {fotoUrl ? <ImageOff className="h-8 w-8" /> : <Package className="h-8 w-8" />}
                  <span className="text-[11px]">Sin foto</span>
                </div>
              )}
            </div>
          </div>

          {/* Quick info chips */}
          <div className="px-4 pt-3 flex flex-wrap gap-1.5">
            <span className="text-[10.5px] px-2 py-0.5 rounded-md bg-accent/60 text-foreground font-medium">
              Stock: {stockAbordo} {unidadAbrev}
            </span>
            <span className="text-[10.5px] px-2 py-0.5 rounded-md bg-accent/60 text-foreground font-medium">
              {ivaTxt}
            </span>
            {producto.tiene_ieps && (
              <span className="text-[10.5px] px-2 py-0.5 rounded-md bg-accent/60 text-foreground font-medium">
                IEPS {producto.ieps_pct ?? 0}%
              </span>
            )}
            {producto.es_granel && (
              <span className="text-[10.5px] px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-700 dark:text-amber-300 font-medium">
                A granel
              </span>
            )}
          </div>

          {/* Suggested vs current */}
          <div className="px-4 pt-3">
            <div className="rounded-xl border border-border bg-card p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Precio sugerido</p>
                  <p className="text-[18px] font-bold text-foreground">{fmt(suggestedPrice)}</p>
                  <p className="text-[10px] text-muted-foreground">según tarifa del cliente</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Aplicado</p>
                  <p className={cn("text-[18px] font-bold", isManual ? "text-amber-600 dark:text-amber-400" : "text-primary")}>
                    {fmt(currentUnitPrice)}
                  </p>
                  <p className="text-[10px] flex items-center justify-end gap-1">
                    {isManual ? (
                      <><Pencil className="h-2.5 w-2.5" /><span className="text-amber-600 dark:text-amber-400">Manual</span></>
                    ) : (
                      <><Tag className="h-2.5 w-2.5" /><span className="text-primary">Tarifa</span></>
                    )}
                  </p>
                </div>
              </div>
              {(isManual || currentListaPrecioId) && canEdit && (
                <button
                  onClick={() => { onResetToSuggested(); onClose(); }}
                  className="mt-2.5 w-full text-[11px] font-medium text-primary py-1.5 rounded-md bg-primary/10 hover:bg-primary/15 active:scale-[0.98] transition-all"
                >
                  Volver al precio sugerido
                </button>
              )}
            </div>
          </div>

          {/* Other price lists */}
          <div className="px-4 pt-3">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-1.5 px-1">
              {canEdit ? 'Otras listas de precios' : 'Listas de precios disponibles'}
            </p>
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              {options.length === 0 && (
                <p className="text-[12px] text-muted-foreground text-center py-4">Sin listas configuradas</p>
              )}
              {options.map(opt => {
                const isCurrent = !isManual && opt.lista_precio_id === currentListaPrecioId;
                const content = (
                  <>
                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                      {isCurrent && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
                      {opt.es_principal && <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500 shrink-0" />}
                      <div className="min-w-0">
                        <div className="text-[12.5px] font-semibold truncate text-foreground">{opt.lista_nombre}</div>
                        <div className="text-[10px] text-muted-foreground truncate">
                          {opt.tarifa_nombre}{!opt.hasRule && ' · sin regla'}
                        </div>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-[13px] font-bold text-foreground">{fmt(opt.displayPrice)}</div>
                      {opt.displayPrice !== opt.unitPrice && (
                        <div className="text-[9px] text-muted-foreground">neto: {fmt(opt.unitPrice)}</div>
                      )}
                    </div>
                  </>
                );
                if (!canEdit) {
                  return (
                    <div
                      key={opt.lista_precio_id ?? 'base'}
                      className={cn(
                        "w-full flex items-center justify-between gap-2 px-3 py-2.5 border-b border-border/60 last:border-0 opacity-80",
                        isCurrent && "bg-primary/5",
                      )}
                    >
                      {content}
                    </div>
                  );
                }
                return (
                  <button
                    key={opt.lista_precio_id ?? 'base'}
                    type="button"
                    onClick={() => {
                      onSelectLista(opt.lista_precio_id, opt.tarifa_id, opt.unitPrice, opt.lista_nombre);
                      onClose();
                    }}
                    className={cn(
                      "w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left transition-colors active:bg-accent border-b border-border/60 last:border-0",
                      isCurrent && "bg-primary/5",
                    )}
                  >
                    {content}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Manual price (only if user can edit) */}
          {canEdit ? (
            <div className="px-4 pt-3 pb-4">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-1.5 px-1">
                Precio manual
              </p>
              <div className="rounded-xl border border-border bg-card p-3">
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[14px] font-semibold text-muted-foreground">{symbol}</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min="0"
                      value={manualInput}
                      onChange={(e) => setManualInput(e.target.value)}
                      placeholder="0.00"
                      className="w-full bg-accent/60 rounded-lg pl-7 pr-3 py-2.5 text-[15px] font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                    />
                  </div>
                  <button
                    onClick={handleApplyManual}
                    className="px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-[13px] font-semibold active:scale-95 transition-transform shadow-sm shadow-primary/20"
                  >
                    Aplicar
                  </button>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1.5">
                  El precio manual reemplaza la tarifa para esta venta solamente.
                </p>
              </div>
            </div>
          ) : (
            <div className="px-4 pt-3 pb-4">
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-[11px] text-amber-700 dark:text-amber-300">
                🔒 No tienes permiso para cambiar precios. Pide a tu administrador el permiso <span className="font-semibold">"Cambiar precio en venta"</span>.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
