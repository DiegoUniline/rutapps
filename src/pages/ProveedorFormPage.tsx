import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Save, Trash2 } from 'lucide-react';
import { usePermisos } from '@/hooks/usePermisos';
import { OdooTabs } from '@/components/OdooTabs';
import { OdooField, OdooSection } from '@/components/OdooFormField';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

interface Proveedor {
  id?: string;
  nombre: string;
  contacto?: string;
  telefono?: string;
  email?: string;
  rfc?: string;
  razon_social?: string;
  direccion?: string;
  colonia?: string;
  ciudad?: string;
  estado?: string;
  cp?: string;
  notas?: string;
  sitio_web?: string;
  condicion_pago: string;
  dias_credito: number;
  limite_credito: number;
  banco?: string;
  cuenta_banco?: string;
  clabe?: string;
  tiempo_entrega_dias: number;
  status: string;
}

const defaultProv: Proveedor = {
  nombre: '', contacto: '', telefono: '', email: '', rfc: '', razon_social: '',
  direccion: '', colonia: '', ciudad: '', estado: '', cp: '', notas: '', sitio_web: '',
  condicion_pago: 'contado', dias_credito: 0, limite_credito: 0, tiempo_entrega_dias: 0,
  banco: '', cuenta_banco: '', clabe: '', status: 'activo',
};

const ESTADOS_MX = [
  'Aguascalientes','Baja California','Baja California Sur','Campeche','Chiapas','Chihuahua',
  'Ciudad de México','Coahuila','Colima','Durango','Estado de México','Guanajuato','Guerrero',
  'Hidalgo','Jalisco','Michoacán','Morelos','Nayarit','Nuevo León','Oaxaca','Puebla',
  'Querétaro','Quintana Roo','San Luis Potosí','Sinaloa','Sonora','Tabasco','Tamaulipas',
  'Tlaxcala','Veracruz','Yucatán','Zacatecas',
];

