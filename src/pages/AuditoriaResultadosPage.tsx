import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Check, X, AlertTriangle, TrendingUp, TrendingDown, Equal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { cn, fmtDate } from '@/lib/utils';
import { toast } from 'sonner';
import { useIsMobile } from '@/hooks/use-mobile';

const STATUS_BADGE: Record<string, { label: string; variant: 'secondary' | 'default' | 'destructive' | 'outline' }> = {
  pendiente: { label: 'Pendiente', variant: 'secondary' },
  en_proceso: { label: 'En proceso', variant: 'outline' },
  por_aprobar: { label: 'Por aprobar', variant: 'default' },
  aprobada: { label: 'Aprobada', variant: 'default' },
  rechazada: { label: 'Rechazada', variant: 'destructive' },
};

interface AjusteSelection {
  [lineaId: string]: { ajustar: boolean; motivo: string };
}

export default function AuditoriaResultadosPage() {
  const { id } = useParams<{ id: string }>();
  const { empresa, user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const isMobile = useIsMobile();
  const [showAprobar, setShowAprobar] = useState(false);
  const [ajustes, setAjustes] = useState<AjusteSelection>({});
  const [motivoGlobal, setMotivoGlobal] = useState('');

  const { data: auditoria } = useQuery({
    queryKey: ['auditoria', id],
    enabled: !!id,
    queryFn: async () => {
      const { data } = await supabase.from('auditorias').select('*').eq('id', id!).single();
      return data;
    },
  });

  const { data: lineas } = useQuery({
    queryKey: ['auditoria-lineas', id],
    enabled: !!id,
    queryFn: async () => {
      const { data } = await supabase
        .from('auditoria_lineas')
        .select('*, productos(codigo, nombre)')
        .eq('auditoria_id', id!)
        .order('created_at');
      return data ?? [];
    },
  });

  const { data: almacenes } = useQuery({
    queryKey: ['almacenes', empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { data } = await supabase.from('almacenes').select('id, nombre').eq('empresa_id', empresa!.id);
      return data ?? [];
    },
  });

  const almacenNombre = almacenes?.find(a => a.id === auditoria?.filtro_valor)?.nombre ?? '-';

  const stats = useMemo(() => {
    const items = lineas ?? [];
    const contadas = items.filter((l: any) => l.cantidad_real !== null);
    const faltantes = contadas.filter((l: any) => l.diferencia < 0);
    const excedentes = contadas.filter((l: any) => l.diferencia > 0);
    const iguales = contadas.filter((l: any) => l.diferencia === 0);
    return { total: items.length, contadas: contadas.length, faltantes, excedentes, iguales };
  }, [lineas]);

  // Init ajustes when opening dialog
  const initAjustes = () => {
    const sel: AjusteSelection = {};
    (lineas ?? []).forEach((l: any) => {
      if (l.cantidad_real !== null && l.diferencia !== 0) {
        sel[l.id] = { ajustar: true, motivo: '' };
      }
    });
    setAjustes(sel);
    setMotivoGlobal('');
    setShowAprobar(true);
  };

  const aprobarAuditoria = useMutation({
    mutationFn: async () => {
      const today = new Date().toISOString().slice(0, 10);

      for (const [lineaId, config] of Object.entries(ajustes)) {
        if (!config.ajustar) continue;
        const linea = (lineas ?? []).find((l: any) => l.id === lineaId) as any;
        if (!linea || linea.cantidad_real === null) continue;

        const diff = linea.cantidad_real - linea.cantidad_esperada;
        const motivo = config.motivo || motivoGlobal || 'Ajuste por auditoría';

        // Update product stock
        await supabase.from('productos').update({ cantidad: linea.cantidad_real } as any).eq('id', linea.producto_id);

        // Log movement
        await supabase.from('movimientos_inventario').insert({
          empresa_id: empresa!.id,
          tipo: diff > 0 ? 'entrada' : 'salida',
          producto_id: linea.producto_id,
          cantidad: Math.abs(diff),
          referencia_tipo: 'auditoria',
          referencia_id: id,
          user_id: user?.id,
          fecha: today,
          notas: motivo,
        } as any);

        // Log in ajustes_inventario
        await supabase.from('ajustes_inventario').insert({
          empresa_id: empresa!.id,
          producto_id: linea.producto_id,
          cantidad_anterior: linea.cantidad_esperada,
          cantidad_nueva: linea.cantidad_real,
          diferencia: diff,
          motivo,
          user_id: user!.id,
          fecha: today,
        } as any);

        // Mark line as adjusted
        await supabase.from('auditoria_lineas').update({ ajustado: true } as any).eq('id', lineaId);
      }

      // Mark non-adjusted lines
      for (const [lineaId, config] of Object.entries(ajustes)) {
        if (config.ajustar) continue;
        await supabase.from('auditoria_lineas').update({
          notas: config.motivo || motivoGlobal || 'No se ajustó',
        } as any).eq('id', lineaId);
      }

      await supabase.from('auditorias').update({
        status: 'aprobada',
        aprobado_por: user?.id,
        fecha_aprobacion: new Date().toISOString(),
        notas_supervisor: motivoGlobal || null,
      } as any).eq('id', id!);
    },
    onSuccess: () => {
      toast.success('Auditoría aprobada — stock ajustado');
      qc.invalidateQueries({ queryKey: ['auditorias'] });
      qc.invalidateQueries({ queryKey: ['auditoria-lineas'] });
      qc.invalidateQueries({ queryKey: ['productos'] });
      setShowAprobar(false);
    },
    onError: (err: any) => toast.error(err.message),
  });

  const rechazarAuditoria = useMutation({
    mutationFn: async () => {
      await supabase.from('auditorias').update({ status: 'rechazada' } as any).eq('id', id!);
    },
    onSuccess: () => {
      toast.success('Auditoría rechazada');
      qc.invalidateQueries({ queryKey: ['auditorias'] });
      navigate('/almacen/auditorias');
    },
  });

  const badge = STATUS_BADGE[auditoria?.status ?? 'pendiente'];
  const canApprove = auditoria?.status === 'por_aprobar';
  const canEdit = auditoria?.status === 'en_proceso';

  return (
    <div className="min-h-full flex flex-col">
      {/* Header */}
      <div className="bg-background border-b border-border p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => navigate('/almacen/auditorias')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-semibold truncate">{auditoria?.nombre ?? 'Resultados'}</h1>
            <p className="text-xs text-muted-foreground">
              Almacén: {almacenNombre} · {fmtDate(auditoria?.fecha)}
            </p>
          </div>
          <Badge variant={badge?.variant}>{badge?.label}</Badge>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-muted/50 rounded-lg p-2 text-center">
            <div className="flex items-center justify-center gap-1 text-destructive">
              <TrendingDown className="h-3.5 w-3.5" />
              <span className="text-lg font-bold">{stats.faltantes.length}</span>
            </div>
            <p className="text-[10px] text-muted-foreground">Faltantes</p>
          </div>
          <div className="bg-muted/50 rounded-lg p-2 text-center">
            <div className="flex items-center justify-center gap-1 text-green-600">
              <TrendingUp className="h-3.5 w-3.5" />
              <span className="text-lg font-bold">{stats.excedentes.length}</span>
            </div>
            <p className="text-[10px] text-muted-foreground">Excedentes</p>
          </div>
          <div className="bg-muted/50 rounded-lg p-2 text-center">
            <div className="flex items-center justify-center gap-1 text-muted-foreground">
              <Equal className="h-3.5 w-3.5" />
              <span className="text-lg font-bold">{stats.iguales.length}</span>
            </div>
            <p className="text-[10px] text-muted-foreground">Correctos</p>
          </div>
        </div>
      </div>

      {/* Lines */}
      <div className="flex-1 overflow-auto">
        {isMobile ? (
          /* Mobile card view */
          <div className="divide-y divide-border">
            {(lineas ?? []).map((l: any) => {
              const diff = l.diferencia ?? 0;
              const notCounted = l.cantidad_real === null;
              return (
                <div key={l.id} className={cn('p-3 space-y-1', notCounted && 'opacity-50')}>
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium truncate flex-1">{l.productos?.nombre}</p>
                    {l.ajustado && <Check className="h-4 w-4 text-green-600 shrink-0" />}
                  </div>
                  <p className="text-xs text-muted-foreground">{l.productos?.codigo}</p>
                  <div className="flex items-center gap-4 text-sm">
                    <span>Sistema: <span className="font-mono">{l.cantidad_esperada}</span></span>
                    <span>Real: <span className="font-mono">{l.cantidad_real ?? '-'}</span></span>
                    <span className={cn(
                      'font-semibold font-mono',
                      diff > 0 ? 'text-green-600' : diff < 0 ? 'text-destructive' : 'text-muted-foreground'
                    )}>
                      {notCounted ? '-' : (diff > 0 ? '+' : '') + diff}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* Desktop table view */
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Producto</TableHead>
                <TableHead className="text-right">Sistema</TableHead>
                <TableHead className="text-right">Real</TableHead>
                <TableHead className="text-right">Diferencia</TableHead>
                <TableHead className="text-center">Ajustado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(lineas ?? []).map((l: any) => {
                const diff = l.diferencia ?? 0;
                const notCounted = l.cantidad_real === null;
                return (
                  <TableRow key={l.id} className={cn(notCounted && 'opacity-50')}>
                    <TableCell>
                      <p className="text-sm font-medium">{l.productos?.nombre}</p>
                      <p className="text-xs text-muted-foreground">{l.productos?.codigo}</p>
                    </TableCell>
                    <TableCell className="text-right font-mono">{l.cantidad_esperada}</TableCell>
                    <TableCell className="text-right font-mono">{l.cantidad_real ?? '-'}</TableCell>
                    <TableCell className={cn('text-right font-mono font-semibold',
                      diff > 0 ? 'text-green-600' : diff < 0 ? 'text-destructive' : '')}>
                      {notCounted ? '-' : (diff > 0 ? '+' : '') + diff}
                    </TableCell>
                    <TableCell className="text-center">
                      {l.ajustado ? <Check className="h-4 w-4 text-green-600 mx-auto" /> : '-'}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Bottom actions */}
      {(canApprove || canEdit) && (
        <div className="sticky bottom-0 bg-background border-t border-border p-3 flex gap-2">
          {canEdit && (
            <Button className="flex-1" onClick={() => navigate(`/almacen/auditorias/${id}/conteo`)}>
              Continuar conteo
            </Button>
          )}
          {canApprove && (
            <>
              <Button variant="destructive" className="flex-1" onClick={() => rechazarAuditoria.mutate()}>
                <X className="h-4 w-4 mr-1" /> Rechazar
              </Button>
              <Button className="flex-1" onClick={initAjustes}>
                <Check className="h-4 w-4 mr-1" /> Aprobar y ajustar
              </Button>
            </>
          )}
        </div>
      )}

      {/* Approval dialog - select which lines to adjust */}
      <Dialog open={showAprobar} onOpenChange={setShowAprobar}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" /> Aprobar auditoría
            </DialogTitle>
            <DialogDescription>
              Selecciona qué diferencias ajustar al stock real. Las líneas no seleccionadas mantendrán el stock del sistema.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>Motivo general</Label>
              <Textarea
                value={motivoGlobal}
                onChange={e => setMotivoGlobal(e.target.value)}
                placeholder="Ej: Auditoría semanal, diferencias por merma"
                rows={2}
              />
            </div>

            <div className="border border-border rounded-lg overflow-hidden divide-y divide-border">
              {Object.entries(ajustes).map(([lineaId, config]) => {
                const linea = (lineas ?? []).find((l: any) => l.id === lineaId) as any;
                if (!linea) return null;
                const diff = linea.diferencia ?? 0;
                return (
                  <div key={lineaId} className="p-3 space-y-2">
                    <div className="flex items-center gap-3">
                      <Checkbox
                        checked={config.ajustar}
                        onCheckedChange={(checked) =>
                          setAjustes(prev => ({
                            ...prev,
                            [lineaId]: { ...prev[lineaId], ajustar: !!checked },
                          }))
                        }
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{linea.productos?.nombre}</p>
                        <p className="text-xs text-muted-foreground">{linea.productos?.codigo}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs text-muted-foreground">
                          {linea.cantidad_esperada} → {linea.cantidad_real}
                        </p>
                        <p className={cn('text-sm font-semibold font-mono',
                          diff > 0 ? 'text-green-600' : 'text-destructive')}>
                          {diff > 0 ? '+' : ''}{diff}
                        </p>
                      </div>
                    </div>
                    {config.ajustar && (
                      <Input
                        placeholder="Motivo específico (opcional)"
                        value={config.motivo}
                        onChange={e =>
                          setAjustes(prev => ({
                            ...prev,
                            [lineaId]: { ...prev[lineaId], motivo: e.target.value },
                          }))
                        }
                        className="h-8 text-sm"
                      />
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowAprobar(false)}>Cancelar</Button>
              <Button onClick={() => aprobarAuditoria.mutate()} disabled={aprobarAuditoria.isPending}>
                {aprobarAuditoria.isPending ? 'Aplicando...' : 'Confirmar y ajustar stock'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
