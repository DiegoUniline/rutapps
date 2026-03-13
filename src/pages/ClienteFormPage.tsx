import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Save, Trash2, Star, Camera } from 'lucide-react';
import { OdooStatusbar } from '@/components/OdooStatusbar';
import { OdooTabs } from '@/components/OdooTabs';
import { OdooField, OdooSection } from '@/components/OdooFormField';
import { useCliente, useSaveCliente, useDeleteCliente, useZonas, useVendedores, useCobradores } from '@/hooks/useClientes';
import { useListas, useTarifasForSelect } from '@/hooks/useData';
import { toast } from 'sonner';
import type { Cliente, StatusCliente, FrecuenciaVisita } from '@/types';

const defaultCliente: Partial<Cliente> = {
  codigo: '', nombre: '', contacto: '', telefono: '', email: '', direccion: '',
  rfc: '', notas: '', colonia: '', frecuencia: 'semanal', dia_visita: [],
  credito: false, limite_credito: 0, dias_credito: 0, orden: 0, status: 'activo',
};

const statusSteps = [
  { key: 'activo', label: 'Activo' },
  { key: 'inactivo', label: 'Inactivo' },
  { key: 'suspendido', label: 'Suspendido' },
];

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

export default function ClienteFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = id === 'nuevo';
  const { data: existing } = useCliente(isNew ? undefined : id);
  const saveMutation = useSaveCliente();
  const deleteMutation = useDeleteCliente();

  const { data: zonas } = useZonas();
  const { data: vendedores } = useVendedores();
  const { data: cobradores } = useCobradores();
  const { data: listas } = useListas();
  const { data: tarifas } = useTarifasForSelect();

  const [form, setForm] = useState<Partial<Cliente>>(defaultCliente);
  const [originalForm, setOriginalForm] = useState<Partial<Cliente>>(defaultCliente);
  const [starred, setStarred] = useState(false);

  useEffect(() => {
    if (existing) { setForm(existing); setOriginalForm(existing); }
  }, [existing]);

  const isDirty = isNew || JSON.stringify(form) !== JSON.stringify(originalForm);

  const set = (key: keyof Cliente, value: any) => setForm(prev => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    if (!form.nombre) { toast.error('Nombre es obligatorio'); return; }
    try {
      const result = await saveMutation.mutateAsync(isNew ? form : { ...form, id });
      toast.success('Cliente guardado');
      setOriginalForm({ ...form });
      if (isNew && result?.id) navigate(`/clientes/${result.id}`, { replace: true });
    } catch (err: any) { toast.error(err.message); }
  };

  const handleDelete = async () => {
    if (!id || isNew) return;
    if (!confirm('¿Eliminar este cliente?')) return;
    try {
      await deleteMutation.mutateAsync(id);
      toast.success('Cliente eliminado');
      navigate('/clientes');
    } catch (err: any) { toast.error(err.message); }
  };

  const findName = (list: { id: string; nombre: string }[] | undefined, id: string | undefined) =>
    list?.find(i => i.id === id)?.nombre ?? '';

  const toggleDia = (dia: string) => {
    const current = form.dia_visita ?? [];
    set('dia_visita', current.includes(dia) ? current.filter(d => d !== dia) : [...current, dia]);
  };

  const frecuenciaOpts = [
    { value: 'diaria', label: 'Diaria' },
    { value: 'semanal', label: 'Semanal' },
    { value: 'quincenal', label: 'Quincenal' },
    { value: 'mensual', label: 'Mensual' },
  ];

  return (
    <div className="p-4 bg-secondary/50 min-h-full">
      <div className="mb-0.5">
        <Link to="/clientes" className="text-[12px] text-muted-foreground hover:text-foreground transition-colors">Clientes</Link>
      </div>

      {/* Title + Photos */}
      <div className="flex items-start gap-4 mb-2">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <button onClick={() => setStarred(!starred)} className="text-warning hover:scale-110 transition-transform">
              <Star className={`h-5 w-5 ${starred ? 'fill-warning' : ''}`} />
            </button>
            <h1 className="text-[22px] font-bold text-foreground leading-tight">
              {isNew ? 'Nuevo Cliente' : form.nombre || 'Cliente'}
            </h1>
          </div>
        </div>
        <div className="hidden sm:flex gap-2 shrink-0">
          {form.foto_url ? (
            <img src={form.foto_url} alt="" className="w-[80px] h-[80px] rounded object-cover border border-border" />
          ) : (
            <div className="w-[80px] h-[80px] rounded border-2 border-dashed border-border flex flex-col items-center justify-center">
              <Camera className="h-5 w-5 text-muted-foreground/40" />
              <span className="text-[9px] text-muted-foreground">Foto</span>
            </div>
          )}
          {form.foto_fachada_url ? (
            <img src={form.foto_fachada_url} alt="" className="w-[80px] h-[80px] rounded object-cover border border-border" />
          ) : (
            <div className="w-[80px] h-[80px] rounded border-2 border-dashed border-border flex flex-col items-center justify-center">
              <Camera className="h-5 w-5 text-muted-foreground/40" />
              <span className="text-[9px] text-muted-foreground">Fachada</span>
            </div>
          )}
        </div>
      </div>

      {/* Action buttons + statusbar */}
      <div className="flex items-center gap-2 mb-3">
        <button onClick={handleSave} disabled={saveMutation.isPending || !isDirty} className={isDirty ? "btn-odoo-primary" : "btn-odoo-secondary opacity-60 cursor-not-allowed"}>
          <Save className="h-3.5 w-3.5" /> Guardar
        </button>
        {!isNew && (
          <button onClick={handleDelete} className="btn-odoo-secondary text-destructive">
            <Trash2 className="h-3.5 w-3.5" /> Eliminar
          </button>
        )}
        <div className="flex-1" />
        <OdooStatusbar
          steps={statusSteps}
          current={form.status ?? 'activo'}
          onStepClick={val => set('status', val as StatusCliente)}
        />
      </div>

      {/* Tabs */}
      <div className="bg-card border border-border rounded-b p-0">
      <OdooTabs tabs={[
        {
          key: 'general', label: 'Información General',
          content: (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-10 gap-y-1">
              <div className="space-y-1">
                <OdooField label="Código" value={form.codigo} onChange={v => set('codigo', v)} placeholder="Ej. CLI-001" alwaysEdit={isNew} />
                <OdooField label="Nombre" value={form.nombre} onChange={v => set('nombre', v)} placeholder="Nombre del cliente" alwaysEdit={isNew} />
                <OdooField label="Persona de Contacto" value={form.contacto} onChange={v => set('contacto', v)} />
                <OdooField label="Teléfono" value={form.telefono} onChange={v => set('telefono', v)} />
                <OdooField label="Email" value={form.email} onChange={v => set('email', v)} />
                <OdooField label="RFC" value={form.rfc} onChange={v => set('rfc', v)} />
              </div>
              <div className="space-y-1">
                <OdooField label="Dirección" value={form.direccion} onChange={v => set('direccion', v)} />
                <OdooField label="Colonia" value={form.colonia} onChange={v => set('colonia', v)} />
                <OdooField label="GPS Lat" value={form.gps_lat} onChange={v => set('gps_lat', v ? +v : null)} type="number" />
                <OdooField label="GPS Lng" value={form.gps_lng} onChange={v => set('gps_lng', v ? +v : null)} type="number" />
                <OdooField label="Zona" value={form.zona_id} onChange={v => set('zona_id', v || null)} type="select"
                  options={zonas?.map(z => ({ value: z.id, label: z.nombre })) ?? []} />
                <OdooField label="Orden" value={form.orden} onChange={v => set('orden', +v)} type="number" />
                <OdooField label="Fecha de Alta" value={form.fecha_alta} onChange={v => set('fecha_alta', v)} readOnly />
              </div>
            </div>
          ),
        },
        {
          key: 'comercial', label: 'Comercial',
          content: (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-10 gap-y-1">
              <div className="space-y-1">
                <OdooSection title="Precios">
                  <OdooField label="Lista de Precios" value={form.lista_id} onChange={v => set('lista_id', v || null)} type="select"
                    options={listas?.map(l => ({ value: l.id, label: l.nombre })) ?? []} />
                  <OdooField label="Tarifa Principal" value={form.tarifa_id} onChange={v => set('tarifa_id', v || null)} type="select"
                    options={tarifas?.map(t => ({ value: t.id, label: t.nombre })) ?? []} />
                </OdooSection>
                <OdooSection title="Visitas">
                  <OdooField label="Frecuencia" value={form.frecuencia} onChange={v => set('frecuencia', v as FrecuenciaVisita)} type="select"
                    options={frecuenciaOpts} />
                  <div className="odoo-field-row">
                    <span className="odoo-field-label">Días de visita</span>
                    <div className="flex flex-wrap gap-1">
                      {DIAS.map(d => (
                        <button key={d} onClick={() => toggleDia(d)}
                          className={`px-2 py-0.5 text-[11px] rounded border transition-colors ${
                            (form.dia_visita ?? []).includes(d)
                              ? 'bg-primary text-primary-foreground border-primary'
                              : 'border-input text-muted-foreground hover:bg-accent'
                          }`}>
                          {d.substring(0, 3)}
                        </button>
                      ))}
                    </div>
                  </div>
                </OdooSection>
              </div>
              <div className="space-y-1">
                <OdooSection title="Asignación">
                  <OdooField label="Vendedor" value={form.vendedor_id} onChange={v => set('vendedor_id', v || null)} type="select"
                    options={vendedores?.map(v => ({ value: v.id, label: v.nombre })) ?? []} />
                  <OdooField label="Cobrador" value={form.cobrador_id} onChange={v => set('cobrador_id', v || null)} type="select"
                    options={cobradores?.map(c => ({ value: c.id, label: c.nombre })) ?? []} />
                </OdooSection>
                <OdooSection title="Crédito">
                  <div className="odoo-field-row">
                    <span className="odoo-field-label">¿Crédito?</span>
                    <input type="checkbox" checked={!!form.credito} onChange={e => set('credito', e.target.checked)} className="rounded border-input" />
                  </div>
                  {form.credito && (
                    <>
                      <OdooField label="Límite de Crédito" value={form.limite_credito} onChange={v => set('limite_credito', +v)} type="number"
                        format={(v: number) => `$ ${(v ?? 0).toFixed(2)}`} />
                      <OdooField label="Días de Crédito" value={form.dias_credito} onChange={v => set('dias_credito', +v)} type="number" />
                    </>
                  )}
                </OdooSection>
              </div>
            </div>
          ),
        },
        {
          key: 'notas', label: 'Notas',
          content: (
            <div className="max-w-2xl">
              <textarea
                className="input-odoo w-full min-h-[120px] text-[13px]"
                value={form.notas ?? ''}
                onChange={e => set('notas', e.target.value)}
                placeholder="Notas internas..."
              />
            </div>
          ),
        },
      ]} />
    </div>
  );
}
