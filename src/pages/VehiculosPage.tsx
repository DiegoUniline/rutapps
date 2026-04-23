import { useState } from 'react';
import { useVehiculos, useUpsertVehiculo, useDeleteVehiculo, type Vehiculo } from '@/hooks/useVehiculos';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Plus, Truck, Edit2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

export default function VehiculosPage() {
  const { data: vehiculos = [], isLoading } = useVehiculos();
  const { usuarios = [] } = useUsuarios() as any;
  const upsert = useUpsertVehiculo();
  const del = useDeleteVehiculo();
  const [editing, setEditing] = useState<Partial<Vehiculo> | null>(null);

  const handleSave = async () => {
    if (!editing?.alias) return toast.error('Captura un alias');
    try {
      await upsert.mutateAsync(editing);
      toast.success('Vehículo guardado');
      setEditing(null);
    } catch (e: any) { toast.error(e.message); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar vehículo? No se podrá deshacer si no tiene jornadas asociadas.')) return;
    try {
      await del.mutateAsync(id);
      toast.success('Eliminado');
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <div className="container mx-auto p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Truck className="h-6 w-6 text-primary" /> Vehículos
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Catálogo de vehículos para jornadas de ruta y control de kilometraje.
          </p>
        </div>
        <Button onClick={() => setEditing({ tipo: 'camioneta', status: 'activo', km_actual: 0 })}>
          <Plus className="h-4 w-4 mr-1" /> Nuevo vehículo
        </Button>
      </div>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-left">Alias</th>
              <th className="px-4 py-3 text-left">Placa</th>
              <th className="px-4 py-3 text-left">Marca / Modelo</th>
              <th className="px-4 py-3 text-left">Tipo</th>
              <th className="px-4 py-3 text-right">KM actual</th>
              <th className="px-4 py-3 text-left">Asignado a</th>
              <th className="px-4 py-3 text-left">Estado</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">Cargando...</td></tr>
            ) : vehiculos.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">Sin vehículos. Agrega el primero.</td></tr>
            ) : vehiculos.map(v => {
              const assigned = usuarios.find((u: any) => u.id === v.vendedor_default_id);
              return (
                <tr key={v.id} className="border-t border-border hover:bg-muted/20">
                  <td className="px-4 py-3 font-semibold text-foreground">{v.alias}</td>
                  <td className="px-4 py-3">{v.placa || '—'}</td>
                  <td className="px-4 py-3">{[v.marca, v.modelo].filter(Boolean).join(' ') || '—'}</td>
                  <td className="px-4 py-3 capitalize">{v.tipo}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{Number(v.km_actual).toLocaleString()}</td>
                  <td className="px-4 py-3">{assigned?.nombre || '—'}</td>
                  <td className="px-4 py-3">
                    <Badge variant={v.status === 'activo' ? 'default' : v.status === 'mantenimiento' ? 'secondary' : 'outline'}>
                      {v.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button size="icon" variant="ghost" onClick={() => setEditing(v)}><Edit2 className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => handleDelete(v.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing?.id ? 'Editar vehículo' : 'Nuevo vehículo'}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Alias *</Label>
                  <Input value={editing.alias || ''} onChange={e => setEditing({ ...editing, alias: e.target.value })} placeholder="Ej. Camioneta Roja" />
                </div>
                <div>
                  <Label>Placa</Label>
                  <Input value={editing.placa || ''} onChange={e => setEditing({ ...editing, placa: e.target.value })} placeholder="ABC-123" />
                </div>
                <div>
                  <Label>Marca</Label>
                  <Input value={editing.marca || ''} onChange={e => setEditing({ ...editing, marca: e.target.value })} />
                </div>
                <div>
                  <Label>Modelo</Label>
                  <Input value={editing.modelo || ''} onChange={e => setEditing({ ...editing, modelo: e.target.value })} />
                </div>
                <div>
                  <Label>Año</Label>
                  <Input type="number" value={editing.anio || ''} onChange={e => setEditing({ ...editing, anio: parseInt(e.target.value) || null })} />
                </div>
                <div>
                  <Label>Tipo</Label>
                  <Select value={editing.tipo || 'camioneta'} onValueChange={(v) => setEditing({ ...editing, tipo: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="camioneta">Camioneta</SelectItem>
                      <SelectItem value="camion">Camión</SelectItem>
                      <SelectItem value="auto">Auto</SelectItem>
                      <SelectItem value="moto">Moto</SelectItem>
                      <SelectItem value="otro">Otro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Capacidad (kg)</Label>
                  <Input type="number" value={editing.capacidad_kg || ''} onChange={e => setEditing({ ...editing, capacidad_kg: parseFloat(e.target.value) || null })} />
                </div>
                <div>
                  <Label>KM actual</Label>
                  <Input type="number" value={editing.km_actual ?? 0} onChange={e => setEditing({ ...editing, km_actual: parseFloat(e.target.value) || 0 })} />
                </div>
                <div className="col-span-2">
                  <Label>Asignado a (vendedor)</Label>
                  <Select value={editing.vendedor_default_id || 'none'} onValueChange={(v) => setEditing({ ...editing, vendedor_default_id: v === 'none' ? null : v })}>
                    <SelectTrigger><SelectValue placeholder="Sin asignar" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sin asignar</SelectItem>
                      {usuarios.map((u: any) => <SelectItem key={u.id} value={u.id}>{u.nombre}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2">
                  <Label>Estado</Label>
                  <Select value={editing.status || 'activo'} onValueChange={(v: any) => setEditing({ ...editing, status: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="activo">Activo</SelectItem>
                      <SelectItem value="mantenimiento">En mantenimiento</SelectItem>
                      <SelectItem value="baja">Baja</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={upsert.isPending}>
              {upsert.isPending ? 'Guardando...' : 'Guardar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
