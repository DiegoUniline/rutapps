import { useState, useEffect, useRef } from 'react';
import { X, Save, Loader2, Camera, ChevronDown, ChevronUp } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { compressPhoto } from '@/lib/imageCompressor';
import {
  useSaveProducto, useMarcas, useClasificaciones, useListas, useUnidades,
  useAlmacenes, useUnidadesSat, useTasasIva,
} from '@/hooks/useData';
import { defaultProduct } from '@/pages/ProductoForm/useProductoForm';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { Producto } from '@/types';

const inputCls = "w-full h-11 px-3 rounded-lg border border-input bg-background text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/40";
const selectCls = inputCls;

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        {label}{required && <span className="text-destructive ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated?: (id: string) => void;
}

export function MobileProductoQuickForm({ open, onOpenChange, onCreated }: Props) {
  const { empresa } = useAuth();
  const saveMutation = useSaveProducto();
  const { data: marcas } = useMarcas();
  const { data: clasificaciones } = useClasificaciones();
  const { data: listas } = useListas();
  const { data: unidades } = useUnidades();
  const { data: almacenes } = useAlmacenes();
  const { data: unidadesSat } = useUnidadesSat();
  const { data: tasasIva } = useTasasIva();

  const [form, setForm] = useState<Partial<Producto>>(defaultProduct);
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [showFiscal, setShowFiscal] = useState(false);
  const [showAvanzado, setShowAvanzado] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const set = (k: keyof Producto, v: any) => setForm(prev => ({ ...prev, [k]: v }));

  // Reset on close + smart defaults on open
  useEffect(() => {
    if (open) {
      setForm(prev => {
        const updates: Partial<Producto> = { ...defaultProduct };
        if (almacenes?.length) updates.almacenes = almacenes.map(a => a.id);
        if (unidades?.length) {
          const pieza = unidades.find(u => u.nombre.toLowerCase() === 'pieza') ?? unidades[0];
          updates.unidad_venta_id = pieza.id;
          updates.unidad_compra_id = pieza.id;
        }
        if (listas?.length) {
          const general = listas.find(l => l.nombre.toLowerCase().includes('general')) ?? listas[0];
          updates.lista_id = general.id;
        }
        return updates;
      });
      setShowFiscal(false);
      setShowAvanzado(false);
    }
  }, [open, almacenes, unidades, listas]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !empresa?.id) return;
    setUploadingImage(true);
    try {
      const compressed = await compressPhoto(file);
      const ext = compressed.name.split('.').pop() || 'jpg';
      const productId = crypto.randomUUID();
      const path = `${empresa.id}/productos/${productId}.${ext}`;
      const { error: upErr } = await supabase.storage.from('empresa-assets').upload(path, compressed, { upsert: true });
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from('empresa-assets').getPublicUrl(path);
      set('imagen_url', urlData.publicUrl + '?t=' + Date.now());
      toast.success('Imagen cargada');
    } catch (err: any) {
      toast.error('Error al subir imagen: ' + err.message);
    } finally {
      setUploadingImage(false);
      if (imageInputRef.current) imageInputRef.current.value = '';
    }
  };

  const handleSave = async () => {
    if (!form.codigo?.trim() || !form.nombre?.trim()) {
      toast.error('Código y nombre son obligatorios');
      return;
    }
    setSaving(true);
    try {
      const result = await saveMutation.mutateAsync(form);
      toast.success('Producto creado');
      onOpenChange(false);
      if (result?.id) onCreated?.(result.id);
    } catch (err: any) {
      toast.error(err.message || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="p-0 gap-0 max-w-md w-[calc(100vw-1rem)] max-h-[90vh] overflow-hidden flex flex-col z-[60]"
        onOpenAutoFocus={e => e.preventDefault()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-background sticky top-0">
          <button
            onClick={() => onOpenChange(false)}
            className="h-9 w-9 rounded-lg bg-card border border-border flex items-center justify-center active:scale-90 transition-transform"
          >
            <X className="h-4 w-4 text-foreground" />
          </button>
          <h2 className="text-base font-bold text-foreground flex-1">Nuevo producto</h2>
          <button
            onClick={handleSave}
            disabled={saving}
            className="h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-semibold flex items-center gap-1.5 active:scale-95 transition-transform disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Guardar
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
          {/* Imagen */}
          <div className="flex items-center gap-3">
            <div className="h-20 w-20 rounded-lg bg-secondary border border-border overflow-hidden flex items-center justify-center shrink-0">
              {form.imagen_url ? (
                <img src={form.imagen_url} alt="" className="h-full w-full object-cover" />
              ) : (
                <Camera className="h-7 w-7 text-muted-foreground" />
              )}
            </div>
            <div className="flex-1">
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleImageUpload}
              />
              <button
                type="button"
                onClick={() => imageInputRef.current?.click()}
                disabled={uploadingImage}
                className="h-10 px-4 rounded-lg border border-border bg-card text-sm font-medium text-foreground active:scale-95 transition-transform disabled:opacity-60"
              >
                {uploadingImage ? 'Subiendo…' : form.imagen_url ? 'Cambiar imagen' : 'Subir imagen'}
              </button>
            </div>
          </div>

          {/* Información básica */}
          <section className="space-y-3">
            <h3 className="text-sm font-bold text-foreground border-b border-border pb-1">Información básica</h3>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Código" required>
                <input className={inputCls} placeholder="SKU" value={form.codigo ?? ''} onChange={e => set('codigo', e.target.value)} />
              </Field>
              <Field label="Clave alterna">
                <input className={inputCls} placeholder="—" value={form.clave_alterna ?? ''} onChange={e => set('clave_alterna', e.target.value)} />
              </Field>
            </div>
            <Field label="Nombre" required>
              <input className={inputCls} placeholder="Nombre del producto" value={form.nombre ?? ''} onChange={e => set('nombre', e.target.value)} autoFocus />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Categoría">
                <select className={selectCls} value={form.clasificacion_id ?? ''} onChange={e => set('clasificacion_id', e.target.value || null)}>
                  <option value="">— Sin categoría —</option>
                  {clasificaciones?.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </Field>
              <Field label="Marca">
                <select className={selectCls} value={form.marca_id ?? ''} onChange={e => set('marca_id', e.target.value || null)}>
                  <option value="">— Sin marca —</option>
                  {marcas?.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}
                </select>
              </Field>
            </div>
          </section>

          {/* Precio y costo */}
          <section className="space-y-3">
            <h3 className="text-sm font-bold text-foreground border-b border-border pb-1">Precio y costo</h3>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Costo">
                <input className={inputCls} type="number" inputMode="decimal" step="0.01" placeholder="0.00" value={form.costo ?? 0} onChange={e => set('costo', +e.target.value)} />
              </Field>
              <Field label="Precio venta" required>
                <input className={inputCls} type="number" inputMode="decimal" step="0.01" placeholder="0.00" value={form.precio_principal ?? 0} onChange={e => set('precio_principal', +e.target.value)} />
              </Field>
            </div>
            <Field label="Lista de precios">
              <select className={selectCls} value={form.lista_id ?? ''} onChange={e => set('lista_id', e.target.value || null)}>
                <option value="">— Seleccionar —</option>
                {listas?.map(l => <option key={l.id} value={l.id}>{l.nombre}</option>)}
              </select>
            </Field>
          </section>

          {/* Inventario */}
          <section className="space-y-3">
            <h3 className="text-sm font-bold text-foreground border-b border-border pb-1">Inventario</h3>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Unidad venta">
                <select className={selectCls} value={form.unidad_venta_id ?? ''} onChange={e => set('unidad_venta_id', e.target.value || null)}>
                  <option value="">—</option>
                  {unidades?.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
                </select>
              </Field>
              <Field label="Stock inicial">
                <input className={inputCls} type="number" inputMode="decimal" step="0.001" placeholder="0" value={form.cantidad ?? 0} onChange={e => set('cantidad', +e.target.value)} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Stock mínimo">
                <input className={inputCls} type="number" inputMode="decimal" step="0.001" placeholder="0" value={form.min ?? 0} onChange={e => set('min', +e.target.value)} />
              </Field>
              <Field label="Stock máximo">
                <input className={inputCls} type="number" inputMode="decimal" step="0.001" placeholder="0" value={form.max ?? 0} onChange={e => set('max', +e.target.value)} />
              </Field>
            </div>
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Vender sin stock</label>
              <button
                type="button"
                onClick={() => set('vender_sin_stock', !form.vender_sin_stock)}
                className={cn("h-7 w-12 rounded-full transition-colors relative", form.vender_sin_stock ? "bg-primary" : "bg-input")}
              >
                <span className={cn("absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform", form.vender_sin_stock ? "translate-x-5" : "translate-x-0.5")} />
              </button>
            </div>
          </section>

          {/* Fiscal (collapsible) */}
          <button
            type="button"
            onClick={() => setShowFiscal(!showFiscal)}
            className="w-full flex items-center justify-between py-2 text-sm font-semibold text-primary"
          >
            Datos fiscales
            {showFiscal ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          {showFiscal && (
            <section className="space-y-3 animate-in slide-in-from-top-2 duration-200">
              <Field label="Clave SAT">
                <input className={inputCls} placeholder="01010101" value={form.codigo_sat ?? ''} onChange={e => set('codigo_sat', e.target.value)} />
              </Field>
              <Field label="Unidad SAT">
                <select className={selectCls} value={form.unidad_sat_id ?? ''} onChange={e => set('unidad_sat_id', e.target.value || null)}>
                  <option value="">— Seleccionar —</option>
                  {unidadesSat?.slice(0, 50).map(u => <option key={u.id} value={u.id}>{u.clave} - {u.descripcion}</option>)}
                </select>
              </Field>
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Tiene IVA</label>
                <button
                  type="button"
                  onClick={() => set('tiene_iva', !form.tiene_iva)}
                  className={cn("h-7 w-12 rounded-full transition-colors relative", form.tiene_iva ? "bg-primary" : "bg-input")}
                >
                  <span className={cn("absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform", form.tiene_iva ? "translate-x-5" : "translate-x-0.5")} />
                </button>
              </div>
              {form.tiene_iva && (
                <Field label="% IVA">
                  <select className={selectCls} value={form.iva_pct ?? 16} onChange={e => set('iva_pct', +e.target.value)}>
                    {(tasasIva ?? [{ pct: 16 }, { pct: 8 }, { pct: 0 }]).map((t: any) => (
                      <option key={t.pct} value={t.pct}>{t.pct}%</option>
                    ))}
                  </select>
                </Field>
              )}
            </section>
          )}

          {/* Avanzado (collapsible) */}
          <button
            type="button"
            onClick={() => setShowAvanzado(!showAvanzado)}
            className="w-full flex items-center justify-between py-2 text-sm font-semibold text-primary"
          >
            Opciones avanzadas
            {showAvanzado ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          {showAvanzado && (
            <section className="space-y-3 animate-in slide-in-from-top-2 duration-200">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Se puede vender</label>
                <button type="button" onClick={() => set('se_puede_vender', !form.se_puede_vender)}
                  className={cn("h-7 w-12 rounded-full transition-colors relative", form.se_puede_vender ? "bg-primary" : "bg-input")}>
                  <span className={cn("absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform", form.se_puede_vender ? "translate-x-5" : "translate-x-0.5")} />
                </button>
              </div>
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Se puede comprar</label>
                <button type="button" onClick={() => set('se_puede_comprar', !form.se_puede_comprar)}
                  className={cn("h-7 w-12 rounded-full transition-colors relative", form.se_puede_comprar ? "bg-primary" : "bg-input")}>
                  <span className={cn("absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform", form.se_puede_comprar ? "translate-x-5" : "translate-x-0.5")} />
                </button>
              </div>
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Es a granel</label>
                <button type="button" onClick={() => set('es_granel', !form.es_granel)}
                  className={cn("h-7 w-12 rounded-full transition-colors relative", form.es_granel ? "bg-primary" : "bg-input")}>
                  <span className={cn("absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform", form.es_granel ? "translate-x-5" : "translate-x-0.5")} />
                </button>
              </div>
              <Field label="Estado">
                <select className={selectCls} value={form.status ?? 'activo'} onChange={e => set('status', e.target.value as any)}>
                  <option value="activo">Activo</option>
                  <option value="inactivo">Inactivo</option>
                  <option value="borrador">Borrador</option>
                </select>
              </Field>
            </section>
          )}

          <div className="h-4" />
        </div>
      </DialogContent>
    </Dialog>
  );
}
