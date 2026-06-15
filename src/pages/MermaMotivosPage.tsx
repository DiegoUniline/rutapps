import { useState } from 'react';
import { useMermaMotivos, useUpsertMermaMotivo, useDeleteMermaMotivo } from '@/hooks/useMermas';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, Trash2, Pencil, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import { usePermisos } from '@/hooks/usePermisos';
import { confirmDialog } from '@/lib/confirm';

export default function MermaMotivosPage() {
  const { isOwner, loading: permisosLoading } = usePermisos();
  const { data: motivos, isLoading } = useMermaMotivos();
  const upsert = useUpsertMermaMotivo();
  const del = useDeleteMermaMotivo();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | undefined>();
  const [nombre, setNombre] = useState('');

  const openNew = () => { setEditingId(undefined); setNombre(''); setOpen(true); };
  const openEdit = (m: any) => { setEditingId(m.id); setNombre(m.nombre); setOpen(true); };

  const submit = async () => {
    if (!nombre.trim()) return toast.error('Nombre requerido');
    try {
      await upsert.mutateAsync({ id: editingId, nombre: nombre.trim() });
      toast.success(editingId ? 'Motivo actualizado' : 'Motivo creado');
      setOpen(false);
    } catch (e: any) {
      toast.error(e.message || 'Error');
    }
  };

  if (!permisosLoading && !isOwner) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-sm text-muted-foreground p-6 text-center">
        Acceso restringido al administrador.
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 space-y-4 bg-background min-h-[100dvh]">
      <div className="flex items-center gap-2">
        <Link to="/almacen/mermas"><Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button></Link>
        <h1 className="text-2xl font-bold">Motivos de merma</h1>
        <div className="ml-auto">
          <Button onClick={openNew}><Plus className="h-4 w-4 mr-1" /> Nuevo motivo</Button>
        </div>
      </div>
      <div className="bg-card border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead className="w-32 text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={2} className="text-center py-8">Cargando…</TableCell></TableRow>
            ) : (motivos ?? []).length === 0 ? (
              <TableRow><TableCell colSpan={2} className="text-center py-8 text-muted-foreground">Sin motivos</TableCell></TableRow>
            ) : (motivos ?? []).map((m: any) => (
              <TableRow key={m.id}>
                <TableCell>{m.nombre}</TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(m)}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={async () => {
                    if (await confirmDialog(`¿Eliminar motivo "${m.nombre}"?`)) del.mutate(m.id);
                  }}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingId ? 'Editar motivo' : 'Nuevo motivo'}</DialogTitle></DialogHeader>
          <div>
            <Label>Nombre</Label>
            <Input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ej. Caducado" autoFocus />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={submit} disabled={upsert.isPending}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
