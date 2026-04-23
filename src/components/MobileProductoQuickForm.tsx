import { useState, useEffect, useRef, useMemo } from 'react';
import { X, Save, Loader2, Camera, Lock } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { compressPhoto } from '@/lib/imageCompressor';
import {
  useSaveProducto, useMarcas, useClasificaciones, useUnidades,
  useAlmacenes, useUnidadesSat, useTasasIva, useProveedores,
  useAllListasPrecios, useTarifaLineasForProducto,
  useProductoProveedores, useSaveProductoProveedor, useDeleteProductoProveedor,
} from '@/hooks/useData';
import { defaultProduct } from '@/pages/ProductoForm/useProductoForm';
import { PreciosTab } from '@/components/producto/PreciosTab';
import { ProveedoresTab } from '@/components/producto/ProveedoresTab';
import KardexTab from '@/components/KardexTab';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
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

function Toggle({ value, onChange }: { value: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      onClick={onChange}
      className={cn("h-7 w-12 rounded-full transition-colors relative shrink-0", value ? "bg-primary" : "bg-input")}
    >
      <span className={cn("absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform", value ? "translate-x-5" : "translate-x-0.5")} />
    </button>
  );
}

function ToggleRow({ label, value, onChange }: { label: string; value: boolean; onChange: () => void }) {
  return (
    <div className="flex items-center justify-between">
      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{label}</label>
      <Toggle value={value} onChange={onChange} />
    </div>
  );
}

function LockedNotice({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 px-3 py-4 rounded-lg bg-muted/30 border border-border text-xs text-muted-foreground">
      <Lock className="h-3.5 w-3.5 shrink-0" />
      <span>{message}</span>
    </div>
  );
}

function TabPanel({
  id, active, locked, lockedMsg, children,
}: { id: string; active: string; locked?: boolean; lockedMsg?: string; children?: React.ReactNode }) {
  if (active !== id) return null;
  if (locked) return <LockedNotice message={lockedMsg || 'Guarda primero el producto.'} />;
  return <div className="space-y-3 animate-in fade-in duration-150">{children}</div>;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated?: (id: string) => void;
}

