import { useState, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ClipboardCheck, Plus, Search, Package, Check, X, ChevronDown, ChevronUp } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import SearchableSelect from '@/components/SearchableSelect';
import { fmtDate, cn } from '@/lib/utils';
import { toast } from 'sonner';

const STATUS_BADGE: Record<string, { label: string; variant: 'secondary' | 'default' | 'destructive' | 'outline' }> = {
  pendiente: { label: 'Pendiente', variant: 'secondary' },
  en_proceso: { label: 'En proceso', variant: 'outline' },
  por_aprobar: { label: 'Por aprobar', variant: 'default' },
  aprobada: { label: 'Aprobada', variant: 'default' },
  rechazada: { label: 'Rechazada', variant: 'destructive' },
};

const FILTRO_TIPOS = [
  { value: 'todos', label: 'Todos los productos' },
  { value: 'marca', label: 'Por marca' },
  { value: 'clasificacion', label: 'Por clasificación' },
  { value: 'vendedor', label: 'Por ruta (vendedor)' },
];

export default function AuditoriasPage() {
  const { empresa, user } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [showDialog, setShowDialog] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [nombre, setNombre] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('todos');
  const [filtroValor, setFiltroValor] = useState('');
  const [notas, setNotas] = useState('');

  const { data: auditorias, isLoading } = useQuery({
    queryKey: ['auditorias', empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('auditorias')
        .select('*')
        .eq('empresa_id', empresa!.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: auditoriaLineas } = useQuery({
    queryKey: ['auditoria-lineas', expandedId],
    enabled: !!expandedId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('auditoria_lineas')
        .select('*, productos(codigo, nombre)')
        .eq('auditoria_id', expandedId!)
        .order('created_at');
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: marcas } = useQuery({
    queryKey: ['marcas', empresa?.id],
    enabled: !!empresa?.id && filtroTipo === 'marca',
    queryFn: async () => {
      const { data } = await supabase.from('marcas').select('id, nombre').eq('empresa_id', empresa!.id).order('nombre');
      return data ?? [];
    },
  });

  const { data: clasificaciones } = useQuery({
    queryKey: ['clasificaciones', empresa?.id],
    enabled: !!empresa?.id && filtroTipo === 'clasificacion',
    queryFn: async () => {
      const { data } = await supabase.from('clasificaciones').select('id, nombre').eq('empresa_id', empresa!.id).order('nombre');
      return data ?? [];
    },
  });

  const { data: vendedores } = useQuery({
    queryKey: ['vendedores-list', empresa?.id],
    enabled: !!empresa?.id && filtroTipo === 'vendedor',
    queryFn: async () => {
      const { data } = await supabase.from('vendedores').select('id, nombre').eq('empresa_id', empresa!.id).order('nombre');
      return data ?? [];
    },
  });

  const filtroOptions = useMemo(() => {
    if (filtroTipo === 'marca') return (marcas ?? []).map(m => ({ value: m.id, label: m.nombre }));
    if (filtroTipo === 'clasificacion') return (clasificaciones ?? []).map(c => ({ value: c.id, label: c.nombre }));
    if (filtroTipo === 'vendedor') return (vendedores ?? []).map(v => ({ value: v.id, label: v.nombre }));
    return [];
  }, [filtroTipo, marcas, clasificaciones, vendedores]);

  const filtered = useMemo(() => {
    if (!search) return auditorias ?? [];
    const s = search.toLowerCase();
    return (auditorias ?? []).filter((a: any) => a.nombre?.toLowerCase().includes(s));
  }, [auditorias, search]);

  const crearAuditoria = useMutation({
    mutationFn: async () => {
      if (!nombre) throw new Error('Indica un nombre para la auditoría');

      // Create audit
      const { data: auditoria, error } = await supabase.from('auditorias').insert({
        empresa_id: empresa!.id,
        nombre,
        filtro_tipo: filtroTipo,
        filtro_valor: filtroValor || null,
        notas: notas || null,
        user_id: user!.id,
        status: 'en_proceso',
      } as any).select('id').single();
      if (error) throw error;

      // Fetch products based on filter
      let q = supabase.from('productos').select('id, cantidad').eq('empresa_id', empresa!.id).eq('status', 'activo');
      if (filtroTipo === 'marca' && filtroValor) q = q.eq('marca_id', filtroValor);
      if (filtroTipo === 'clasificacion' && filtroValor) q = q.eq('clasificacion_id', filtroValor);

      const { data: productos } = await q;

      let productList = productos ?? [];

      // For vendedor filter, use stock_camion
      if (filtroTipo === 'vendedor' && filtroValor) {
        const { data: sc } = await supabase.from('stock_camion')
          .select('producto_id, cantidad_actual')
          .eq('vendedor_id', filtroValor)
          .gt('cantidad_actual', 0);
        productList = (sc ?? []).map(s => ({ id: s.producto_id, cantidad: s.cantidad_actual }));
      }

      if (productList.length === 0) throw new Error('No hay productos para auditar con este filtro');

      // Create audit lines
      const { error: lErr } = await supabase.from('auditoria_lineas').insert(
        productList.map(p => ({
          auditoria_id: auditoria.id,
          producto_id: p.id,
          cantidad_esperada: p.cantidad ?? 0,
        }))
      );
      if (lErr) throw lErr;

      return auditoria;
    },
    onSuccess: () => {
      toast.success('Auditoría creada — registra las cantidades reales');
      qc.invalidateQueries({ queryKey: ['auditorias'] });
      resetForm();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const updateLineaReal = async (lineaId: string, cantidadReal: number, esperada: number) => {
    await supabase.from('auditoria_lineas').update({
      cantidad_real: cantidadReal,
      diferencia: cantidadReal - esperada,
    } as any).eq('id', lineaId);
    qc.invalidateQueries({ queryKey: ['auditoria-lineas', expandedId] });
  };

  const enviarAprobacion = useMutation({
    mutationFn: async (auditoriaId: string) => {
      await supabase.from('auditorias').update({ status: 'por_aprobar' } as any).eq('id', auditoriaId);
    },
    onSuccess: () => {
      toast.success('Auditoría enviada a aprobación');
      qc.invalidateQueries({ queryKey: ['auditorias'] });
    },
  });

  const aprobarAuditoria = useMutation({
    mutationFn: async (auditoriaId: string) => {
      // Get lines with differences
      const { data: lineas } = await supabase
        .from('auditoria_lineas')
        .select('*')
        .eq('auditoria_id', auditoriaId)
        .not('cantidad_real', 'is', null);

      const today = new Date().toISOString().slice(0, 10);

      for (const l of lineas ?? []) {
        if (l.cantidad_real === null || l.cantidad_real === l.cantidad_esperada) continue;
        const diff = l.cantidad_real - l.cantidad_esperada;

        // Update product stock
        await supabase.from('productos').update({ cantidad: l.cantidad_real } as any).eq('id', l.producto_id);

        // Log movement
        await supabase.from('movimientos_inventario').insert({
          empresa_id: empresa!.id,
          tipo: diff > 0 ? 'entrada' : 'salida',
          producto_id: l.producto_id,
          cantidad: Math.abs(diff),
          referencia_tipo: 'auditoria',
          referencia_id: auditoriaId,
          user_id: user?.id,
          fecha: today,
          notas: 'Ajuste por auditoría',
        } as any);

        // Mark as adjusted
        await supabase.from('auditoria_lineas').update({ ajustado: true } as any).eq('id', l.id);
      }

      await supabase.from('auditorias').update({
        status: 'aprobada',
        aprobado_por: user?.id,
        fecha_aprobacion: new Date().toISOString(),
      } as any).eq('id', auditoriaId);
    },
    onSuccess: () => {
      toast.success('Auditoría aprobada — stock ajustado');
      qc.invalidateQueries({ queryKey: ['auditorias'] });
      qc.invalidateQueries({ queryKey: ['auditoria-lineas'] });
      qc.invalidateQueries({ queryKey: ['productos'] });
      qc.invalidateQueries({ queryKey: ['movimientos'] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const rechazarAuditoria = useMutation({
    mutationFn: async (auditoriaId: string) => {
      await supabase.from('auditorias').update({ status: 'rechazada' } as any).eq('id', auditoriaId);
    },
    onSuccess: () => {
      toast.success('Auditoría rechazada');
      qc.invalidateQueries({ queryKey: ['auditorias'] });
    },
  });

  const resetForm = () => {
    setShowDialog(false);
    setNombre('');
    setFiltroTipo('todos');
    setFiltroValor('');
    setNotas('');
  };

  return (
    <div className="p-4 space-y-4 min-h-full">
      <div className="flex items-center justify-between">
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
              <TableHead></TableHead>
              <TableHead>Nombre</TableHead>
              <TableHead>Filtro</TableHead>
              <TableHead>Fecha</TableHead>
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
              const isExpanded = expandedId === a.id;
              return (
                <>
                  <TableRow key={a.id} className="cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : a.id)}>
                    <TableCell className="w-8">
                      {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </TableCell>
                    <TableCell className="font-medium">{a.nombre}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {FILTRO_TIPOS.find(f => f.value === a.filtro_tipo)?.label ?? a.filtro_tipo}
                    </TableCell>
                    <TableCell className="text-xs">{fmtDate(a.fecha)}</TableCell>
                    <TableCell><Badge variant={badge.variant}>{badge.label}</Badge></TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-1 justify-end" onClick={e => e.stopPropagation()}>
                        {a.status === 'en_proceso' && (
                          <Button size="sm" variant="outline" onClick={() => enviarAprobacion.mutate(a.id)}>
                            Enviar a aprobación
                          </Button>
                        )}
                        {a.status === 'por_aprobar' && (
                          <>
                            <Button size="sm" onClick={() => aprobarAuditoria.mutate(a.id)} disabled={aprobarAuditoria.isPending} className="gap-1">
                              <Check className="h-3 w-3" /> Aprobar
                            </Button>
                            <Button size="sm" variant="destructive" onClick={() => rechazarAuditoria.mutate(a.id)} className="gap-1">
                              <X className="h-3 w-3" /> Rechazar
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                  {isExpanded && (
                    <TableRow key={a.id + '-detail'}>
                      <TableCell colSpan={6} className="bg-muted/30 p-0">
                        <div className="p-4">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Producto</TableHead>
                                <TableHead className="text-right">Esperada</TableHead>
                                <TableHead className="text-right">Real</TableHead>
                                <TableHead className="text-right">Diferencia</TableHead>
                                <TableHead className="text-center">Ajustado</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {(auditoriaLineas ?? []).map((l: any) => (
                                <TableRow key={l.id}>
                                  <TableCell className="text-sm">{l.productos?.codigo} - {l.productos?.nombre}</TableCell>
                                  <TableCell className="text-right font-mono text-sm">{l.cantidad_esperada}</TableCell>
                                  <TableCell className="text-right">
                                    {a.status === 'en_proceso' ? (
                                      <Input type="number" className="w-20 h-8 text-right ml-auto"
                                        defaultValue={l.cantidad_real ?? ''}
                                        onBlur={e => updateLineaReal(l.id, Number(e.target.value), l.cantidad_esperada)} />
                                    ) : (
                                      <span className="font-mono text-sm">{l.cantidad_real ?? '-'}</span>
                                    )}
                                  </TableCell>
                                  <TableCell className={cn('text-right font-mono text-sm font-semibold',
                                    l.diferencia > 0 ? 'text-green-600' : l.diferencia < 0 ? 'text-destructive' : '')}>
                                    {l.cantidad_real !== null ? (l.diferencia > 0 ? '+' : '') + l.diferencia : '-'}
                                  </TableCell>
                                  <TableCell className="text-center">
                                    {l.ajustado ? <Check className="h-4 w-4 text-green-600 mx-auto" /> : '-'}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Dialog nueva auditoría */}
      <Dialog open={showDialog} onOpenChange={v => !v && resetForm()}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Nueva auditoría</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nombre</Label>
              <Input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ej: Auditoría semanal marca X" />
            </div>

            <div>
              <Label>Filtrar productos por</Label>
              <SearchableSelect
                options={FILTRO_TIPOS}
                value={filtroTipo}
                onChange={v => { setFiltroTipo(v); setFiltroValor(''); }}
                placeholder="Seleccionar..."
              />
            </div>

            {filtroTipo !== 'todos' && filtroOptions.length > 0 && (
              <div>
                <Label>{filtroTipo === 'marca' ? 'Marca' : filtroTipo === 'clasificacion' ? 'Clasificación' : 'Vendedor/Ruta'}</Label>
                <SearchableSelect options={filtroOptions} value={filtroValor} onChange={setFiltroValor} placeholder="Seleccionar..." />
              </div>
            )}

            <div>
              <Label>Notas</Label>
              <Textarea value={notas} onChange={e => setNotas(e.target.value)} rows={2} />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={resetForm}>Cancelar</Button>
              <Button onClick={() => crearAuditoria.mutate()} disabled={crearAuditoria.isPending}>
                {crearAuditoria.isPending ? 'Creando...' : 'Crear auditoría'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
