import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, X, Trash2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useTarifa, useSaveTarifa, useSaveTarifaLinea, useDeleteTarifaLinea, useProductosForSelect } from '@/hooks/useData';
import { toast } from 'sonner';
import type { Tarifa, TarifaLinea } from '@/types';

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
    <div className="p-4 md:p-6 space-y-4 max-w-4xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/tarifas')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-xl font-semibold flex-1">{isNew ? 'Nueva Tarifa' : form.nombre || 'Tarifa'}</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate('/tarifas')}>
            <X className="h-4 w-4 mr-1" /> Descartar
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saveMutation.isPending} className="bg-info hover:bg-info/90 text-info-foreground">
            <Save className="h-4 w-4 mr-1" /> Guardar
          </Button>
        </div>
      </div>

      {/* Form */}
      <div className="section-card space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>Nombre *</Label>
            <Input value={form.nombre ?? ''} onChange={e => set('nombre', e.target.value)} />
          </div>
          <div>
            <Label>Tipo</Label>
            <Select value={form.tipo ?? 'general'} onValueChange={v => set('tipo', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="general">General</SelectItem>
                <SelectItem value="por_cliente">Por Cliente</SelectItem>
                <SelectItem value="por_ruta">Por Ruta</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Moneda</Label>
            <Input value={form.moneda ?? 'MXN'} onChange={e => set('moneda', e.target.value)} />
          </div>
          <div className="flex items-center gap-3 pt-6">
            <Switch checked={!!form.activa} onCheckedChange={v => set('activa', v)} />
            <Label>Activa</Label>
          </div>
          <div>
            <Label>Vigencia Inicio</Label>
            <Input type="date" value={form.vigencia_inicio ?? ''} onChange={e => set('vigencia_inicio', e.target.value)} />
          </div>
          <div>
            <Label>Vigencia Fin</Label>
            <Input type="date" value={form.vigencia_fin ?? ''} onChange={e => set('vigencia_fin', e.target.value)} />
          </div>
        </div>
        <div>
          <Label>Descripción</Label>
          <Input value={form.descripcion ?? ''} onChange={e => set('descripcion', e.target.value)} />
        </div>
      </div>

      {/* Lineas - only show after save */}
      {!isNew && (
        <div className="section-card space-y-4">
          <h2 className="text-base font-semibold">Líneas de Tarifa</h2>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Producto</TableHead>
                  <TableHead className="text-right">Precio</TableHead>
                  <TableHead className="text-right">Precio Mín</TableHead>
                  <TableHead className="text-right">Desc. Máx</TableHead>
                  <TableHead>Notas</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lineas.map(l => (
                  <TableRow key={l.id}>
                    <TableCell>{l.productos?.nombre ?? l.producto_id}</TableCell>
                    <TableCell className="text-right">${l.precio.toFixed(2)}</TableCell>
                    <TableCell className="text-right">${l.precio_minimo.toFixed(2)}</TableCell>
                    <TableCell className="text-right">${l.descuento_max.toFixed(2)}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{l.notas ?? '—'}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={() => handleDeleteLinea(l.id)} className="text-destructive h-7 w-7">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {/* Add row */}
                <TableRow>
                  <TableCell>
                    <Select value={newLinea.producto_id} onValueChange={v => setNewLinea(p => ({ ...p, producto_id: v }))}>
                      <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Producto..." /></SelectTrigger>
                      <SelectContent>
                        {productosDisp?.map(p => <SelectItem key={p.id} value={p.id}>{p.codigo} — {p.nombre}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell><Input type="number" className="h-8 text-sm text-right" value={newLinea.precio} onChange={e => setNewLinea(p => ({ ...p, precio: +e.target.value }))} /></TableCell>
                  <TableCell><Input type="number" className="h-8 text-sm text-right" value={newLinea.precio_minimo} onChange={e => setNewLinea(p => ({ ...p, precio_minimo: +e.target.value }))} /></TableCell>
                  <TableCell><Input type="number" className="h-8 text-sm text-right" value={newLinea.descuento_max} onChange={e => setNewLinea(p => ({ ...p, descuento_max: +e.target.value }))} /></TableCell>
                  <TableCell><Input className="h-8 text-sm" value={newLinea.notas} onChange={e => setNewLinea(p => ({ ...p, notas: e.target.value }))} /></TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" onClick={handleAddLinea} disabled={!newLinea.producto_id} className="h-7 w-7 text-accent">
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
          <button className="odoo-link" onClick={handleAddLinea} disabled={!newLinea.producto_id}>
            + Agregar una línea
          </button>
        </div>
      )}
    </div>
  );
}
