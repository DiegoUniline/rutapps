import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { InlineEditCell } from '@/components/InlineEditCell';
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

  // Inline save a single field
  const handleInlineSave = async (id: string, field: string, val: string, type?: string) => {
    try {
      const updateVal = type === 'number' ? Number(val) : val;
      const { error } = await (supabase.from as any)(tableName).update({ [field]: updateVal }).eq('id', id);
      if (error) throw error;
      // Optimistic: update local cache
      qc.setQueryData([queryKey], (old: any[] | undefined) =>
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
                <th className="th-odoo w-16 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {items?.map(item => (
                <tr key={item.id} className="border-b border-table-border last:border-0 hover:bg-table-hover transition-colors group">
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
                      className="text-muted-foreground hover:text-destructive p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => handleDelete(item.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
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
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
