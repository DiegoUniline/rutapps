import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Edit2, Save, Trash2, Loader2, Phone, MapPin, Mail,
  User, Calendar, DollarSign, FileText, Crosshair, Navigation, X,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { usePermisos } from '@/hooks/usePermisos';
import { useCliente, useSaveCliente, useDeleteCliente, useZonas, useCobradores } from '@/hooks/useClientes';
import { useAllListasPrecios } from '@/hooks/useData';
import { useDataVisibility } from '@/hooks/useDataVisibility';
import MobileNoAccess from '@/components/ruta/MobileNoAccess';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { locationService } from '@/lib/locationService';
import { confirmDialog } from '@/lib/confirm';
import type { Cliente, FrecuenciaVisita } from '@/types';

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const FRECUENCIAS: { value: FrecuenciaVisita; label: string }[] = [
  { value: 'diaria', label: 'Diaria' },
  { value: 'semanal', label: 'Semanal' },
  { value: 'quincenal', label: 'Quincenal' },
  { value: 'mensual', label: 'Mensual' },
];

const inputCls = "w-full h-11 px-3 rounded-lg border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40";
const selectCls = inputCls;

function Field({ label, value, icon: Icon, action }: { label: string; value?: React.ReactNode; icon?: any; action?: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-border/60 last:border-0">
      {Icon && <Icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />}
      <div className="flex-1 min-w-0">
        <div className="text-[10.5px] font-semibold text-muted-foreground uppercase tracking-wide">{label}</div>
        <div className="text-sm text-foreground break-words">{value || <span className="text-muted-foreground/60">—</span>}</div>
      </div>
      {action}
    </div>
  );
}

