import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ClipboardCheck, Plus, Search, Package, Eye } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import SearchableSelect from '@/components/SearchableSelect';
import { fmtDate } from '@/lib/utils';
import { toast } from 'sonner';

const STATUS_BADGE: Record<string, { label: string; variant: 'secondary' | 'default' | 'destructive' | 'outline' }> = {
  pendiente: { label: 'Pendiente', variant: 'secondary' },
  en_proceso: { label: 'En proceso', variant: 'outline' },
  por_aprobar: { label: 'Por aprobar', variant: 'default' },
  aprobada: { label: 'Aprobada', variant: 'default' },
  rechazada: { label: 'Rechazada', variant: 'destructive' },
};

export default function AuditoriasPage() {
  const { empresa, user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [showDialog, setShowDialog] = useState(false);
  const [nombre, setNombre] = useState('');
  const [almacenId, setAlmacenId] = useState('');
  const [notas, setNotas] = useState('');

  const { data: almacenes } = useQuery({
    queryKey: ['almacenes', empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { data } = await supabase.from('almacenes').select('id, nombre').eq('empresa_id', empresa!.id).order('nombre');
      return data ?? [];
    },
  });

  const { data: auditorias, isLoading } = useQuery({
    queryKey: ['auditorias', empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('auditorias')
        .select('*, auditoria_lineas(count)')
        .eq('empresa_id', empresa!.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const almacenOptions = useMemo(() =>
    (almacenes ?? []).map(a => ({ value: a.id, label: a.nombre })),
    [almacenes]
  );

  const filtered = useMemo(() => {
    if (!search) return auditorias ?? [];
    const s = search.toLowerCase();
    return (auditorias ?? []).filter((a: any) => a.nombre?.toLowerCase().includes(s));
  }, [auditorias, search]);

  const crearAuditoria = useMutation({
    mutationFn: async () => {
      if (!nombre) throw new Error('Indica un nombre para la auditoría');
      if (!almacenId) throw new Error('Selecciona un almacén');

      const { data: auditoria, error } = await supabase.from('auditorias').insert({
        empresa_id: empresa!.id,
        nombre,
        filtro_tipo: 'almacen',
        filtro_valor: almacenId,
        notas: notas || null,
        user_id: user!.id,
        status: 'en_proceso',
      } as any).select('id').single();
      if (error) throw error;

      // Fetch active products
      const { data: productos } = await supabase
        .from('productos')
        .select('id, cantidad')
        .eq('empresa_id', empresa!.id)
        .eq('status', 'activo');

      if (!productos?.length) throw new Error('No hay productos activos para auditar');

      // Create empty audit lines (cantidad_real = null, user will fill during conteo)
      const { error: lErr } = await supabase.from('auditoria_lineas').insert(
        productos.map(p => ({
          auditoria_id: auditoria.id,
          producto_id: p.id,
          cantidad_esperada: p.cantidad ?? 0,
        }))
      );
      if (lErr) throw lErr;

      return auditoria;
    },
    onSuccess: (auditoria) => {
      toast.success('Auditoría creada — comienza el conteo');
      qc.invalidateQueries({ queryKey: ['auditorias'] });
      resetForm();
      navigate(`/almacen/auditorias/${auditoria.id}/conteo`);
    },
    onError: (err: any) => toast.error(err.message),
  });

  const resetForm = () => {
    setShowDialog(false);
    setNombre('');
    setAlmacenId('');
    setNotas('');
  };

  return (
    <div className="p-4 space-y-4 min-h-full">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
          <ClipboardCheck className="h-5 w-5" /> Auditorías de inventario
        </h1>
        <Button onClick={() => setShowDialog(true)} className="gap-1.5">
          <Plus className="h-4 w-4" /> Nueva auditoría
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div className="border border-border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Almacén</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead>Líneas</TableHead>
              <TableHead>Status</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Cargando...</TableCell></TableRow>}
            {!isLoading && filtered.length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-12">
                <Package className="h-8 w-8 mx-auto mb-2 opacity-30" /> No hay auditorías
              </TableCell></TableRow>
            )}
            {filtered.map((a: any) => {
              const badge = STATUS_BADGE[a.status] ?? STATUS_BADGE.pendiente;
              const almNombre = almacenes?.find(al => al.id === a.filtro_valor)?.nombre ?? '-';
              const lineasCount = a.auditoria_lineas?.[0]?.count ?? 0;
              return (
                <TableRow key={a.id} className="cursor-pointer" onClick={() => {
                  if (a.status === 'en_proceso') navigate(`/almacen/auditorias/${a.id}/conteo`);
                  else navigate(`/almacen/auditorias/${a.id}/resultados`);
                }}>
                  <TableCell className="font-medium">{a.nombre}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{almNombre}</TableCell>
                  <TableCell className="text-sm">{fmtDate(a.fecha)}</TableCell>
                  <TableCell className="text-sm">{lineasCount}</TableCell>
                  <TableCell><Badge variant={badge.variant}>{badge.label}</Badge></TableCell>
                  <TableCell>
                    <Button size="sm" variant="ghost" className="gap-1">
                      <Eye className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <Dialog open={showDialog} onOpenChange={v => !v && resetForm()}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Nueva auditoría</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nombre</Label>
              <Input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ej: Auditoría semanal almacén central" />
            </div>
            <div>
              <Label>Almacén a auditar</Label>
              <SearchableSelect options={almacenOptions} value={almacenId} onChange={setAlmacenId} placeholder="Seleccionar almacén..." />
            </div>
            <div>
              <Label>Notas (opcional)</Label>
              <Textarea value={notas} onChange={e => setNotas(e.target.value)} rows={2} />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={resetForm}>Cancelar</Button>
              <Button onClick={() => crearAuditoria.mutate()} disabled={crearAuditoria.isPending}>
                {crearAuditoria.isPending ? 'Creando...' : 'Crear y comenzar conteo'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
