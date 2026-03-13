import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Save, X, Trash2, Plus } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { OdooTabs } from '@/components/OdooTabs';
import { OdooCollapsible } from '@/components/OdooCollapsible';
import { useTarifa, useSaveTarifa, useSaveTarifaLinea, useDeleteTarifaLinea, useProductosForSelect } from '@/hooks/useData';
import { toast } from 'sonner';
import type { Tarifa, TarifaLinea } from '@/types';

function OdooField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label-odoo">{label}</label>
      {children}
    </div>
  );
}

export default function TarifaFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = id === 'nueva';
  const { data: existing, refetch } = useTarifa(isNew ? undefined : id);
  const saveMutation = useSaveTarifa();
  const saveLinea = useSaveTarifaLinea();
  const deleteLinea = useDeleteTarifaLinea();
  const { data: productosDisp } = useProductosForSelect();

  const [form, setForm] = useState<Partial<Tarifa>>({
    nombre: '', descripcion: '', tipo: 'general', moneda: 'MXN', activa: true,
  });
  const [newLinea, setNewLinea] = useState({ producto_id: '', precio: 0, precio_minimo: 0, descuento_max: 0, notas: '' });

  useEffect(() => { if (existing) setForm(existing); }, [existing]);

  const set = (key: keyof Tarifa, value: any) => setForm(prev => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    if (!form.nombre) { toast.error('El nombre es obligatorio'); return; }
    try {
      const result = await saveMutation.mutateAsync(isNew ? form : { ...form, id });
      toast.success('Tarifa guardada');
      if (isNew) navigate(`/tarifas/${result.id}`);
    } catch (err: any) { toast.error(err.message); }
  };

  const handleAddLinea = async () => {
    if (!newLinea.producto_id || !id || isNew) return;
    try {
      await saveLinea.mutateAsync({ ...newLinea, tarifa_id: id });
      setNewLinea({ producto_id: '', precio: 0, precio_minimo: 0, descuento_max: 0, notas: '' });
      refetch();
      toast.success('Línea agregada');
    } catch (err: any) { toast.error(err.message); }
  };

  const handleDeleteLinea = async (lineaId: string) => {
    try { await deleteLinea.mutateAsync(lineaId); refetch(); } catch (err: any) { toast.error(err.message); }
  };

  const lineas = (existing?.tarifa_lineas ?? []) as TarifaLinea[];

  return (
    <div className="p-4">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <h1 className="text-xl font-bold text-foreground flex-1">
          {isNew ? 'Nueva Tarifa' : form.nombre || 'Tarifa'}
        </h1>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2 mb-4">
        <button onClick={handleSave} disabled={saveMutation.isPending} className="btn-odoo-primary">
          <Save className="h-3.5 w-3.5" /> Guardar
        </button>
        <button onClick={() => navigate('/tarifas')} className="btn-odoo-secondary">
          <X className="h-3.5 w-3.5" /> Descartar
        </button>
      </div>

      {/* Form */}
      <div className="bg-card border border-border rounded p-4">
        <OdooCollapsible title="Información General" summary={form.nombre ?? ''}>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-3">
            <OdooField label="Nombre *">
              <input className="input-odoo" value={form.nombre ?? ''} onChange={e => set('nombre', e.target.value)} />
            </OdooField>
            <OdooField label="Tipo">
              <select className="input-odoo" value={form.tipo ?? 'general'} onChange={e => set('tipo', e.target.value)}>
                <option value="general">General</option>
                <option value="por_cliente">Por Cliente</option>
                <option value="por_ruta">Por Ruta</option>
              </select>
            </OdooField>
            <OdooField label="Moneda">
              <input className="input-odoo" value={form.moneda ?? 'MXN'} onChange={e => set('moneda', e.target.value)} />
            </OdooField>
            <div className="flex items-center gap-2 pt-5">
              <Switch checked={!!form.activa} onCheckedChange={v => set('activa', v)} />
              <span className="text-sm">Activa</span>
            </div>
            <OdooField label="Vigencia Inicio">
              <input type="date" className="input-odoo" value={form.vigencia_inicio ?? ''} onChange={e => set('vigencia_inicio', e.target.value)} />
            </OdooField>
            <OdooField label="Vigencia Fin">
              <input type="date" className="input-odoo" value={form.vigencia_fin ?? ''} onChange={e => set('vigencia_fin', e.target.value)} />
            </OdooField>
          </div>
          <div className="mt-3">
            <OdooField label="Descripción">
              <input className="input-odoo" value={form.descripcion ?? ''} onChange={e => set('descripcion', e.target.value)} />
            </OdooField>
          </div>
        </OdooCollapsible>

        {/* Lineas */}
        {!isNew && (
          <div className="mt-4">
            <OdooTabs
              tabs={[
                {
                  key: 'lineas',
                  label: 'Líneas de Tarifa',
                  content: (
                    <div className="space-y-2">
                      <div className="overflow-x-auto border border-border rounded">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-table-border">
                              <th className="th-odoo text-left">Producto</th>
                              <th className="th-odoo text-right">Precio</th>
                              <th className="th-odoo text-right">Precio Mín</th>
                              <th className="th-odoo text-right">Desc. Máx</th>
                              <th className="th-odoo text-left">Notas</th>
                              <th className="th-odoo w-10"></th>
                            </tr>
                          </thead>
                          <tbody>
                            {lineas.map(l => (
                              <tr key={l.id} className="border-b border-table-border last:border-0">
                                <td className="py-1.5 px-3">{l.productos?.nombre ?? l.producto_id}</td>
                                <td className="py-1.5 px-3 text-right">${l.precio.toFixed(2)}</td>
                                <td className="py-1.5 px-3 text-right">${l.precio_minimo.toFixed(2)}</td>
                                <td className="py-1.5 px-3 text-right">${l.descuento_max.toFixed(2)}</td>
                                <td className="py-1.5 px-3 text-muted-foreground">{l.notas ?? '—'}</td>
                                <td className="py-1.5 px-3 text-center">
                                  <button onClick={() => handleDeleteLinea(l.id)} className="text-destructive hover:text-destructive/80 text-xs">
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </td>
                              </tr>
                            ))}
                            {/* Add row */}
                            <tr className="border-b border-table-border last:border-0 bg-table-hover">
                              <td className="py-1.5 px-3">
                                <select className="input-odoo text-xs" value={newLinea.producto_id} onChange={e => setNewLinea(p => ({ ...p, producto_id: e.target.value }))}>
                                  <option value="">Producto...</option>
                                  {productosDisp?.map(p => <option key={p.id} value={p.id}>{p.codigo} — {p.nombre}</option>)}
                                </select>
                              </td>
                              <td className="py-1.5 px-3"><input type="number" className="input-odoo text-right text-xs" value={newLinea.precio} onChange={e => setNewLinea(p => ({ ...p, precio: +e.target.value }))} /></td>
                              <td className="py-1.5 px-3"><input type="number" className="input-odoo text-right text-xs" value={newLinea.precio_minimo} onChange={e => setNewLinea(p => ({ ...p, precio_minimo: +e.target.value }))} /></td>
                              <td className="py-1.5 px-3"><input type="number" className="input-odoo text-right text-xs" value={newLinea.descuento_max} onChange={e => setNewLinea(p => ({ ...p, descuento_max: +e.target.value }))} /></td>
                              <td className="py-1.5 px-3"><input className="input-odoo text-xs" value={newLinea.notas} onChange={e => setNewLinea(p => ({ ...p, notas: e.target.value }))} /></td>
                              <td className="py-1.5 px-3 text-center">
                                <button onClick={handleAddLinea} disabled={!newLinea.producto_id} className="text-primary hover:text-primary/80 disabled:opacity-30">
                                  <Plus className="h-3.5 w-3.5" />
                                </button>
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                      <button className="odoo-link" onClick={handleAddLinea} disabled={!newLinea.producto_id}>
                        + Agregar una línea
                      </button>
                    </div>
                  ),
                },
              ]}
            />
          </div>
        )}
      </div>
    </div>
  );
}
