import { useState, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Search, Save, Package, Check, Minus, Plus, Eye } from 'lucide-react';
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

export default function AuditoriaConteoPage() {
  const { id } = useParams<{ id: string }>();
  const { empresa } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [conteos, setConteos] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const [modalLine, setModalLine] = useState<ConteoLine | null>(null);

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
        .order('created_at');
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
  });

  const mergedLines = useMemo(() => {
    return (lineas ?? []).map(l => ({
      ...l,
      cantidad_real: conteos[l.id] !== undefined ? conteos[l.id] : l.cantidad_real,
      contado: conteos[l.id] !== undefined || l.contado,
    }));
  }, [lineas, conteos]);

  const filtered = useMemo(() => {
    if (!search) return mergedLines;
    const s = search.toLowerCase();
    return mergedLines.filter(l =>
      l.codigo.toLowerCase().includes(s) || l.nombre.toLowerCase().includes(s)
    );
  }, [mergedLines, search]);

  const totalLineas = mergedLines.length;
  const contadas = mergedLines.filter(l => l.contado).length;

  const setConteo = useCallback((lineaId: string, val: number) => {
    setConteos(prev => ({ ...prev, [lineaId]: Math.max(0, val) }));
  }, []);

  const handleGuardar = async () => {
    if (Object.keys(conteos).length === 0) {
      toast.error('No has registrado ningún conteo');
      return;
    }
    setSaving(true);
    try {
      for (const [lineaId, cantidadReal] of Object.entries(conteos)) {
        const linea = lineas?.find(l => l.id === lineaId);
        if (!linea) continue;
        const diferencia = cantidadReal - linea.cantidad_esperada;
        await supabase.from('auditoria_lineas').update({
          cantidad_real: cantidadReal,
          diferencia,
        } as any).eq('id', lineaId);
      }
      toast.success('Conteo guardado correctamente');
      qc.invalidateQueries({ queryKey: ['auditoria-lineas', id] });
      setConteos({});
      const allCounted = mergedLines.every(l => l.contado);
      if (allCounted) {
        navigate(`/almacen/auditorias/${id}/resultados`);
      }
    } catch (err: any) {
      toast.error(err.message ?? 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const handleFinalizarConteo = async () => {
    if (Object.keys(conteos).length > 0) {
      await handleGuardar();
    }
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

        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar producto..." className="pl-9 h-9" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <Button size="sm" onClick={handleGuardar} disabled={saving || Object.keys(conteos).length === 0} className="gap-1">
            <Save className="h-4 w-4" /> Guardar
          </Button>
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
                <TableHead>Producto</TableHead>
                <TableHead>Código</TableHead>
                <TableHead className="w-[140px]">Apertura</TableHead>
                <TableHead className="w-[140px]">Cierre</TableHead>
                <TableHead className="w-[80px] text-center">Esperado</TableHead>
                <TableHead className="w-[80px] text-center">Estado</TableHead>
                <TableHead className="w-[160px] text-center">Conteo</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(line => {
                const currentVal = conteos[line.id] !== undefined ? conteos[line.id] : line.cantidad_real;
                const hasLocalChange = conteos[line.id] !== undefined;
                return (
                  <TableRow
                    key={line.id}
                    className={cn(
                      line.contado && !hasLocalChange && 'bg-muted/30',
                      hasLocalChange && 'bg-accent/20'
                    )}
                  >
                    <TableCell className="text-sm font-medium">{line.nombre}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{line.codigo}</TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {fmtDt(line.created_at)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      —
                    </TableCell>
                    <TableCell className="text-center font-mono text-sm">
                      {line.cantidad_esperada}
                    </TableCell>
                    <TableCell className="text-center">
                      {line.contado && !hasLocalChange ? (
                        <Check className="h-4 w-4 text-green-600 mx-auto" />
                      ) : hasLocalChange ? (
                        <Badge variant="outline" className="text-[10px]">Editado</Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[10px]">Pendiente</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-center gap-1">
                        <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => setConteo(line.id, (currentVal ?? 0) - 1)}>
                          <Minus className="h-3 w-3" />
                        </Button>
                        <Input
                          type="number"
                          className="w-14 h-7 text-center font-mono text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          value={currentVal ?? ''}
                          placeholder="0"
                          onChange={e => setConteo(line.id, Number(e.target.value) || 0)}
                        />
                        <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => setConteo(line.id, (currentVal ?? 0) + 1)}>
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); setModalLine(line); }}>
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
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
    </div>
  );
}