import { useState } from 'react';
import { Plus, Trash2, ToggleLeft, ToggleRight } from 'lucide-react';
import { InlineEditCell } from '@/components/InlineEditCell';
import { TableSkeleton } from '@/components/TableSkeleton';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';

export interface CatalogColumn {
  key: string;
  label: string;
  type?: 'text' | 'number';
}

interface CatalogCRUDProps {
  title: string;
  tableName: string;
  columns: CatalogColumn[];
  queryKey: string;
}

export default function CatalogCRUD({ title, tableName, columns, queryKey }: CatalogCRUDProps) {
  const qc = useQueryClient();
  const [newRow, setNewRow] = useState<Record<string, string | number>>({});
  const [showInactive, setShowInactive] = useState(false);

  const { data: items, isLoading } = useQuery({
    queryKey: [queryKey, showInactive],
    queryFn: async () => {
      let q = (supabase.from as any)(tableName).select('*').order('nombre');
      // Only filter by activo if column exists (we added it to all catalog tables)
      if (!showInactive) q = q.eq('activo', true);
      const { data, error } = await q;
      if (error) throw error;
      return data as any[];
    },
  });

  const activeItems = items?.filter(i => i.activo !== false) ?? [];
  const inactiveItems = items?.filter(i => i.activo === false) ?? [];
  const displayItems = showInactive ? inactiveItems : activeItems;

  const handleAdd = async () => {
    if (!newRow.nombre || (newRow.nombre as string).trim() === '') {
      toast.error('El nombre es obligatorio');
      return;
    }
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      const { data: profile } = await supabase.from('profiles').select('empresa_id').eq('user_id', authUser?.id ?? '').maybeSingle();
      if (!profile?.empresa_id) { toast.error('Sin perfil de empresa'); return; }
      const { error } = await (supabase.from as any)(tableName).insert({ ...newRow, empresa_id: profile.empresa_id });
      if (error) throw error;
      setNewRow({});
      qc.invalidateQueries({ queryKey: [queryKey] });
      toast.success(`${title.slice(0, -1)} agregado`);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleToggleActivo = async (id: string, currentActivo: boolean) => {
    const newVal = !currentActivo;
    try {
      const { error } = await (supabase.from as any)(tableName).update({ activo: newVal }).eq('id', id);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: [queryKey] });
      toast.success(newVal ? 'Activado' : 'Dado de baja');
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleInlineSave = async (id: string, field: string, val: string, type?: string) => {
    try {
      const updateVal = type === 'number' ? Number(val) : val;
      const { error } = await (supabase.from as any)(tableName).update({ [field]: updateVal }).eq('id', id);
      if (error) throw error;
      qc.setQueryData([queryKey, showInactive], (old: any[] | undefined) =>
        old?.map(item => item.id === id ? { ...item, [field]: updateVal } : item)
      );
      toast.success('Actualizado');
    } catch (err: any) {
      toast.error(err.message);
      qc.invalidateQueries({ queryKey: [queryKey] });
    }
  };

  return (
    <div className="space-y-3">
      {/* Tabs: Activos / Inactivos */}
      <div className="flex gap-1 border-b border-border">
        <button
          onClick={() => setShowInactive(false)}
          className={cn("px-4 py-2 text-sm font-medium border-b-2 transition-colors", !showInactive ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}
        >
          Activos ({activeItems.length})
        </button>
        <button
          onClick={() => setShowInactive(true)}
          className={cn("px-4 py-2 text-sm font-medium border-b-2 transition-colors", showInactive ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}
        >
          Inactivos ({inactiveItems.length})
        </button>
      </div>

      <div className="bg-card border border-border rounded overflow-x-auto">
        {isLoading ? (
          <div className="p-4"><TableSkeleton rows={4} cols={columns.length + 1} /></div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-table-border">
                {columns.map(c => (
                  <th key={c.key} className="th-odoo text-left">{c.label}</th>
                ))}
                <th className="th-odoo w-20 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {displayItems.map(item => (
                <tr key={item.id} className={cn("border-b border-table-border last:border-0 hover:bg-table-hover transition-colors group", item.activo === false && "opacity-60")}>
                  {columns.map(c => (
                    <td key={c.key} className="py-0.5 px-3">
                      <InlineEditCell
                        value={item[c.key]}
                        type={c.type || 'text'}
                        onSave={val => handleInlineSave(item.id, c.key, val, c.type)}
                        required={c.key === 'nombre'}
                      />
                    </td>
                  ))}
                  <td className="py-1.5 px-3 text-right">
                    <button
                      className={cn(
                        "p-1 transition-opacity",
                        item.activo === false
                          ? "text-success hover:text-success/80"
                          : "text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100"
                      )}
                      onClick={() => handleToggleActivo(item.id, item.activo !== false)}
                      title={item.activo === false ? 'Reactivar' : 'Dar de baja'}
                    >
                      {item.activo === false ? <ToggleRight className="h-4 w-4" /> : <ToggleLeft className="h-4 w-4" />}
                    </button>
                  </td>
                </tr>
              ))}
              {displayItems.length === 0 && (
                <tr><td colSpan={columns.length + 1} className="px-4 py-8 text-center text-muted-foreground text-sm">
                  {showInactive ? 'No hay registros inactivos' : 'No hay registros activos'}
                </td></tr>
              )}
              {/* Add row - only on active tab */}
              {!showInactive && (
                <tr className="bg-table-hover">
                  {columns.map(c => (
                    <td key={c.key} className="py-1.5 px-3">
                      <input
                        type={c.type === 'number' ? 'number' : 'text'}
                        placeholder={c.label}
                        value={newRow[c.key] ?? ''}
                        onChange={e => setNewRow(prev => ({ ...prev, [c.key]: c.type === 'number' ? +e.target.value : e.target.value }))}
                        onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
                        className="inline-edit-input text-xs"
                      />
                    </td>
                  ))}
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
