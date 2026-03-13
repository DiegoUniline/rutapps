import { useState } from 'react';
import { Plus, Trash2, Pencil, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
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
      const { error } = await supabase.from(tableName).delete().eq('id', id);
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
      const { error } = await supabase.from(tableName).update(editRow).eq('id', editId);
      if (error) throw error;
      setEditId(null);
      qc.invalidateQueries({ queryKey: [queryKey] });
      toast.success('Actualizado');
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  return (
    <div className="space-y-4">
      <div className="section-card overflow-x-auto">
        {isLoading ? (
          <TableSkeleton rows={4} cols={columns.length + 1} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                {columns.map(c => (
                  <TableHead key={c.key}>{c.label}</TableHead>
                ))}
                <TableHead className="w-24 text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items?.map(item => (
                <TableRow key={item.id}>
                  {columns.map(c => (
                    <TableCell key={c.key}>
                      {editId === item.id ? (
                        <Input
                          type={c.type === 'number' ? 'number' : 'text'}
                          value={editRow[c.key] ?? ''}
                          onChange={e => setEditRow(prev => ({ ...prev, [c.key]: c.type === 'number' ? +e.target.value : e.target.value }))}
                          className="h-8 text-sm"
                        />
                      ) : (
                        <span className="text-sm">{item[c.key] ?? '—'}</span>
                      )}
                    </TableCell>
                  ))}
                  <TableCell className="text-right">
                    {editId === item.id ? (
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-success" onClick={handleSaveEdit}>
                          <Check className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditId(null)}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ) : (
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(item)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(item.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {/* Add row */}
              <TableRow>
                {columns.map(c => (
                  <TableCell key={c.key}>
                    <Input
                      type={c.type === 'number' ? 'number' : 'text'}
                      placeholder={c.label}
                      value={newRow[c.key] ?? ''}
                      onChange={e => setNewRow(prev => ({ ...prev, [c.key]: c.type === 'number' ? +e.target.value : e.target.value }))}
                      className="h-8 text-sm"
                    />
                  </TableCell>
                ))}
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-accent" onClick={handleAdd}>
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
