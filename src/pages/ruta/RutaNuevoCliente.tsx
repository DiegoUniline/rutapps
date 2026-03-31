import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Save, Crosshair, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useSaveCliente, useZonas, useCobradores } from '@/hooks/useClientes';
import { useAllListasPrecios } from '@/hooks/useData';
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
  const [showExtra, setShowExtra] = useState(false);
  const [saving, setSaving] = useState(false);

  const set = (key: keyof Cliente, value: any) => setForm(prev => ({ ...prev, [key]: value }));

  // Auto-assign vendedor
  useEffect(() => {
    if (vendedorIdParam) set('vendedor_id', vendedorIdParam);
    else if (profile?.vendedor_id) set('vendedor_id', profile.vendedor_id);
  }, [vendedorIdParam, profile?.vendedor_id]);

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

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background border-b border-border px-4 py-3 flex items-center gap-3"
        style={{ paddingTop: 'calc(0.75rem + env(safe-area-inset-top, 0px))' }}>
        <button onClick={() => navigate('/ruta')} className="h-9 w-9 rounded-lg bg-card border border-border flex items-center justify-center active:scale-90 transition-transform">
          <ArrowLeft className="h-4.5 w-4.5 text-foreground" />
        </button>
        <h1 className="text-lg font-bold text-foreground flex-1">Nuevo Cliente</h1>
        <button
          onClick={handleSave}
          disabled={saving}
          className="h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-semibold flex items-center gap-1.5 active:scale-95 transition-transform disabled:opacity-60"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Guardar
        </button>
      </div>

      {/* Form body */}
      <div className="flex-1 overflow-auto px-4 py-4 space-y-5 pb-32">

        {/* ── Información básica ── */}
        <section className="space-y-3">
          <h2 className="text-sm font-bold text-foreground border-b border-border pb-1">Información básica</h2>

          <MField label="Nombre" required>
            <input className={inputCls} placeholder="Nombre del cliente" value={form.nombre ?? ''} onChange={e => set('nombre', e.target.value)} autoFocus />
          </MField>

          <MField label="Código">
            <input className={cn(inputCls, "bg-card border border-border text-muted-foreground")} placeholder="Se asigna automáticamente" value={form.codigo ?? ''} readOnly />
          </MField>

          <div className="grid grid-cols-2 gap-3">
            <MField label="Teléfono">
              <input className={inputCls} type="tel" placeholder="5210dígitos" value={form.telefono ?? ''} onChange={e => {
                const digits = e.target.value.replace(/\D/g, '');
                if (digits.length === 10 && !digits.startsWith('52')) set('telefono', '52' + digits);
                else set('telefono', e.target.value);
              }} />
            </MField>
            <MField label="Contacto">
              <input className={inputCls} placeholder="Persona de contacto" value={form.contacto ?? ''} onChange={e => set('contacto', e.target.value)} />
            </MField>
          </div>

          <MField label="Email">
            <input className={inputCls} type="email" placeholder="email@ejemplo.com" value={form.email ?? ''} onChange={e => set('email', e.target.value)} />
          </MField>
        </section>

        {/* ── Dirección y GPS ── */}
        <section className="space-y-3">
          <h2 className="text-sm font-bold text-foreground border-b border-border pb-1">Dirección</h2>

          <MField label="Dirección">
            <input className={inputCls} placeholder="Calle y número" value={form.direccion ?? ''} onChange={e => set('direccion', e.target.value)} />
          </MField>

          <MField label="Colonia">
            <input className={inputCls} placeholder="Colonia" value={form.colonia ?? ''} onChange={e => set('colonia', e.target.value)} />
          </MField>

          <MField label="Ubicación GPS">
            <div className="flex gap-2">
              <input
                className={cn(inputCls, "flex-1")}
                placeholder="19.763610, -104.355636"
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
                className="h-11 px-3 rounded-lg bg-primary text-primary-foreground flex items-center gap-1.5 text-sm font-medium active:scale-95 transition-transform disabled:opacity-60 shrink-0"
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
        </section>

        {/* ── Visitas ── */}
        <section className="space-y-3">
          <h2 className="text-sm font-bold text-foreground border-b border-border pb-1">Visitas</h2>

          <MField label="Frecuencia" required>
            <select className={selectCls} value={form.frecuencia ?? 'semanal'} onChange={e => set('frecuencia', e.target.value as FrecuenciaVisita)}>
              {FRECUENCIAS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
          </MField>

          <MField label="Días de visita" required>
            <div className="flex flex-wrap gap-2">
              {DIAS.map(d => (
                <button
                  key={d}
                  type="button"
                  onClick={() => toggleDia(d)}
                  className={cn(
                    "px-3 py-2 rounded-lg text-xs font-semibold border transition-colors",
                    (form.dia_visita ?? []).includes(d)
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-muted text-muted-foreground border-border"
                  )}
                >
                  {d.slice(0, 3)}
                </button>
              ))}
            </div>
          </MField>
        </section>

        {/* ── Comercial ── */}
        <section className="space-y-3">
          <h2 className="text-sm font-bold text-foreground border-b border-border pb-1">Comercial</h2>

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

          <div className="flex items-center gap-3">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">¿Crédito?</label>
            <button
              type="button"
              onClick={() => set('credito', !form.credito)}
              className={cn(
                "h-8 w-14 rounded-full transition-colors relative",
                form.credito ? "bg-primary" : "bg-input"
              )}
            >
              <span className={cn(
                "absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-transform",
                form.credito ? "translate-x-7" : "translate-x-1"
              )} />
            </button>
          </div>

          {form.credito && (
            <div className="grid grid-cols-2 gap-3">
              <MField label="Límite crédito">
                <input className={inputCls} type="number" placeholder="0.00" value={form.limite_credito ?? 0} onChange={e => set('limite_credito', +e.target.value)} />
              </MField>
              <MField label="Días crédito">
                <input className={inputCls} type="number" placeholder="0" value={form.dias_credito ?? 0} onChange={e => set('dias_credito', +e.target.value)} />
              </MField>
            </div>
          )}
        </section>

        {/* ── Más opciones (collapsible) ── */}
        <button
          type="button"
          onClick={() => setShowExtra(!showExtra)}
          className="w-full flex items-center justify-between py-2 text-sm font-semibold text-primary"
        >
          Más opciones
          {showExtra ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>

        {showExtra && (
          <section className="space-y-3 animate-in slide-in-from-top-2 duration-200">
            <MField label="Notas">
              <textarea
                className="w-full min-h-[80px] px-3 py-2.5 rounded-lg border border-input bg-background text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
                placeholder="Notas internas..."
                value={form.notas ?? ''}
                onChange={e => set('notas', e.target.value)}
              />
            </MField>

            <MField label="Orden">
              <input className={inputCls} type="number" placeholder="0" value={form.orden ?? 0} onChange={e => set('orden', +e.target.value)} />
            </MField>
          </section>
        )}
      </div>
    </div>
  );
}