export default function ProveedorFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { empresa } = useAuth();
  const isNew = id === 'nuevo';
  const { hasPermiso } = usePermisos();
  const canEdit = hasPermiso('catalogo.proveedores', 'editar');
  const canCreate = hasPermiso('catalogo.proveedores', 'crear');
  const canDeletePerm = hasPermiso('catalogo.proveedores', 'eliminar');
  const formReadOnly = isNew ? !canCreate : !canEdit;

  const { data: existing } = useQuery({
    queryKey: ['proveedor', id],
    enabled: !isNew && !!id,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.from('proveedores').select('*').eq('id', id!).single();
      if (error) throw error;
      return data as any;
    },
  });

  const [form, setForm] = useState<Proveedor>(defaultProv);
  const [original, setOriginal] = useState<Proveedor>(defaultProv);

  useEffect(() => {
    if (existing) {
      const mapped = { ...defaultProv, ...existing };
      setForm(mapped);
      setOriginal(mapped);
    }
  }, [existing]);

  const isDirty = isNew || JSON.stringify(form) !== JSON.stringify(original);
  const set = (key: keyof Proveedor, value: any) => setForm(prev => ({ ...prev, [key]: value }));

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { id: _id, ...rest } = form as any;
      if (!isNew && id) {
        const { error } = await supabase.from('proveedores').update(rest).eq('id', id);
        if (error) throw error;
        return { id };
      } else {
        if (!empresa?.id) throw new Error('Sin empresa');
        const { data, error } = await supabase.from('proveedores')
          .insert({ ...rest, empresa_id: empresa.id })
          .select('id').single();
        if (error) throw error;
        return data;
      }
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['proveedores'] });
      qc.invalidateQueries({ queryKey: ['proveedores-full'] });
      toast.success('Proveedor guardado');
      setOriginal({ ...form });
      if (isNew && data?.id) navigate(`/proveedores/${data.id}`, { replace: true });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      // Soft delete: set status to 'baja' instead of deleting
      const { error } = await supabase.from('proveedores').update({ status: 'baja' }).eq('id', id!);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['proveedores'] });
      qc.invalidateQueries({ queryKey: ['proveedores-full'] });
      toast.success('Proveedor dado de baja');
      navigate('/proveedores');
    },
    onError: (err: any) => toast.error(err.message),
  });

  const handleSave = () => {
    if (!form.nombre.trim()) { toast.error('El nombre es obligatorio'); return; }
    saveMutation.mutate();
  };

  const handleDelete = () => {
    if (!id || isNew) return;
    if (!confirm('¿Eliminar este proveedor?')) return;
    deleteMutation.mutate();
  };

  return (
    <div className="p-4 min-h-full">
      {/* Breadcrumb + Status */}
      <div className="flex items-center justify-between mb-0.5">
        <Link to="/proveedores" className="text-[12px] text-muted-foreground hover:text-foreground transition-colors">
          Proveedores
        </Link>
        <div className="flex items-center gap-1">
          {['activo', 'inactivo'].map(s => (
            <button
              key={s}
              type="button"
              onClick={() => set('status', s)}
              className={`text-[11px] px-2 py-0.5 rounded-full border transition-colors ${
                form.status === s
                  ? 'bg-primary text-primary-foreground border-primary font-medium'
                  : 'border-border text-muted-foreground hover:border-primary/40'
              }`}
            >
              {s === 'activo' ? 'Activo' : 'Inactivo'}
            </button>
          ))}
        </div>
      </div>

      {/* Title + Actions */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold text-foreground">
          {isNew ? 'Nuevo proveedor' : form.nombre || 'Proveedor'}
        </h1>
        <div className="flex items-center gap-2">
          {!isNew && (
            <button onClick={handleDelete} className="btn-odoo-secondary text-destructive flex items-center gap-1.5">
              <Trash2 className="h-4 w-4" /> Eliminar
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={!isDirty || saveMutation.isPending}
            className="btn-odoo-primary flex items-center gap-1.5 disabled:opacity-50"
          >
            <Save className="h-4 w-4" /> Guardar
          </button>
        </div>
      </div>

      {/* Form */}
      <div className="bg-card border border-border rounded p-5">
        <OdooTabs
          tabs={[
            {
              key: 'general', label: 'General',
              content: (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-1">
                    <OdooField label="Nombre *" value={form.nombre}
                      onChange={v => set('nombre', v)} />
                    <OdooField label="Contacto" value={form.contacto ?? ''}
                      onChange={v => set('contacto', v)} />
                    <OdooField label="Teléfono" value={form.telefono ?? ''}
                      onChange={v => set('telefono', v)} />
                    <OdooField label="Email" value={form.email ?? ''}
                      onChange={v => set('email', v)} />
                    <OdooField label="Sitio web" value={form.sitio_web ?? ''}
                      onChange={v => set('sitio_web', v)} />
                  </div>
                  <OdooSection title="Dirección">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-1">
                      <OdooField label="Calle y número" value={form.direccion ?? ''}
                        onChange={v => set('direccion', v)} />
                      <OdooField label="Colonia" value={form.colonia ?? ''}
                        onChange={v => set('colonia', v)} />
                      <OdooField label="Ciudad" value={form.ciudad ?? ''}
                        onChange={v => set('ciudad', v)} />
                      <OdooField label="Estado" value={form.estado ?? ''}
                        onChange={v => set('estado', v)} type="select"
                        options={ESTADOS_MX.map(e => ({ value: e, label: e }))} />
                      <OdooField label="C.P." value={form.cp ?? ''}
                        onChange={v => set('cp', v)} />
                    </div>
                  </OdooSection>
                </div>
              ),
            },
            {
              key: 'fiscal', label: 'Fiscal y Bancario',
              content: (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-1">
                    <OdooField label="RFC" value={form.rfc ?? ''}
                      onChange={v => set('rfc', v)} />
                    <OdooField label="Razón social" value={form.razon_social ?? ''}
                      onChange={v => set('razon_social', v)} />
                  </div>
                  <OdooSection title="Datos bancarios">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-1">
                      <OdooField label="Banco" value={form.banco ?? ''}
                        onChange={v => set('banco', v)} />
                      <OdooField label="No. de cuenta" value={form.cuenta_banco ?? ''}
                        onChange={v => set('cuenta_banco', v)} />
                      <OdooField label="CLABE interbancaria" value={form.clabe ?? ''}
                        onChange={v => set('clabe', v)} />
                    </div>
                  </OdooSection>
                </div>
              ),
            },
            {
              key: 'compras', label: 'Compras',
              content: (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-1">
                  <OdooField label="Condición de pago" value={form.condicion_pago}
                    onChange={v => set('condicion_pago', v)} type="select"
                    options={[
                      { value: 'contado', label: 'Contado' },
                      { value: 'credito', label: 'Crédito' },
                      { value: 'anticipo', label: 'Anticipo' },
                    ]} />
                  <OdooField label="Días de crédito" value={String(form.dias_credito ?? 0)}
                    onChange={v => set('dias_credito', Number(v))} type="number" />
                  <OdooField label="Límite de crédito" value={String(form.limite_credito ?? 0)}
                    onChange={v => set('limite_credito', Number(v))} type="number" />
                  <OdooField label="Tiempo de entrega (días)" value={String(form.tiempo_entrega_dias ?? 0)}
                    onChange={v => set('tiempo_entrega_dias', Number(v))} type="number" />
                </div>
              ),
            },
            {
              key: 'notas', label: 'Notas',
              content: (
                <div>
                  <label className="text-[12px] text-muted-foreground mb-1 block">Notas internas</label>
                  <textarea
                    value={form.notas ?? ''}
                    onChange={e => set('notas', e.target.value)}
                    rows={5}
                    className="input-odoo w-full text-[13px]"
                    placeholder="Notas sobre este proveedor..."
                  />
                </div>
              ),
            },
          ]}
        />
      </div>
    </div>
  );
}
