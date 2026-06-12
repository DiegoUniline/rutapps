import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Save, Crosshair, Loader2, User, MapPin, Calendar, DollarSign, FileText, ChevronLeft, ChevronRight } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useSaveCliente, useZonas, useCobradores } from '@/hooks/useClientes';
import { useAllListasPrecios } from '@/hooks/useData';
import { usePermisos } from '@/hooks/usePermisos';
import MobileNoAccess from '@/components/ruta/MobileNoAccess';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { locationService } from '@/lib/locationService';
import type { Cliente, FrecuenciaVisita } from '@/types';

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

const FRECUENCIAS: { value: FrecuenciaVisita; label: string }[] = [
  { value: 'diaria', label: 'Diaria' },
  { value: 'semanal', label: 'Semanal' },
  { value: 'quincenal', label: 'Quincenal' },
  { value: 'mensual', label: 'Mensual' },
];

/* ── Reusable mobile field ── */
function MField({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        {label}{required && <span className="text-destructive ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

const inputCls = "w-full h-11 px-3 rounded-lg border border-input bg-background text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/40";
const selectCls = "w-full h-11 px-3 rounded-lg border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40";

export default function RutaNuevoCliente() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const vendedorIdParam = searchParams.get('vendedorId');
  const { profile, empresa } = useAuth();
  const { hasPermisoMovil } = usePermisos();
  const canCrear = hasPermisoMovil('ruta.cliente_crear');
  const canAsignarCredito = hasPermisoMovil('ruta.cliente_credito');
  const saveMutation = useSaveCliente();

  const { data: zonas } = useZonas();
  const { data: cobradores } = useCobradores();
  const { data: allListasPrecios } = useAllListasPrecios(empresa?.id);

  const [form, setForm] = useState<Partial<Cliente>>({
    codigo: '', nombre: '', contacto: '', telefono: '', email: '',
    direccion: '', colonia: '', frecuencia: 'semanal', dia_visita: [],
    credito: false, limite_credito: 0, dias_credito: 0, orden: 0, status: 'activo',
    notas: '',
  });
  const [capturingGps, setCapturingGps] = useState(false);
  
  const [saving, setSaving] = useState(false);

  const set = (key: keyof Cliente, value: any) => setForm(prev => ({ ...prev, [key]: value }));

  // Auto-assign vendedor
  useEffect(() => {
    if (vendedorIdParam) set('vendedor_id', vendedorIdParam);
    else if (profile?.id) set('vendedor_id', profile.id);
  }, [vendedorIdParam, profile?.id]);

  // Auto-assign default lista de precios
  useEffect(() => {
    if (allListasPrecios && allListasPrecios.length > 0 && !(form as any).lista_precio_id) {
      const principal = allListasPrecios.find(l => l.es_principal) ?? allListasPrecios[0];
      if (principal) {
        setForm(prev => ({ ...prev, lista_precio_id: principal.id, tarifa_id: principal.tarifa_id }));
      }
    }
  }, [allListasPrecios]);

  const toggleDia = (dia: string) => {
    const current = form.dia_visita ?? [];
    set('dia_visita', current.includes(dia) ? current.filter(d => d !== dia) : [...current, dia]);
  };

  const captureGps = () => {
    const loc = locationService.getLastKnownLocation();
    if (loc) {
      setForm(prev => ({ ...prev, gps_lat: loc.lat, gps_lng: loc.lng }));
      toast.success('Ubicación GPS capturada');
    } else {
      toast.error('Aún no se tiene ubicación GPS. Espera unos segundos e intenta de nuevo.');
    }
  };

  const handleSave = async () => {
    if (!form.nombre?.trim()) { toast.error('Nombre es obligatorio'); return; }
    if (!(form as any).lista_precio_id) { toast.error('Lista de precios es obligatoria'); return; }
    if (!form.frecuencia) { toast.error('Frecuencia de visita es obligatoria'); return; }
    if (!form.dia_visita || form.dia_visita.length === 0) { toast.error('Selecciona al menos un día de visita'); return; }

    setSaving(true);
    try {
      await saveMutation.mutateAsync(form);
      toast.success('Cliente creado');
      navigate('/ruta', { replace: true });
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (!canCrear) {
    return <MobileNoAccess titulo="Sin permiso" mensaje="Tu rol no permite crear clientes desde la ruta." />;
  }

  const TABS = [
    { id: 'basico', label: 'Básico', icon: User },
    { id: 'direccion', label: 'Dirección', icon: MapPin },
    { id: 'visitas', label: 'Visitas', icon: Calendar },
    { id: 'comercial', label: 'Comercial', icon: DollarSign },
    { id: 'extra', label: 'Extra', icon: FileText },
  ] as const;
  const [tab, setTab] = useState<typeof TABS[number]['id']>('basico');
  const tabIndex = TABS.findIndex(t => t.id === tab);
  const goPrev = () => tabIndex > 0 && setTab(TABS[tabIndex - 1].id);
  const goNext = () => tabIndex < TABS.length - 1 && setTab(TABS[tabIndex + 1].id);
  const isLast = tabIndex === TABS.length - 1;

  return (
    <div className="flex flex-col h-full bg-muted/30">
      {/* Header simple */}
      <div className="sticky top-0 z-10 bg-background border-b border-border px-3 py-2.5 flex items-center gap-2"
        style={{ paddingTop: 'calc(0.625rem + env(safe-area-inset-top, 0px))' }}>
        <button onClick={() => navigate('/ruta')} className="h-9 w-9 rounded-lg hover:bg-accent flex items-center justify-center active:scale-90 transition-transform">
          <ArrowLeft className="h-5 w-5 text-foreground" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-bold text-foreground leading-tight truncate">Nuevo Cliente</h1>
          <p className="text-[11px] text-muted-foreground">Paso {tabIndex + 1} de {TABS.length} · {TABS[tabIndex].label}</p>
        </div>
      </div>

      {/* Tabs scrollables */}
      <div className="bg-background border-b border-border">
        <div className="flex overflow-x-auto no-scrollbar px-2 gap-1">
          {TABS.map((t, i) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 px-3 py-2 min-w-[68px] border-b-2 transition-colors shrink-0",
                  active ? "border-primary text-primary" : "border-transparent text-muted-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
                <span className="text-[10.5px] font-semibold">{t.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Form body */}
      <div className="flex-1 overflow-auto px-3 py-3 pb-28">

        {tab === 'basico' && (
          <div className="bg-card rounded-2xl border border-border/60 shadow-sm p-4 space-y-3">
            <MField label="Nombre" required>
              <input className={inputCls} placeholder="Nombre del cliente" value={form.nombre ?? ''} onChange={e => set('nombre', e.target.value)} autoFocus />
            </MField>

            <div className="grid grid-cols-2 gap-3">
              <MField label="Teléfono">
                <input className={inputCls} type="tel" inputMode="numeric" placeholder="10 dígitos" value={form.telefono ?? ''} onChange={e => {
                  const digits = e.target.value.replace(/\D/g, '');
                  if (digits.length === 10 && !digits.startsWith('52')) set('telefono', '52' + digits);
                  else set('telefono', e.target.value);
                }} />
              </MField>
              <MField label="Contacto">
                <input className={inputCls} placeholder="Persona" value={form.contacto ?? ''} onChange={e => set('contacto', e.target.value)} />
              </MField>
            </div>

            <MField label="Email">
              <input className={inputCls} type="email" placeholder="email@ejemplo.com" value={form.email ?? ''} onChange={e => set('email', e.target.value)} />
            </MField>
          </div>
        )}

        {tab === 'direccion' && (
          <div className="bg-card rounded-2xl border border-border/60 shadow-sm p-4 space-y-3">
            <MField label="Calle y número">
              <input className={inputCls} placeholder="Calle y número" value={form.direccion ?? ''} onChange={e => set('direccion', e.target.value)} />
            </MField>

            <MField label="Colonia">
              <input className={inputCls} placeholder="Colonia" value={form.colonia ?? ''} onChange={e => set('colonia', e.target.value)} />
            </MField>

            <MField label="Ubicación GPS">
              <div className="flex gap-2">
                <input
                  className={cn(inputCls, "flex-1")}
                  placeholder="lat, lng"
                  value={form.gps_lat && form.gps_lng ? `${form.gps_lat}, ${form.gps_lng}` : ''}
                  onChange={e => {
                    const parts = e.target.value.split(',').map(s => s.trim());
                    if (parts.length === 2) {
                      const lat = parseFloat(parts[0]); const lng = parseFloat(parts[1]);
                      if (!isNaN(lat) && !isNaN(lng)) { setForm(prev => ({ ...prev, gps_lat: lat, gps_lng: lng })); return; }
                    }
                    if (e.target.value === '') setForm(prev => ({ ...prev, gps_lat: undefined, gps_lng: undefined }));
                  }}
                />
                <button
                  onClick={captureGps}
                  disabled={capturingGps}
                  className="h-11 px-3 rounded-lg bg-primary text-primary-foreground flex items-center gap-1.5 text-sm font-semibold active:scale-95 transition-transform disabled:opacity-60 shrink-0"
                >
                  {capturingGps ? <Loader2 className="h-4 w-4 animate-spin" /> : <Crosshair className="h-4 w-4" />}
                  GPS
                </button>
              </div>
            </MField>

            <MField label="Zona">
              <select className={selectCls} value={form.zona_id ?? ''} onChange={e => set('zona_id', e.target.value || null)}>
                <option value="">— Sin zona —</option>
                {zonas?.map(z => <option key={z.id} value={z.id}>{z.nombre}</option>)}
              </select>
            </MField>
          </div>
        )}

        {tab === 'visitas' && (
          <div className="bg-card rounded-2xl border border-border/60 shadow-sm p-4 space-y-3">
            <MField label="Frecuencia" required>
              <select className={selectCls} value={form.frecuencia ?? 'semanal'} onChange={e => set('frecuencia', e.target.value as FrecuenciaVisita)}>
                {FRECUENCIAS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            </MField>

            <MField label="Días de visita" required>
              <div className="grid grid-cols-7 gap-1.5">
                {DIAS.map(d => {
                  const active = (form.dia_visita ?? []).includes(d);
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => toggleDia(d)}
                      className={cn(
                        "h-10 rounded-lg text-[11px] font-bold border transition-all active:scale-95",
                        active
                          ? "bg-primary text-primary-foreground border-primary shadow-sm"
                          : "bg-background text-muted-foreground border-border"
                      )}
                    >
                      {d.slice(0, 1)}
                    </button>
                  );
                })}
              </div>
            </MField>
          </div>
        )}

        {tab === 'comercial' && (
          <div className="bg-card rounded-2xl border border-border/60 shadow-sm p-4 space-y-3">
            <MField label="Lista de precios" required>
              <select className={selectCls} value={(form as any).lista_precio_id ?? ''} onChange={e => {
                const v = e.target.value;
                setForm(prev => ({ ...prev, lista_precio_id: v || null }));
                const lista = allListasPrecios?.find(l => l.id === v);
                set('tarifa_id', lista?.tarifa_id || null);
              }}>
                <option value="">— Seleccionar —</option>
                {allListasPrecios?.filter(l => l.activa).map(l => (
                  <option key={l.id} value={l.id}>{l.nombre}{l.es_principal ? ' ★' : ''}</option>
                ))}
              </select>
            </MField>

            <MField label="Cobrador">
              <select className={selectCls} value={form.cobrador_id ?? ''} onChange={e => set('cobrador_id', e.target.value || null)}>
                <option value="">— Sin cobrador —</option>
                {cobradores?.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </MField>

            {canAsignarCredito && (
              <div className="pt-1 space-y-3">
                <button
                  type="button"
                  onClick={() => set('credito', !form.credito)}
                  className={cn(
                    "w-full flex items-center gap-3 p-3 rounded-xl border transition-colors active:scale-[0.99]",
                    form.credito ? "bg-primary/5 border-primary/40" : "bg-background border-border"
                  )}
                >
                  <div className={cn(
                    "h-7 w-12 rounded-full transition-colors relative shrink-0",
                    form.credito ? "bg-primary" : "bg-input"
                  )}>
                    <span className={cn(
                      "absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-transform",
                      form.credito ? "translate-x-6" : "translate-x-1"
                    )} />
                  </div>
                  <div className="flex-1 text-left">
                    <div className="text-sm font-semibold text-foreground">Vender a crédito</div>
                    <div className="text-[11px] text-muted-foreground">Permite ventas con saldo pendiente</div>
                  </div>
                </button>

                {form.credito && (
                  <div className="grid grid-cols-2 gap-3 animate-in fade-in slide-in-from-top-1 duration-200">
                    <MField label="Límite ($)">
                      <input className={inputCls} type="number" inputMode="decimal" placeholder="0.00" value={form.limite_credito ?? 0} onChange={e => set('limite_credito', +e.target.value)} />
                    </MField>
                    <MField label="Días">
                      <input className={inputCls} type="number" inputMode="numeric" placeholder="0" value={form.dias_credito ?? 0} onChange={e => set('dias_credito', +e.target.value)} />
                    </MField>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {tab === 'extra' && (
          <div className="bg-card rounded-2xl border border-border/60 shadow-sm p-4 space-y-3">
            <MField label="Notas">
              <textarea
                className="w-full min-h-[100px] px-3 py-2.5 rounded-lg border border-input bg-background text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
                placeholder="Notas internas..."
                value={form.notas ?? ''}
                onChange={e => set('notas', e.target.value)}
              />
            </MField>

            <MField label="Orden de visita">
              <input className={inputCls} type="number" inputMode="numeric" placeholder="0" value={form.orden ?? 0} onChange={e => set('orden', +e.target.value)} />
            </MField>
          </div>
        )}
      </div>

      {/* Sticky bottom bar: prev / next or save */}
      <div
        className="sticky bottom-0 z-10 bg-background/95 backdrop-blur border-t border-border px-3 py-3 flex items-center gap-2"
        style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}
      >
        <button
          onClick={goPrev}
          disabled={tabIndex === 0}
          className="h-12 px-4 rounded-xl border border-border bg-background text-foreground text-sm font-semibold flex items-center gap-1 active:scale-95 transition-transform disabled:opacity-40"
        >
          <ChevronLeft className="h-5 w-5" />
          Atrás
        </button>
        {isLast ? (
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 h-12 rounded-xl bg-primary text-primary-foreground text-base font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-60 shadow-md"
          >
            {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
            {saving ? 'Guardando...' : 'Guardar Cliente'}
          </button>
        ) : (
          <button
            onClick={goNext}
            className="flex-1 h-12 rounded-xl bg-primary text-primary-foreground text-base font-bold flex items-center justify-center gap-1 active:scale-[0.98] transition-transform shadow-md"
          >
            Siguiente
            <ChevronRight className="h-5 w-5" />
          </button>
        )}
      </div>
    </div>
  );
}