export default function RutaClienteDetalle() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile, empresa } = useAuth();
  const { hasPermisoMovil } = usePermisos();
  const { clientesVisibilidad } = useDataVisibility('clientes');

  const canEditar = hasPermisoMovil('ruta.cliente_editar');
  const canEliminar = hasPermisoMovil('ruta.cliente_eliminar');
  const canCredito = hasPermisoMovil('ruta.cliente_credito');

  const { data: cliente, isLoading } = useCliente(id);
  const { data: zonas } = useZonas();
  const { data: cobradores } = useCobradores();
  const { data: listas } = useAllListasPrecios();
  const saveMut = useSaveCliente();
  const deleteMut = useDeleteCliente();

  const [editMode, setEditMode] = useState(false);
  const [form, setForm] = useState<Partial<Cliente>>({});

  useEffect(() => { if (cliente) setForm(cliente as any); }, [cliente]);

  const set = (k: keyof Cliente, v: any) => setForm(prev => ({ ...prev, [k]: v }));

  const isMyClient = useMemo(() => {
    if (clientesVisibilidad !== 'propios') return true;
    return (cliente as any)?.vendedor_id === profile?.id;
  }, [cliente, clientesVisibilidad, profile?.id]);

  const zonaNombre = (zonas ?? []).find(z => z.id === (cliente as any)?.zona_id)?.nombre;
  const cobradorNombre = (cobradores ?? []).find(c => c.id === (cliente as any)?.cobrador_id)?.nombre;
  const listaNombre = (listas ?? []).find(l => l.id === (cliente as any)?.lista_precio_id)?.nombre;

  if (isLoading) return <div className="p-8 text-center text-muted-foreground text-sm">Cargando...</div>;
  if (!cliente) return <MobileNoAccess titulo="No encontrado" mensaje="Cliente no encontrado." />;
  if (!isMyClient) return <MobileNoAccess titulo="Sin permiso" mensaje="Solo puedes ver tus propios clientes." />;

  const handleSave = async () => {
    if (!canEditar) return;
    if (!form.nombre?.trim()) { toast.error('Nombre es obligatorio'); return; }
    try {
      await saveMut.mutateAsync({ ...form, id: cliente.id });
      toast.success('Cliente actualizado');
      setEditMode(false);
    } catch (e: any) { toast.error(e.message || 'Error al guardar'); }
  };

  const handleDelete = async () => {
    if (!canEliminar) return;
    const ok = await confirmDialog(`¿Eliminar al cliente "${cliente.nombre}"?\n\nQuedará marcado como inactivo. Sus ventas y cobros se conservan.`);
    if (!ok) return;
    try {
      await deleteMut.mutateAsync(cliente.id);
      toast.success('Cliente eliminado');
      navigate('/ruta', { replace: true });
    } catch (e: any) { toast.error(e.message || 'Error al eliminar'); }
  };

  const captureGps = () => {
    const loc = locationService.getLastKnownLocation();
    if (!loc) { toast.error('Aún no se tiene ubicación GPS.'); return; }
    setForm(prev => ({ ...prev, gps_lat: loc.lat, gps_lng: loc.lng }));
    toast.success('GPS capturado');
  };

  const toggleDia = (d: string) => {
    const cur = (form.dia_visita ?? []) as string[];
    set('dia_visita', cur.includes(d) ? cur.filter(x => x !== d) : [...cur, d]);
  };

  return (
    <div className="flex flex-col h-full bg-muted/30">
      <div className="sticky top-0 z-10 bg-background border-b border-border px-3 py-2.5 flex items-center gap-2"
        style={{ paddingTop: 'calc(0.625rem + env(safe-area-inset-top, 0px))' }}>
        <button onClick={() => navigate(-1)} className="h-9 w-9 rounded-lg hover:bg-accent flex items-center justify-center active:scale-90">
          <ArrowLeft className="h-5 w-5 text-foreground" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-bold text-foreground truncate">{cliente.nombre}</h1>
          <p className="text-[11px] text-muted-foreground truncate">
            {cliente.codigo ? `${cliente.codigo} · ` : ''}{editMode ? 'Editando' : 'Información del cliente'}
          </p>
        </div>
        {!editMode && canEditar && (
          <button onClick={() => setEditMode(true)} className="h-9 px-3 rounded-lg bg-primary/10 text-primary text-xs font-semibold flex items-center gap-1 active:scale-95">
            <Edit2 className="h-3.5 w-3.5" /> Editar
          </button>
        )}
        {editMode && (
          <button onClick={() => { setForm(cliente as any); setEditMode(false); }} className="h-9 w-9 rounded-lg hover:bg-accent flex items-center justify-center">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-auto px-3 py-3 pb-28 space-y-3">
        {!editMode ? (
          <>
            <div className="bg-card rounded-2xl border border-border/60 shadow-sm px-4">
              <Field label="Contacto" icon={User} value={cliente.contacto} />
              <Field
                label="Teléfono" icon={Phone} value={cliente.telefono}
                action={cliente.telefono ? (
                  <a href={`tel:${cliente.telefono}`} className="h-8 px-2 rounded-md bg-emerald-500/10 text-emerald-600 text-xs font-semibold flex items-center gap-1">
                    <Phone className="h-3 w-3" /> Llamar
                  </a>
                ) : undefined}
              />
              <Field label="Email" icon={Mail} value={cliente.email} />
              <Field
                label="Dirección" icon={MapPin}
                value={[cliente.direccion, cliente.colonia].filter(Boolean).join(', ')}
              />
              <Field label="Zona" icon={MapPin} value={zonaNombre} />
              <Field
                label="Ubicación GPS" icon={Navigation}
                value={cliente.gps_lat && cliente.gps_lng ? `${cliente.gps_lat.toFixed(5)}, ${cliente.gps_lng.toFixed(5)}` : null}
                action={cliente.gps_lat && cliente.gps_lng ? (
                  <button
                    onClick={() => window.open(`https://www.google.com/maps/dir/?api=1&destination=${cliente.gps_lat},${cliente.gps_lng}`, '_blank')}
                    className="h-8 px-2 rounded-md bg-brand-orange/15 text-brand-orange text-xs font-semibold flex items-center gap-1"
                  >
                    <Navigation className="h-3 w-3" /> Ir
                  </button>
                ) : undefined}
              />
            </div>

            <div className="bg-card rounded-2xl border border-border/60 shadow-sm px-4">
              <Field label="Frecuencia" icon={Calendar} value={cliente.frecuencia} />
              <Field
                label="Días de visita" icon={Calendar}
                value={(cliente.dia_visita ?? []).length > 0
                  ? (cliente.dia_visita ?? []).map((d: string) => (
                      <span key={d} className="inline-block mr-1 mb-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10.5px] font-semibold capitalize">{d}</span>
                    ))
                  : null}
              />
            </div>

            <div className="bg-card rounded-2xl border border-border/60 shadow-sm px-4">
              <Field label="Lista de precios" icon={DollarSign} value={listaNombre} />
              <Field label="Cobrador" icon={User} value={cobradorNombre} />
              <Field
                label="Vende a crédito" icon={DollarSign}
                value={cliente.credito
                  ? `Sí — Límite $${(cliente.limite_credito ?? 0).toLocaleString('es-MX')} · ${cliente.dias_credito ?? 0} días`
                  : 'No'}
              />
              <Field
                label="Saldo actual" icon={DollarSign}
                value={typeof (cliente as any).saldo === 'number'
                  ? `$${((cliente as any).saldo).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`
                  : null}
              />
            </div>

            {cliente.notas && (
              <div className="bg-card rounded-2xl border border-border/60 shadow-sm px-4">
                <Field label="Notas" icon={FileText} value={cliente.notas} />
              </div>
            )}

            <div className="bg-card rounded-2xl border border-border/60 shadow-sm p-3 text-[11px] text-muted-foreground">
              <div className="flex items-center justify-between">
                <span>Estado: <b className={cliente.status === 'activo' ? 'text-emerald-600' : 'text-destructive'}>{cliente.status}</b></span>
                {!canEditar && <span>Solo lectura</span>}
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="bg-card rounded-2xl border border-border/60 shadow-sm p-4 space-y-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase">Nombre *</label>
                <input className={inputCls} value={form.nombre ?? ''} onChange={e => set('nombre', e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase">Teléfono</label>
                  <input className={inputCls} type="tel" inputMode="numeric" value={form.telefono ?? ''} onChange={e => set('telefono', e.target.value)} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase">Contacto</label>
                  <input className={inputCls} value={form.contacto ?? ''} onChange={e => set('contacto', e.target.value)} />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase">Email</label>
                <input className={inputCls} type="email" value={form.email ?? ''} onChange={e => set('email', e.target.value)} />
              </div>
            </div>

            <div className="bg-card rounded-2xl border border-border/60 shadow-sm p-4 space-y-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase">Dirección</label>
                <input className={inputCls} value={form.direccion ?? ''} onChange={e => set('direccion', e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase">Colonia</label>
                <input className={inputCls} value={form.colonia ?? ''} onChange={e => set('colonia', e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase">Zona</label>
                <select className={selectCls} value={form.zona_id ?? ''} onChange={e => set('zona_id', e.target.value || null)}>
                  <option value="">— Sin zona —</option>
                  {zonas?.map(z => <option key={z.id} value={z.id}>{z.nombre}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase">Ubicación GPS</label>
                <div className="flex gap-2">
                  <input
                    className={cn(inputCls, 'flex-1')}
                    value={form.gps_lat && form.gps_lng ? `${form.gps_lat}, ${form.gps_lng}` : ''}
                    onChange={e => {
                      const p = e.target.value.split(',').map(s => s.trim());
                      if (p.length === 2) {
                        const lat = parseFloat(p[0]), lng = parseFloat(p[1]);
                        if (!isNaN(lat) && !isNaN(lng)) { setForm(prev => ({ ...prev, gps_lat: lat, gps_lng: lng })); return; }
                      }
                      if (!e.target.value) setForm(prev => ({ ...prev, gps_lat: undefined, gps_lng: undefined }));
                    }}
                  />
                  <button onClick={captureGps} className="h-11 px-3 rounded-lg bg-primary text-primary-foreground text-sm font-semibold flex items-center gap-1 active:scale-95">
                    <Crosshair className="h-4 w-4" /> GPS
                  </button>
                </div>
              </div>
            </div>

            <div className="bg-card rounded-2xl border border-border/60 shadow-sm p-4 space-y-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase">Frecuencia</label>
                <select className={selectCls} value={form.frecuencia ?? 'semanal'} onChange={e => set('frecuencia', e.target.value as FrecuenciaVisita)}>
                  {FRECUENCIAS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase">Días de visita</label>
                <div className="grid grid-cols-7 gap-1.5 mt-1">
                  {DIAS.map(d => {
                    const active = (form.dia_visita ?? []).includes(d);
                    return (
                      <button key={d} type="button" onClick={() => toggleDia(d)}
                        className={cn("h-10 rounded-lg text-[11px] font-bold border active:scale-95",
                          active ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground border-border")}>
                        {d.slice(0, 1)}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="bg-card rounded-2xl border border-border/60 shadow-sm p-4 space-y-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase">Lista de precios</label>
                <select className={selectCls} value={(form as any).lista_precio_id ?? ''} onChange={e => {
                  const v = e.target.value;
                  const lista = listas?.find(l => l.id === v);
                  setForm(prev => ({ ...prev, lista_precio_id: v || null, tarifa_id: lista?.tarifa_id || null } as any));
                }}>
                  <option value="">— Seleccionar —</option>
                  {listas?.filter(l => l.activa).map(l => <option key={l.id} value={l.id}>{l.nombre}{l.es_principal ? ' ★' : ''}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase">Cobrador</label>
                <select className={selectCls} value={form.cobrador_id ?? ''} onChange={e => set('cobrador_id', e.target.value || null)}>
                  <option value="">— Sin cobrador —</option>
                  {cobradores?.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </div>
              {canCredito && (
                <>
                  <button type="button" onClick={() => set('credito', !form.credito)}
                    className={cn("w-full flex items-center gap-3 p-3 rounded-xl border",
                      form.credito ? "bg-primary/5 border-primary/40" : "bg-background border-border")}>
                    <div className={cn("h-6 w-11 rounded-full relative shrink-0 border",
                      form.credito ? "bg-primary border-primary" : "bg-muted border-border")}>
                      <span className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform",
                        form.credito ? "translate-x-[22px]" : "translate-x-0.5")} />
                    </div>
                    <div className="flex-1 text-left text-sm font-semibold">Vende a crédito</div>
                  </button>
                  {form.credito && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-semibold text-muted-foreground uppercase">Límite ($)</label>
                        <input className={inputCls} type="number" inputMode="decimal" value={form.limite_credito ?? 0} onChange={e => set('limite_credito', +e.target.value)} />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-muted-foreground uppercase">Días</label>
                        <input className={inputCls} type="number" inputMode="numeric" value={form.dias_credito ?? 0} onChange={e => set('dias_credito', +e.target.value)} />
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="bg-card rounded-2xl border border-border/60 shadow-sm p-4">
              <label className="text-xs font-semibold text-muted-foreground uppercase">Notas</label>
              <textarea className="w-full min-h-[80px] mt-1 px-3 py-2 rounded-lg border border-input bg-background text-sm resize-none"
                value={form.notas ?? ''} onChange={e => set('notas', e.target.value)} />
            </div>
          </>
        )}
      </div>

      <div className="sticky bottom-0 z-10 bg-background/95 backdrop-blur border-t border-border px-3 py-3 flex items-center gap-2"
        style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}>
        {editMode ? (
          <button onClick={handleSave} disabled={saveMut.isPending}
            className="flex-1 h-12 rounded-xl bg-primary text-primary-foreground text-base font-bold flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-60 shadow-md">
            {saveMut.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
            {saveMut.isPending ? 'Guardando...' : 'Guardar cambios'}
          </button>
        ) : (
          <>
            <button onClick={() => navigate(`/ruta/ventas/nueva?clienteId=${cliente.id}`)}
              className="flex-1 h-12 rounded-xl bg-primary text-primary-foreground text-sm font-bold flex items-center justify-center gap-2 active:scale-95 shadow-md">
              Nueva venta
            </button>
            {canEliminar && (
              <button onClick={handleDelete} disabled={deleteMut.isPending}
                className="h-12 px-4 rounded-xl bg-destructive/10 text-destructive text-sm font-semibold flex items-center gap-1.5 active:scale-95 disabled:opacity-60">
                {deleteMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Eliminar
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
