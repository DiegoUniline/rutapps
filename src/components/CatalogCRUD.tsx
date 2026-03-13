import { useState } from 'react';
import { Plus, Trash2, Pencil, Check, X } from 'lucide-react';
import { TableSkeleton } from '@/components/TableSkeleton';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useQueryClient, useQuery } from '@tanstack/react-query';

interface CatalogColumn {
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
  const [editId, setEditId] = useState<string | null>(null);
  const [editRow, setEditRow] = useState<Record<string, string | number>>({});

  const { data: items, isLoading } = useQuery({
    queryKey: [queryKey],
    queryFn: async () => {
      const { data, error } = await (supabase.from as any)(tableName).select('*').order('nombre');
      if (error) throw error;
      return data as any[];
    },
  });

  const handleAdd = async () => {
    if (!newRow.nombre || (newRow.nombre as string).trim() === '') {
      toast.error('El nombre es obligatorio');
      return;
    }
    try {
      const { data: profile } = await supabase.from('profiles').select('empresa_id').maybeSingle();
      if (!profile) { toast.error('Sin perfil'); return; }
      const { error } = await (supabase.from as any)(tableName).insert({ ...newRow, empresa_id: profile.empresa_id });
      if (error) throw error;
      setNewRow({});
      qc.invalidateQueries({ queryKey: [queryKey] });
      toast.success(`${title.slice(0, -1)} agregado`);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar este registro?')) return;
    try {
      const { error } = await (supabase.from as any)(tableName).delete().eq('id', id);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: [queryKey] });
      toast.success('Eliminado');
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const startEdit = (item: any) => {
    setEditId(item.id);
    const row: Record<string, string | number> = {};
    columns.forEach(c => { row[c.key] = item[c.key] ?? ''; });
    setEditRow(row);
  };

  const handleSaveEdit = async () => {
    if (!editId) return;
    try {
      const { error } = await (supabase.from as any)(tableName).update(editRow).eq('id', editId);
      if (error) throw error;
      setEditId(null);
      qc.invalidateQueries({ queryKey: [queryKey] });
      toast.success('Actualizado');
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  return (
    <div className="space-y-3">
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
                <th className="th-odoo w-24 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {items?.map(item => (
                <tr key={item.id} className="border-b border-table-border last:border-0 hover:bg-table-hover transition-colors">
                  {columns.map(c => (
                    <td key={c.key} className="py-1.5 px-3">
                      {editId === item.id ? (
                        <input
                          type={c.type === 'number' ? 'number' : 'text'}
                          value={editRow[c.key] ?? ''}
                          onChange={e => setEditRow(prev => ({ ...prev, [c.key]: c.type === 'number' ? +e.target.value : e.target.value }))}
                          className="input-odoo text-xs"
                        />
                      ) : (
                        <span>{item[c.key] ?? '—'}</span>
                      )}
                    </td>
                  ))}
                  <td className="py-1.5 px-3 text-right">
                    {editId === item.id ? (
                      <div className="flex justify-end gap-1">
                        <button className="text-success hover:text-success/80 p-1" onClick={handleSaveEdit}>
                          <Check className="h-3.5 w-3.5" />
                        </button>
                        <button className="text-muted-foreground hover:text-foreground p-1" onClick={() => setEditId(null)}>
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex justify-end gap-1">
                        <button className="text-muted-foreground hover:text-foreground p-1" onClick={() => startEdit(item)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button className="text-destructive hover:text-destructive/80 p-1" onClick={() => handleDelete(item.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {/* Add row */}
              <tr className="bg-table-hover">
                {columns.map(c => (
                  <td key={c.key} className="py-1.5 px-3">
                    <input
                      type={c.type === 'number' ? 'number' : 'text'}
                      placeholder={c.label}
                      value={newRow[c.key] ?? ''}
                      onChange={e => setNewRow(prev => ({ ...prev, [c.key]: c.type === 'number' ? +e.target.value : e.target.value }))}
                      className="input-odoo text-xs"
                    />
                  </td>
                ))}
                <td className="py-1.5 px-3 text-right">
                  <button className="text-primary hover:text-primary/80 p-1" onClick={handleAdd}>
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
