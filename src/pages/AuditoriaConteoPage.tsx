import { useState, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Search, Save, Package, Check, Plus, Eye, ChevronDown, ChevronRight, Trash2, User } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import AuditoriaMovimientosModal from '@/components/auditorias/AuditoriaMovimientosModal';

interface ConteoLine {
  id: string;
  producto_id: string;
  codigo: string;
  nombre: string;
  cantidad_esperada: number;
  cantidad_real: number | null;
  contado: boolean;
  created_at: string;
}

interface Entrada {
  id: string;
  cantidad: number;
  user_id: string;
  created_at: string;
  user_nombre?: string;
}

export default function AuditoriaConteoPage() {
  const { id } = useParams<{ id: string }>();
  const { empresa, user, profile } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [modalLine, setModalLine] = useState<ConteoLine | null>(null);
  const [expandedLine, setExpandedLine] = useState<string | null>(null);
  const [addQty, setAddQty] = useState<Record<string, string>>({});

  const { data: auditoria } = useQuery({
    queryKey: ['auditoria', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from('auditorias').select('*').eq('id', id!).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: lineas, isLoading } = useQuery({
    queryKey: ['auditoria-lineas', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('auditoria_lineas')
        .select('*, productos(codigo, nombre)')
        .eq('auditoria_id', id!)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []).map((l: any) => ({
        id: l.id,
        producto_id: l.producto_id,
        codigo: l.productos?.codigo ?? '',
        nombre: l.productos?.nombre ?? '',
        cantidad_esperada: l.cantidad_esperada,
        cantidad_real: l.cantidad_real,
        contado: l.cantidad_real !== null,
        created_at: l.created_at,
      })) as ConteoLine[];
    },
    structuralSharing: true,
  });

  const lineaIds = useMemo(() => (lineas ?? []).map(l => l.id), [lineas]);

  // Fetch all entries for this audit
  const { data: entradas, refetch: refetchEntradas } = useQuery({
    queryKey: ['auditoria-entradas', id, lineaIds],
    enabled: !!id && lineaIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('auditoria_entradas')
        .select('*')
        .in('auditoria_linea_id', lineaIds)
        .order('created_at', { ascending: true });
      if (error) throw error;
      // Group by linea_id
      const map: Record<string, Entrada[]> = {};
      (data ?? []).forEach((e: any) => {
        if (!map[e.auditoria_linea_id]) map[e.auditoria_linea_id] = [];
        map[e.auditoria_linea_id].push({
          id: e.id,
          cantidad: Number(e.cantidad),
          user_id: e.user_id,
          created_at: e.created_at,
        });
      });
      return map;
    },
  });

  // Compute totals from entries
  const entradaTotals = useMemo(() => {
    const map: Record<string, number> = {};
    if (!entradas) return map;
    for (const [lineaId, items] of Object.entries(entradas)) {
      map[lineaId] = items.reduce((sum, e) => sum + e.cantidad, 0);
    }
    return map;
  }, [entradas]);

  const filtered = useMemo(() => {
    const all = lineas ?? [];
    if (!search) return all;
    const s = search.toLowerCase();
    return all.filter(l =>
      l.codigo.toLowerCase().includes(s) || l.nombre.toLowerCase().includes(s)
    );
  }, [lineas, search]);

  const totalLineas = (lineas ?? []).length;
  const contadas = (lineas ?? []).filter(l => (entradaTotals[l.id] ?? 0) > 0).length;

  // Add entry mutation
  const addEntry = useMutation({
    mutationFn: async ({ lineaId, cantidad }: { lineaId: string; cantidad: number }) => {
      const { data: inserted, error } = await supabase.from('auditoria_entradas').insert({
        auditoria_linea_id: lineaId,
        cantidad,
        user_id: user!.id,
      } as any).select().single();
      if (error) throw error;
      // Update cantidad_real on the line
      const newTotal = (entradaTotals[lineaId] ?? 0) + cantidad;
      const linea = lineas?.find(l => l.id === lineaId);
      const dif = newTotal - (linea?.cantidad_esperada ?? 0);
      await supabase.from('auditoria_lineas').update({
        cantidad_real: newTotal,
        diferencia: dif,
      } as any).eq('id', lineaId);
      return inserted;
    },
    onSuccess: (_, { lineaId, cantidad }) => {
      toast.success(`+${cantidad} registrado`);
      refetchEntradas();
      setAddQty(prev => ({ ...prev, [lineaId]: '' }));
    },
    onError: (err: any) => toast.error(err.message),
  });

  // Delete entry mutation
  const deleteEntry = useMutation({
    mutationFn: async ({ entryId, lineaId }: { entryId: string; lineaId: string }) => {
      const { error } = await supabase.from('auditoria_entradas').delete().eq('id', entryId);
      if (error) throw error;
      // Recalculate total
      const remaining = (entradas?.[lineaId] ?? []).filter(e => e.id !== entryId);
      const newTotal = remaining.reduce((s, e) => s + e.cantidad, 0);
      const linea = lineas?.find(l => l.id === lineaId);
      await supabase.from('auditoria_lineas').update({
        cantidad_real: newTotal || null,
        diferencia: newTotal - (linea?.cantidad_esperada ?? 0),
      } as any).eq('id', lineaId);
    },
    onSuccess: () => {
      refetchEntradas();
      toast.success('Entrada eliminada');
    },
    onError: (err: any) => toast.error(err.message),
  });

  const handleAddEntry = (lineaId: string) => {
    const qty = Number(addQty[lineaId] || 1);
    if (qty <= 0) return;
    addEntry.mutate({ lineaId, cantidad: qty });
  };

  const handleFinalizarConteo = async () => {
    await supabase.from('auditorias').update({ status: 'por_aprobar' } as any).eq('id', id!);
    qc.invalidateQueries({ queryKey: ['auditorias'] });
    toast.success('Conteo finalizado — revisa los resultados');
    navigate(`/almacen/auditorias/${id}/resultados`);
  };

  const STATUS_LABEL: Record<string, { label: string; variant: 'secondary' | 'default' | 'destructive' | 'outline' }> = {
    pendiente: { label: 'Pendiente', variant: 'secondary' },
    en_proceso: { label: 'En proceso', variant: 'outline' },
    por_aprobar: { label: 'Por aprobar', variant: 'default' },
  };

  const fmtDt = (d: string | null | undefined) => {
    if (!d) return '—';
    try { return format(new Date(d), "dd/MM/yyyy HH:mm", { locale: es }); } catch { return '—'; }
  };

  return (
    <div className="min-h-full flex flex-col">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background border-b border-border p-3 space-y-2">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => navigate('/almacen/auditorias')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-semibold truncate">{auditoria?.nombre ?? 'Conteo'}</h1>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span>Apertura: {fmtDt(auditoria?.created_at)}</span>
              <span>•</span>
              <span>{contadas}/{totalLineas} contados</span>
              {auditoria?.status && (
                <>
                  <span>•</span>
                  <Badge variant={STATUS_LABEL[auditoria.status]?.variant ?? 'secondary'} className="text-[10px] h-5">
                    {STATUS_LABEL[auditoria.status]?.label ?? auditoria.status}
                  </Badge>
                </>
              )}
            </div>
          </div>
          <Badge variant={contadas === totalLineas ? 'default' : 'secondary'}>
            {Math.round((contadas / Math.max(totalLineas, 1)) * 100)}%
          </Badge>
        </div>

        <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-300"
            style={{ width: `${(contadas / Math.max(totalLineas, 1)) * 100}%` }}
          />
        </div>

        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar producto..." className="pl-9 h-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {isLoading && (
          <div className="p-8 text-center text-muted-foreground">Cargando productos...</div>
        )}

        {!isLoading && filtered.length === 0 && (
          <div className="p-8 text-center text-muted-foreground">
            <Package className="h-8 w-8 mx-auto mb-2 opacity-30" />
            {search ? 'Sin resultados' : 'No hay productos'}
          </div>
        )}

        {!isLoading && filtered.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[30px]"></TableHead>
                <TableHead>Producto</TableHead>
                <TableHead>Código</TableHead>
                <TableHead className="w-[140px]">Apertura</TableHead>
                <TableHead className="w-[140px]">Cierre</TableHead>
                <TableHead className="w-[80px] text-center">Esperado</TableHead>
                <TableHead className="w-[80px] text-center">Contado</TableHead>
                <TableHead className="w-[200px] text-center">Agregar</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(line => {
                const total = entradaTotals[line.id] ?? 0;
                const lineEntries = entradas?.[line.id] ?? [];
                const isExpanded = expandedLine === line.id;
                const qtyVal = addQty[line.id] ?? '';

                return (
                  <>
                    <TableRow
                      key={line.id}
                      className={cn(
                        'cursor-pointer',
                        total > 0 && 'bg-muted/30',
                      )}
                      onClick={() => setExpandedLine(isExpanded ? null : line.id)}
                    >
                      <TableCell className="px-2">
                        {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </TableCell>
                      <TableCell className="text-sm font-medium">{line.nombre}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{line.codigo}</TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {fmtDt(line.created_at)}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">—</TableCell>
                      <TableCell className="text-center font-mono text-sm">{line.cantidad_esperada}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant={total > 0 ? 'default' : 'secondary'} className="font-mono">
                          {total}
                        </Badge>
                      </TableCell>
                      <TableCell onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-1">
                          <Input
                            type="number"
                            className="w-16 h-7 text-center font-mono text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            value={qtyVal}
                            placeholder="1"
                            min={1}
                            onChange={e => setAddQty(prev => ({ ...prev, [line.id]: e.target.value }))}
                            onKeyDown={e => { if (e.key === 'Enter') handleAddEntry(line.id); }}
                          />
                          <Button
                            size="sm"
                            className="h-7 gap-1 px-2"
                            disabled={addEntry.isPending}
                            onClick={() => handleAddEntry(line.id)}
                          >
                            <Plus className="h-3 w-3" /> Agregar
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell onClick={e => e.stopPropagation()}>
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setModalLine(line)}>
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>

                    {/* Expanded entries */}
                    {isExpanded && (
                      <TableRow key={`${line.id}-entries`} className="bg-background hover:bg-background">
                        <TableCell colSpan={9} className="p-0 bg-background">
                          <div className="px-8 py-2">
                            {lineEntries.length === 0 ? (
                              <p className="text-xs text-muted-foreground py-2">Sin entradas aún</p>
                            ) : (
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="text-xs text-muted-foreground border-b">
                                    <th className="text-left py-1 font-medium">#</th>
                                    <th className="text-left py-1 font-medium">Fecha / Hora</th>
                                    <th className="text-left py-1 font-medium">Usuario</th>
                                    <th className="text-right py-1 font-medium">Cantidad</th>
                                    <th className="text-right py-1 font-medium">Acumulado</th>
                                    <th className="w-8"></th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {lineEntries.map((entry, idx) => {
                                    const acum = lineEntries.slice(0, idx + 1).reduce((s, e) => s + e.cantidad, 0);
                                    return (
                                      <tr key={entry.id} className="border-b border-border/50 last:border-0">
                                        <td className="py-1.5 text-xs text-muted-foreground">{idx + 1}</td>
                                        <td className="py-1.5 text-xs">{fmtDt(entry.created_at)}</td>
                                        <td className="py-1.5 text-xs flex items-center gap-1">
                                          <User className="h-3 w-3 text-muted-foreground" />
                                          {entry.user_id === user?.id ? (profile?.nombre ?? 'Yo') : entry.user_id.slice(0, 8)}
                                        </td>
                                        <td className="py-1.5 text-right font-mono font-medium">+{entry.cantidad}</td>
                                        <td className="py-1.5 text-right font-mono text-muted-foreground">{acum}</td>
                                        <td className="py-1.5 text-right">
                                          <Button
                                            size="icon"
                                            variant="ghost"
                                            className="h-6 w-6 text-destructive hover:text-destructive"
                                            onClick={() => deleteEntry.mutate({ entryId: entry.id, lineaId: line.id })}
                                          >
                                            <Trash2 className="h-3 w-3" />
                                          </Button>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                                <tfoot>
                                  <tr className="font-medium">
                                    <td colSpan={3} className="py-1.5 text-xs">Total</td>
                                    <td className="py-1.5 text-right font-mono">{total}</td>
                                    <td></td>
                                    <td></td>
                                  </tr>
                                </tfoot>
                              </table>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Bottom action bar */}
      <div className="sticky bottom-0 bg-background border-t border-border p-3 flex gap-2">
        <Button variant="outline" className="flex-1" onClick={() => navigate('/almacen/auditorias')}>
          Volver al listado
        </Button>
        <Button className="flex-1" onClick={handleFinalizarConteo} disabled={saving || contadas === 0}>
          Finalizar conteo
        </Button>
      </div>

      {modalLine && auditoria && (
        <AuditoriaMovimientosModal
          open={!!modalLine}
          onOpenChange={(v) => !v && setModalLine(null)}
          productoId={modalLine.producto_id}
          productoNombre={modalLine.nombre}
          productoCodigo={modalLine.codigo}
          cantidadEsperada={modalLine.cantidad_esperada}
          apertura={auditoria.created_at}
          cierre={null}
        />
      )}
    </div>
  );
}
