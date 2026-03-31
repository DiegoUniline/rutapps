import { useState } from 'react';
import { Warehouse, Truck, Plus, ToggleLeft, ToggleRight } from 'lucide-react';
import { InlineEditCell } from '@/components/InlineEditCell';
import { TableSkeleton } from '@/components/TableSkeleton';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';

export default function AlmacenesPage() {
  const qc = useQueryClient();
  const { empresa } = useAuth();
  const [newNombre, setNewNombre] = useState('');
  const [newTipo, setNewTipo] = useState<'almacen' | 'ruta'>('almacen');
  const [showInactive, setShowInactive] = useState(false);

  const { data: items, isLoading } = useQuery({
    queryKey: ['almacenes', empresa?.id, showInactive],
    enabled: !!empresa?.id,
    queryFn: async () => {
      let q = supabase.from('almacenes').select('*').eq('empresa_id', empresa!.id).order('nombre');
      if (!showInactive) q = q.eq('activo', true);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  const activeItems = items?.filter(i => i.activo !== false) ?? [];
  const inactiveItems = items?.filter(i => i.activo === false) ?? [];
  const displayItems = showInactive ? inactiveItems : activeItems;

  const handleAdd = async () => {
    if (!newNombre.trim()) { toast.error('El nombre es obligatorio'); return; }
    if (!empresa?.id) { toast.error('Sin perfil de empresa'); return; }
    try {
      const { error } = await supabase.from('almacenes').insert({ nombre: newNombre.trim(), tipo: newTipo, empresa_id: empresa.id } as any);
      if (error) throw error;
      setNewNombre('');
      setNewTipo('almacen');
      qc.invalidateQueries({ queryKey: ['almacenes'] });
      toast.success('Almacén agregado');
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleToggleActivo = async (id: string, currentActivo: boolean) => {
    const newVal = !currentActivo;
    qc.setQueriesData<any[]>({ queryKey: ['almacenes'] }, (old) =>
      old?.map(item => item.id === id ? { ...item, activo: newVal } : item)
    );
    try {
      const { error } = await supabase.from('almacenes').update({ activo: newVal }).eq('id', id);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ['almacenes'] });
      toast.success(newVal ? 'Activado' : 'Dado de baja');
    } catch (err: any) {
      qc.invalidateQueries({ queryKey: ['almacenes'] });
      toast.error(err.message);
    }
  };

  const handleInlineSave = async (id: string, field: string, val: string) => {
    try {
      const { error } = await supabase.from('almacenes').update({ [field]: val } as any).eq('id', id);
      if (error) throw error;
      qc.setQueriesData<any[]>({ queryKey: ['almacenes'] }, (old) =>
        old?.map(item => item.id === id ? { ...item, [field]: val } : item)
      );
      toast.success('Actualizado');
    } catch (err: any) {
      toast.error(err.message);
      qc.invalidateQueries({ queryKey: ['almacenes'] });
    }
  };

  const handleTipoToggle = async (id: string, currentTipo: string) => {
    const newTipoVal = currentTipo === 'ruta' ? 'almacen' : 'ruta';
    qc.setQueriesData<any[]>({ queryKey: ['almacenes'] }, (old) =>
      old?.map(item => item.id === id ? { ...item, tipo: newTipoVal } : item)
    );
    try {
      const { error } = await supabase.from('almacenes').update({ tipo: newTipoVal } as any).eq('id', id);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ['almacenes'] });
    } catch (err: any) {
      qc.invalidateQueries({ queryKey: ['almacenes'] });
      toast.error(err.message);
    }
  };

  return (
    <div className="p-4 space-y-4 min-h-full">
      <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
        <Warehouse className="h-5 w-5" /> Almacenes
      </h1>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        <button onClick={() => setShowInactive(false)}
          className={cn("px-4 py-2 text-sm font-medium border-b-2 transition-colors", !showInactive ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}>
          Activos ({activeItems.length})
        </button>
        <button onClick={() => setShowInactive(true)}
          className={cn("px-4 py-2 text-sm font-medium border-b-2 transition-colors", showInactive ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}>
          Inactivos ({inactiveItems.length})
        </button>
      </div>

      <div className="bg-card border border-border rounded overflow-x-auto">
        {isLoading ? (
          <div className="p-4"><TableSkeleton rows={4} cols={3} /></div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-table-border">
                <th className="th-odoo text-left">Nombre</th>
                <th className="th-odoo text-center w-28">Tipo</th>
                <th className="th-odoo w-20 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {displayItems.map(item => (
                <tr key={item.id} className={cn("border-b border-table-border last:border-0 hover:bg-table-hover transition-colors group", item.activo === false && "opacity-60")}>
                  <td className="py-0.5 px-3">
                    <InlineEditCell value={item.nombre} type="text" onSave={val => handleInlineSave(item.id, 'nombre', val)} required />
                  </td>
                  <td className="py-1.5 px-3 text-center">
                    <button
                      onClick={() => handleTipoToggle(item.id, (item as any).tipo ?? 'almacen')}
                      className="inline-flex items-center gap-1.5"
                    >
                      {((item as any).tipo ?? 'almacen') === 'ruta' ? (
                        <Badge variant="outline" className="gap-1 text-warning border-warning/30 bg-warning/10 cursor-pointer hover:bg-warning/20">
                          <Truck className="h-3 w-3" /> Ruta
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="gap-1 text-primary border-primary/30 bg-primary/10 cursor-pointer hover:bg-primary/20">
                          <Warehouse className="h-3 w-3" /> Almacén
                        </Badge>
                      )}
                    </button>
                  </td>
                  <td className="py-1.5 px-3 text-right">
                    <button
                      className={cn("p-1 transition-opacity", item.activo === false ? "text-success hover:text-success/80" : "text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100")}
                      onClick={() => handleToggleActivo(item.id, item.activo !== false)}
                      title={item.activo === false ? 'Reactivar' : 'Dar de baja'}
                    >
                      {item.activo === false ? <ToggleRight className="h-4 w-4" /> : <ToggleLeft className="h-4 w-4" />}
                    </button>
                  </td>
                </tr>
              ))}
              {displayItems.length === 0 && (
                <tr><td colSpan={3} className="px-4 py-8 text-center text-muted-foreground text-sm">
                  {showInactive ? 'No hay registros inactivos' : 'No hay registros activos'}
                </td></tr>
              )}
              {!showInactive && (
                <tr className="bg-table-hover">
                  <td className="py-1.5 px-3">
                    <input
                      type="text" placeholder="Nombre" value={newNombre}
                      onChange={e => setNewNombre(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
                      className="inline-edit-input text-xs"
                    />
                  </td>
                  <td className="py-1.5 px-3 text-center">
                    <button onClick={() => setNewTipo(prev => prev === 'almacen' ? 'ruta' : 'almacen')} className="inline-flex items-center gap-1.5">
                      {newTipo === 'ruta' ? (
                        <Badge variant="outline" className="gap-1 text-warning border-warning/30 bg-warning/10 cursor-pointer hover:bg-warning/20">
                          <Truck className="h-3 w-3" /> Ruta
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="gap-1 text-primary border-primary/30 bg-primary/10 cursor-pointer hover:bg-primary/20">
                          <Warehouse className="h-3 w-3" /> Almacén
                        </Badge>
                      )}
                    </button>
                  </td>
                  <td className="py-1.5 px-3 text-right">
                    <button className="text-primary hover:text-primary/80 p-1" onClick={handleAdd}>
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