export function MobileProductoQuickForm({ open, onOpenChange, onCreated }: Props) {
  const { empresa } = useAuth();
  const navigate = useNavigate();
  const saveMutation = useSaveProducto();
  const { data: marcas } = useMarcas();
  const { data: clasificaciones } = useClasificaciones();
  const { data: unidades } = useUnidades();
  const { data: almacenes } = useAlmacenes();
  const { data: unidadesSat } = useUnidadesSat();
  const { data: tasasIva } = useTasasIva();
  const { data: proveedores } = useProveedores();
  const { data: tarifasDisp } = useAllListasPrecios(empresa?.id);

  const [savedId, setSavedId] = useState<string | undefined>(undefined);
  const isNew = !savedId;

  const { data: tarifaLineas } = useTarifaLineasForProducto(savedId, undefined);
  const { data: prodProveedores } = useProductoProveedores(savedId);
  const saveProvMut = useSaveProductoProveedor();
  const deleteProvMut = useDeleteProductoProveedor();

  const [form, setForm] = useState<Partial<Producto>>(defaultProduct);
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [activeTab, setActiveTab] = useState<string>('basico');
  const imageInputRef = useRef<HTMLInputElement>(null);

  const set = (k: keyof Producto, v: any) => setForm(prev => ({ ...prev, [k]: v }));

  // Reset on close + smart defaults on open
  useEffect(() => {
    if (open) {
      setSavedId(undefined);
      setForm(() => {
        const updates: Partial<Producto> = { ...defaultProduct };
        if (almacenes?.length) updates.almacenes = almacenes.map(a => a.id);
        if (unidades?.length) {
          const pieza = unidades.find(u => u.nombre.toLowerCase() === 'pieza') ?? unidades[0];
          updates.unidad_venta_id = pieza.id;
          updates.unidad_compra_id = pieza.id;
        }
        return updates;
      });
      setActiveTab('basico');
    }
  }, [open, almacenes, unidades]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !empresa?.id) return;
    setUploadingImage(true);
    try {
      const compressed = await compressPhoto(file);
      const ext = compressed.name.split('.').pop() || 'jpg';
      const productId = savedId ?? crypto.randomUUID();
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
      const result = await saveMutation.mutateAsync(savedId ? { ...form, id: savedId } : form);
      toast.success(savedId ? 'Producto actualizado' : 'Producto creado');
      if (result?.id && !savedId) {
        setSavedId(result.id);
        setForm(prev => ({ ...prev, id: result.id }));
      }
    } catch (err: any) {
      toast.error(err.message || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    if (savedId && onCreated) onCreated(savedId);
    onOpenChange(false);
  };

  const ivaTipo = (form as any).usa_listas_precio ? 'listas' : 'directo';
  const setModoPrecio = (mode: 'directo' | 'listas') => setForm(f => ({ ...f, usa_listas_precio: mode === 'listas' } as any));

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className="p-0 gap-0 max-w-md w-[calc(100vw-1rem)] max-h-[90vh] overflow-hidden flex flex-col z-[60]"
        onOpenAutoFocus={e => e.preventDefault()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-background shrink-0">
          <button
            onClick={handleClose}
            className="h-9 w-9 rounded-lg bg-card border border-border flex items-center justify-center active:scale-90 transition-transform"
          >
            <X className="h-4 w-4 text-foreground" />
          </button>
          <h2 className="text-base font-bold text-foreground flex-1 truncate">
            {savedId ? form.nombre || 'Producto' : 'Nuevo producto'}
          </h2>
        </div>

        {/* Tabs nav */}
        <div className="border-b border-border bg-card shrink-0 overflow-x-auto">
          <div className="flex gap-0 min-w-max">
            {tabs.map(t => {
              const isActive = activeTab === t.id;
              const isLocked = t.locked;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setActiveTab(t.id)}
                  className={cn(
                    "px-3 h-11 text-xs font-semibold whitespace-nowrap border-b-2 transition-colors flex items-center gap-1",
                    isActive
                      ? "text-primary border-primary"
                      : "text-muted-foreground border-transparent hover:text-foreground"
                  )}
                >
                  {isLocked && <Lock className="h-3 w-3" />}
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
          {/* ── Información básica ── */}
          <TabPanel id="basico" active={activeTab}>
            {/* Imagen + Estado */}
            <div className="flex items-center gap-3 bg-card border border-border rounded-lg p-3">
              <div className="h-16 w-16 rounded-lg bg-secondary border border-border overflow-hidden flex items-center justify-center shrink-0">
                {form.imagen_url ? (
                  <img src={form.imagen_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <Camera className="h-6 w-6 text-muted-foreground" />
                )}
              </div>
              <div className="flex-1 space-y-1">
                <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                <button
                  type="button"
                  onClick={() => imageInputRef.current?.click()}
                  disabled={uploadingImage}
                  className="h-9 px-3 rounded-lg border border-border bg-background text-xs font-medium text-foreground active:scale-95 transition-transform disabled:opacity-60 w-full"
                >
                  {uploadingImage ? 'Subiendo…' : form.imagen_url ? 'Cambiar imagen' : 'Subir imagen'}
                </button>
                <select className="w-full h-9 px-2 rounded-lg border border-input bg-background text-xs text-foreground"
                  value={form.status ?? 'activo'} onChange={e => set('status', e.target.value as any)}>
                  <option value="activo">Activo</option>
                  <option value="inactivo">Inactivo</option>
                  <option value="borrador">Borrador</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Código" required>
                <input className={inputCls} placeholder="SKU" value={form.codigo ?? ''} onChange={e => set('codigo', e.target.value)} />
              </Field>
              <Field label="Clave alterna">
                <input className={inputCls} placeholder="—" value={form.clave_alterna ?? ''} onChange={e => set('clave_alterna', e.target.value)} />
              </Field>
            </div>
            <Field label="Nombre" required>
              <input className={inputCls} placeholder="Nombre del producto" value={form.nombre ?? ''} onChange={e => set('nombre', e.target.value)} />
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
            <div className="grid grid-cols-2 gap-3">
              <Field label="Unidad venta">
                <select className={selectCls} value={form.unidad_venta_id ?? ''} onChange={e => set('unidad_venta_id', e.target.value || null)}>
                  <option value="">—</option>
                  {unidades?.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
                </select>
              </Field>
              <Field label="Unidad compra">
                <select className={selectCls} value={form.unidad_compra_id ?? ''} onChange={e => set('unidad_compra_id', e.target.value || null)}>
                  <option value="">—</option>
                  {unidades?.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
                </select>
              </Field>
            </div>
            <Field label="Factor conversión">
              <input className={inputCls} type="number" inputMode="decimal" step="0.001" placeholder="1" value={form.factor_conversion ?? 1} onChange={e => set('factor_conversion', +e.target.value || 1)} />
            </Field>
            <ToggleRow label="Producto a granel" value={!!form.es_granel} onChange={() => set('es_granel', !form.es_granel)} />
            {form.es_granel && (
              <Field label="Unidad granel">
                <select className={selectCls} value={form.unidad_granel ?? 'kg'} onChange={e => set('unidad_granel', e.target.value)}>
                  <option value="kg">Kilogramo (kg)</option>
                  <option value="g">Gramo (g)</option>
                  <option value="litro">Litro (L)</option>
                  <option value="ml">Mililitro (ml)</option>
                  <option value="pieza">Pieza (fraccionada)</option>
                </select>
              </Field>
            )}
          </TabPanel>

          {/* ── Precio y costo ── */}
          <TabPanel id="precio" active={activeTab}>
            <Field label="Modo de precio">
              <div className="grid grid-cols-2 gap-2">
                {(['directo', 'listas'] as const).map(mode => (
                  <button key={mode} type="button" onClick={() => setModoPrecio(mode)}
                    className={cn(
                      "h-10 rounded-lg border text-xs font-semibold transition-colors",
                      ivaTipo === mode
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-card text-muted-foreground border-border"
                    )}>
                    {mode === 'directo' ? 'Precio directo' : 'Listas de precio'}
                  </button>
                ))}
              </div>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Costo">
                <input className={inputCls} type="number" inputMode="decimal" step="0.01" placeholder="0.00" value={form.costo ?? 0} onChange={e => set('costo', +e.target.value)} />
              </Field>
              <Field label="Precio principal" required={!((form as any).usa_listas_precio)}>
                <input className={inputCls} type="number" inputMode="decimal" step="0.01" placeholder="0.00" value={form.precio_principal ?? 0} onChange={e => set('precio_principal', +e.target.value)} />
              </Field>
            </div>
            <Field label="Precio sugerido público">
              <input className={inputCls} type="number" inputMode="decimal" step="0.01" placeholder="0.00" value={(form as any).precio_sugerido_publico ?? 0} onChange={e => set('precio_sugerido_publico' as any, +e.target.value)} />
            </Field>
            <Field label="Cálculo costo">
              <select className={selectCls} value={form.calculo_costo ?? 'promedio'} onChange={e => set('calculo_costo', e.target.value as any)}>
                <option value="manual">Manual</option>
                <option value="ultimo">Último costo de compra</option>
                <option value="ultimo_proveedor">Último costo del proveedor principal</option>
                <option value="promedio">Promedio</option>
                <option value="estandar">Estándar</option>
                <option value="ultimo_compra">Último costo (compra directa)</option>
              </select>
            </Field>
          </TabPanel>

          {/* ── Reglas de precio (solo si listas y guardado) ── */}
          {(form as any).usa_listas_precio && (
            <TabPanel id="reglas" active={activeTab} locked={isNew} lockedMsg="Guarda el producto primero para configurar reglas por lista.">
              <div className="-mx-1 overflow-x-auto">
                <PreciosTab form={form} tarifaLineas={tarifaLineas} tarifasDisp={tarifasDisp as any} productoId={savedId} isNew={isNew} navigate={navigate} />
              </div>
            </TabPanel>
          )}

          {/* ── Fiscal ── */}
          <TabPanel id="fiscal" active={activeTab}>
            <Field label="Clave SAT">
              <input className={inputCls} placeholder="01010101" value={form.codigo_sat ?? ''} onChange={e => set('codigo_sat', e.target.value)} />
            </Field>
            <Field label="Unidad SAT">
              <select className={selectCls} value={form.udem_sat_id ?? ''} onChange={e => set('udem_sat_id', e.target.value || null)}>
                <option value="">— Seleccionar —</option>
                {unidadesSat?.slice(0, 100).map(u => <option key={u.id} value={u.id}>{u.clave} - {u.nombre}</option>)}
              </select>
            </Field>
            <ToggleRow label="Tiene IVA" value={!!form.tiene_iva} onChange={() => set('tiene_iva', !form.tiene_iva)} />
            {form.tiene_iva && (
              <Field label="% IVA">
                <div className="flex gap-2">
                  {[0, 8, 16].map(rate => (
                    <button key={rate} type="button" onClick={() => set('iva_pct', rate)}
                      className={cn(
                        "flex-1 h-10 rounded-lg border text-sm font-semibold transition-colors",
                        form.iva_pct === rate ? "bg-primary text-primary-foreground border-primary" : "bg-card text-muted-foreground border-border"
                      )}>{rate}%</button>
                  ))}
                </div>
              </Field>
            )}
            <ToggleRow label="Tiene IEPS" value={!!form.tiene_ieps} onChange={() => set('tiene_ieps', !form.tiene_ieps)} />
            {form.tiene_ieps && (
              <>
                <Field label="Tipo IEPS">
                  <div className="grid grid-cols-2 gap-2">
                    {(['porcentaje', 'cuota'] as const).map(t => (
                      <button key={t} type="button" onClick={() => set('ieps_tipo', t)}
                        className={cn(
                          "h-10 rounded-lg border text-xs font-semibold transition-colors",
                          (form.ieps_tipo || 'porcentaje') === t ? "bg-primary text-primary-foreground border-primary" : "bg-card text-muted-foreground border-border"
                        )}>{t === 'porcentaje' ? '% Porcentaje' : '$ Cuota fija'}</button>
                    ))}
                  </div>
                </Field>
                <Field label={(form.ieps_tipo || 'porcentaje') === 'cuota' ? 'IEPS cuota $' : 'IEPS %'}>
                  <input className={inputCls} type="number" inputMode="decimal" step="0.01" value={form.ieps_pct ?? 0} onChange={e => set('ieps_pct', +e.target.value)} />
                </Field>
              </>
            )}
            <ToggleRow label="Costo incluye impuestos" value={!!form.costo_incluye_impuestos} onChange={() => set('costo_incluye_impuestos', !form.costo_incluye_impuestos)} />
          </TabPanel>

          {/* ── Comisiones ── */}
          <TabPanel id="comisiones" active={activeTab}>
            <ToggleRow label="Maneja comisión" value={!!form.tiene_comision} onChange={() => set('tiene_comision', !form.tiene_comision)} />
            {form.tiene_comision && (
              (form as any).usa_listas_precio ? (
                <div className="text-xs text-muted-foreground bg-accent/30 border border-accent/50 rounded px-3 py-2">
                  💡 La comisión se configura por regla en cada lista de precios.
                </div>
              ) : (
                <>
                  <Field label="Tipo comisión">
                    <div className="grid grid-cols-2 gap-2">
                      {(['porcentaje', 'monto_fijo'] as const).map(t => (
                        <button key={t} type="button" onClick={() => set('tipo_comision', t)}
                          className={cn(
                            "h-10 rounded-lg border text-xs font-semibold transition-colors",
                            (form.tipo_comision ?? 'porcentaje') === t ? "bg-primary text-primary-foreground border-primary" : "bg-card text-muted-foreground border-border"
                          )}>{t === 'porcentaje' ? '%' : 'Monto fijo'}</button>
                      ))}
                    </div>
                  </Field>
                  <Field label={`Valor (${form.tipo_comision === 'monto_fijo' ? '$' : '%'})`}>
                    <input className={inputCls} type="number" inputMode="decimal" step="0.01" value={form.pct_comision ?? 0} onChange={e => set('pct_comision', +e.target.value)} />
                  </Field>
                </>
              )
            )}
          </TabPanel>

          {/* ── Inventario ── */}
          <TabPanel id="inventario" active={activeTab}>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Stock inicial">
                <input className={inputCls} type="number" inputMode="decimal" step="0.001" placeholder="0" value={form.cantidad ?? 0} onChange={e => set('cantidad', +e.target.value)} />
              </Field>
              <Field label="Stock mínimo">
                <input className={inputCls} type="number" inputMode="decimal" step="0.001" placeholder="0" value={form.min ?? 0} onChange={e => set('min', +e.target.value)} />
              </Field>
            </div>
            <Field label="Stock máximo">
              <input className={inputCls} type="number" inputMode="decimal" step="0.001" placeholder="0" value={form.max ?? 0} onChange={e => set('max', +e.target.value)} />
            </Field>
            <ToggleRow label="Vender sin stock" value={!!form.vender_sin_stock} onChange={() => set('vender_sin_stock', !form.vender_sin_stock)} />
            <ToggleRow label="Manejar lotes" value={!!form.manejar_lotes} onChange={() => set('manejar_lotes', !form.manejar_lotes)} />
            <ToggleRow label="Se puede vender" value={!!form.se_puede_vender} onChange={() => set('se_puede_vender', !form.se_puede_vender)} />
            <ToggleRow label="Se puede comprar" value={!!form.se_puede_comprar} onChange={() => set('se_puede_comprar', !form.se_puede_comprar)} />
            {/* Almacenes */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Almacenes</label>
              <div className="flex items-center gap-3 mb-1">
                <button type="button" onClick={() => set('almacenes', almacenes?.map(a => a.id) ?? [])} className="text-xs text-primary">Todos</button>
                <button type="button" onClick={() => set('almacenes', [])} className="text-xs text-muted-foreground">Ninguno</button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {almacenes?.map(a => (
                  <label key={a.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg border border-border bg-card text-xs">
                    <input type="checkbox" checked={form.almacenes?.includes(a.id) ?? false}
                      onChange={e => { const c = form.almacenes ?? []; set('almacenes', e.target.checked ? [...c, a.id] : c.filter(x => x !== a.id)); }} />
                    <span className="truncate">{a.nombre}</span>
                  </label>
                ))}
              </div>
            </div>
          </TabPanel>

          {/* ── Proveedores (solo después de guardar) ── */}
          <TabPanel id="proveedores" active={activeTab} locked={isNew} lockedMsg="Guarda el producto primero para asignar proveedores.">
            <div className="-mx-1 overflow-x-auto">
              <ProveedoresTab
                productoId={savedId}
                isNew={isNew}
                proveedores={proveedores ?? []}
                prodProveedores={prodProveedores ?? []}
                onSave={saveProvMut.mutateAsync}
                onDelete={deleteProvMut.mutateAsync}
                saving={saveProvMut.isPending}
                onCreateProveedor={async () => undefined}
              />
            </div>
          </TabPanel>

          {/* ── Kardex (solo después de guardar) ── */}
          <TabPanel id="kardex" active={activeTab} locked={isNew} lockedMsg="Guarda el producto primero para ver el kardex.">
            <div className="-mx-1 overflow-x-auto">
              <KardexTab productoId={savedId} isNew={isNew} />
            </div>
          </TabPanel>

          <div className="h-4" />
        </div>
      </DialogContent>
    </Dialog>
  );
}
