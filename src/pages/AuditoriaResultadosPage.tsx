import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Check, X, AlertTriangle, TrendingUp, TrendingDown, Equal, FileText, Eye, ChevronDown, ChevronRight, Link2, Copy, Share2, Lock, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { cn, fmtDate } from '@/lib/utils';
import { toast } from 'sonner';
import { useIsMobile } from '@/hooks/use-mobile';
import { generarAuditoriaPdf } from '@/lib/auditoriaPdf';
import DocumentPreviewModal from '@/components/DocumentPreviewModal';
import AuditoriaMovimientosModal from '@/components/auditorias/AuditoriaMovimientosModal';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

const STATUS_BADGE: Record<string, { label: string; variant: 'secondary' | 'default' | 'destructive' | 'outline' }> = {
  pendiente: { label: 'Pendiente', variant: 'secondary' },
  en_proceso: { label: 'En proceso', variant: 'outline' },
  por_aprobar: { label: 'Por aprobar', variant: 'default' },
  cerrada: { label: 'Cerrada', variant: 'destructive' },
  aprobada: { label: 'Aprobada', variant: 'default' },
  rechazada: { label: 'Rechazada', variant: 'destructive' },
};

interface AjusteSelection {
  [lineaId: string]: { ajustar: boolean; motivo: string };
}

export default function AuditoriaResultadosPage() {
  const { id } = useParams<{ id: string }>();
  const { empresa, user, profile } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const isMobile = useIsMobile();
  const [showAprobar, setShowAprobar] = useState(false);
  const [ajustes, setAjustes] = useState<AjusteSelection>({});
  const [motivoGlobal, setMotivoGlobal] = useState('');
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [showPdfModal, setShowPdfModal] = useState(false);
  const [movModal, setMovModal] = useState<{ productoId: string; nombre: string; codigo: string; esperada: number } | null>(null);
  const [expandedLine, setExpandedLine] = useState<string | null>(null);

  const fmtDt = (d: string | null | undefined) => {
    if (!d) return '—';
    try { return format(new Date(d), "dd/MM/yyyy HH:mm", { locale: es }); } catch { return '—'; }
  };

  const handleGenerarPdf = () => {
    if (!auditoria || !lineas) return;
    const blob = generarAuditoriaPdf({
      empresa: {
        nombre: empresa?.nombre ?? '',
        razon_social: empresa?.razon_social,
        rfc: empresa?.rfc,
        direccion: empresa?.direccion,
        telefono: empresa?.telefono,
      },
      auditoria: {
        nombre: auditoria.nombre,
        fecha: auditoria.fecha,
        status: auditoria.status,
        notas: auditoria.notas,
        notas_supervisor: auditoria.notas_supervisor,
        fecha_aprobacion: auditoria.fecha_aprobacion,
      },
      almacen: almacenNombre,
      responsable: profile?.nombre,
      lineas: lineas.map((l: any) => ({
        codigo: l.productos?.codigo ?? '',
        nombre: l.productos?.nombre ?? '',
        cantidad_esperada: l.cantidad_esperada,
        cantidad_real: l.cantidad_real,
        diferencia: l.diferencia,
        ajustado: l.ajustado,
        notas: l.notas,
      })),
    });
    setPdfBlob(blob);
    setShowPdfModal(true);
  };

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

  // Fetch entries for all lines to show in expandable
  const lineaIds = useMemo(() => (lineas ?? []).map((l: any) => l.id), [lineas]);

  const { data: entradas } = useQuery({
    queryKey: ['auditoria-entradas-resultados', id, lineaIds],
    enabled: !!id && lineaIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('auditoria_entradas')
        .select('*')
        .in('auditoria_linea_id', lineaIds)
        .order('created_at', { ascending: true });
      if (error) throw error;
      const map: Record<string, any[]> = {};
      (data ?? []).forEach((e: any) => {
        if (!map[e.auditoria_linea_id]) map[e.auditoria_linea_id] = [];
        map[e.auditoria_linea_id].push(e);
      });
      return map;
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
      const batchId = crypto.randomUUID();
      const almacenIdAuditoria = auditoria?.almacen_id ?? null;
      const adjustedProductIds: string[] = [];

      for (const [lineaId, config] of Object.entries(ajustes)) {
        if (!config.ajustar) continue;
        const linea = (lineas ?? []).find((l: any) => l.id === lineaId) as any;
        if (!linea || linea.cantidad_real === null) continue;

        const diff = linea.cantidad_real - linea.cantidad_esperada;
        const motivo = config.motivo || motivoGlobal || 'Ajuste por auditoría';

        // Read actual current stock before adjusting
        let stockAnterior = 0;
        if (almacenIdAuditoria) {
          const { data: currentStock } = await supabase
            .from('stock_almacen')
            .select('cantidad')
            .eq('almacen_id', almacenIdAuditoria)
            .eq('producto_id', linea.producto_id)
            .maybeSingle();
          stockAnterior = currentStock?.cantidad ?? 0;

          await supabase.from('stock_almacen').upsert({
            empresa_id: empresa!.id,
            almacen_id: almacenIdAuditoria,
            producto_id: linea.producto_id,
            cantidad: linea.cantidad_real,
          } as any, { onConflict: 'almacen_id,producto_id' });
          adjustedProductIds.push(linea.producto_id);
        } else {
          const { data: prod } = await supabase
            .from('productos')
            .select('cantidad')
            .eq('id', linea.producto_id)
            .maybeSingle();
          stockAnterior = prod?.cantidad ?? 0;
          await supabase.from('productos').update({ cantidad: linea.cantidad_real } as any).eq('id', linea.producto_id);
        }

        const diffReal = (linea.cantidad_real ?? 0) - stockAnterior;

        await supabase.from('movimientos_inventario').insert({
          empresa_id: empresa!.id,
          tipo: diffReal > 0 ? 'entrada' : 'salida',
          producto_id: linea.producto_id,
          cantidad: Math.abs(diffReal),
          referencia_tipo: 'auditoria',
          referencia_id: id,
          user_id: user?.id,
          fecha: today,
          almacen_origen_id: almacenIdAuditoria,
          notas: motivo,
        } as any);

        await supabase.from('ajustes_inventario').insert({
          empresa_id: empresa!.id,
          producto_id: linea.producto_id,
          cantidad_anterior: stockAnterior,
          cantidad_nueva: linea.cantidad_real,
          diferencia: diff,
          motivo,
          user_id: user!.id,
          fecha: today,
          almacen_id: almacenIdAuditoria,
          batch_id: batchId,
        } as any);

        await supabase.from('auditoria_lineas').update({ ajustado: true } as any).eq('id', lineaId);
      }

      // Sync global totals from stock_almacen
      if (almacenIdAuditoria && adjustedProductIds.length > 0) {
        const uniqueIds = [...new Set(adjustedProductIds)];
        const { data: stockRows } = await supabase
          .from('stock_almacen')
          .select('producto_id, cantidad')
          .eq('empresa_id', empresa!.id)
          .in('producto_id', uniqueIds as any);
        const totalMap = new Map<string, number>();
        for (const row of (stockRows ?? [])) {
          totalMap.set(row.producto_id, (totalMap.get(row.producto_id) ?? 0) + (row.cantidad ?? 0));
        }
        await Promise.all(uniqueIds.map(pid =>
          supabase.from('productos').update({ cantidad: totalMap.get(pid) ?? 0 } as any).eq('id', pid)
        ));
      }

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
      qc.invalidateQueries({ queryKey: ['stock-almacen'] });
      qc.invalidateQueries({ queryKey: ['inventario-dashboard'] });
      qc.invalidateQueries({ queryKey: ['productos-ajuste'] });
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
  const isCerrada = auditoria?.status === 'cerrada' || auditoria?.status === 'aprobada' || auditoria?.status === 'rechazada';

  const publicUrl = `${window.location.origin}/auditoria-movil/${id}`;
  const copyUrl = () => {
    navigator.clipboard.writeText(publicUrl);
    toast.success('URL copiada al portapapeles');
  };
  const shareUrl = async () => {
    if (navigator.share) {
      await navigator.share({ title: `Auditoría ${auditoria?.nombre}`, url: publicUrl });
    } else {
      copyUrl();
    }
  };

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
              Almacén: {almacenNombre}
            </p>
            <p className="text-xs text-muted-foreground">
              Abierto: {fmtDt(auditoria?.created_at)}
              {' · '}
              Cerrado: {fmtDt((auditoria as any)?.cerrada_at) !== '—' ? fmtDt((auditoria as any)?.cerrada_at) : (auditoria?.fecha_aprobacion ? fmtDt(auditoria.fecha_aprobacion) : 'Pendiente')}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={handleGenerarPdf}>
            <FileText className="h-4 w-4 mr-1" /> PDF
          </Button>
          <Badge variant={badge?.variant}>{badge?.label}</Badge>
        </div>

        {/* Public URL */}
        {!isCerrada && (
          <div className="flex items-center gap-2 bg-accent/50 rounded-lg px-3 py-2">
            <Link2 className="h-4 w-4 text-primary shrink-0" />
            <input
              readOnly
              value={publicUrl}
              className="flex-1 bg-transparent text-xs text-muted-foreground truncate outline-none"
              onClick={e => (e.target as HTMLInputElement).select()}
            />
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={copyUrl} title="Copiar URL">
              <Copy className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={shareUrl} title="Compartir">
              <Share2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
        {isCerrada && (
          <div className="flex items-center gap-2 bg-destructive/10 rounded-lg px-3 py-2 text-xs text-destructive">
            <Lock className="h-4 w-4 shrink-0" />
            <span>Auditoría cerrada por <strong>{(auditoria as any)?.cerrada_por ?? '—'}</strong> el {fmtDt((auditoria as any)?.cerrada_at)}</span>
          </div>
        )}

        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-card rounded-lg p-2 text-center">
            <div className="flex items-center justify-center gap-1 text-destructive">
              <TrendingDown className="h-3.5 w-3.5" />
              <span className="text-lg font-bold">{stats.faltantes.length}</span>
            </div>
            <p className="text-[10px] text-muted-foreground">Faltantes</p>
          </div>
          <div className="bg-card rounded-lg p-2 text-center">
            <div className="flex items-center justify-center gap-1 text-green-600">
              <TrendingUp className="h-3.5 w-3.5" />
              <span className="text-lg font-bold">{stats.excedentes.length}</span>
            </div>
            <p className="text-[10px] text-muted-foreground">Excedentes</p>
          </div>
          <div className="bg-card rounded-lg p-2 text-center">
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
              const lineEntries = entradas?.[l.id] ?? [];
              const isExpanded = expandedLine === l.id;
              return (
                <div key={l.id} className={cn('space-y-1', notCounted && 'opacity-50')}>
                  <div
                    className="p-3 cursor-pointer"
                    onClick={() => setExpandedLine(isExpanded ? null : l.id)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        <p className="text-sm font-medium truncate flex-1">{l.productos?.nombre}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {l.ajustado && <Check className="h-4 w-4 text-green-600 shrink-0" />}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={(e) => {
                            e.stopPropagation();
                            setMovModal({
                              productoId: l.producto_id,
                              nombre: l.productos?.nombre ?? '',
                              codigo: l.productos?.codigo ?? '',
                              esperada: l.cantidad_esperada,
                            });
                          }}
                        >
                          <Eye className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground ml-6">{l.productos?.codigo}</p>
                    <div className="flex items-center gap-4 text-sm ml-6">
                      <span>Esperado: <span className="font-mono">{l.cantidad_esperada}</span></span>
                      <span>Contado: <span className="font-mono">{l.cantidad_real ?? '-'}</span></span>
                      <span className={cn(
                        'font-semibold font-mono',
                        diff > 0 ? 'text-green-600' : diff < 0 ? 'text-destructive' : 'text-muted-foreground'
                      )}>
                        {notCounted ? '-' : (diff > 0 ? '+' : '') + diff}
                      </span>
                    </div>
                    {l.cerrada_at && (
                      <p className="text-[10px] text-muted-foreground ml-6 mt-1">Cerrada: {fmtDt(l.cerrada_at)}</p>
                    )}
                  </div>
                  {isExpanded && (
                    <div className="px-6 pb-3">
                      {lineEntries.length === 0 ? (
                        <p className="text-xs text-muted-foreground py-2">Sin entradas registradas</p>
                      ) : (
                        <div className="border rounded-lg overflow-hidden">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="text-xs text-muted-foreground border-b bg-card">
                                <th className="text-left py-1.5 px-2 font-medium">#</th>
                                <th className="text-left py-1.5 px-2 font-medium">Fecha / Hora</th>
                                <th className="text-right py-1.5 px-2 font-medium">Cantidad</th>
                                <th className="text-right py-1.5 px-2 font-medium">Acumulado</th>
                              </tr>
                            </thead>
                            <tbody>
                              {lineEntries.map((entry: any, idx: number) => {
                                const acum = lineEntries.slice(0, idx + 1).reduce((s: number, e: any) => s + Number(e.cantidad), 0);
                                return (
                                  <tr key={entry.id} className="border-b border-border/50 last:border-0">
                                    <td className="py-1.5 px-2 text-xs text-muted-foreground">{idx + 1}</td>
                                    <td className="py-1.5 px-2 text-xs">{fmtDt(entry.created_at)}</td>
                                    <td className="py-1.5 px-2 text-right font-mono font-medium">+{entry.cantidad}</td>
                                    <td className="py-1.5 px-2 text-right font-mono text-muted-foreground">{acum}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          /* Desktop table view */
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[30px]"></TableHead>
                <TableHead>Producto</TableHead>
                <TableHead>Código</TableHead>
                <TableHead className="text-right">Esperado</TableHead>
                <TableHead className="text-right">Contado</TableHead>
                <TableHead className="text-right">Diferencia</TableHead>
                <TableHead className="text-center">Ajustado</TableHead>
                <TableHead className="text-right">Cerrada</TableHead>
                <TableHead className="text-center w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(lineas ?? []).map((l: any) => {
                const diff = l.diferencia ?? 0;
                const notCounted = l.cantidad_real === null;
                const lineEntries = entradas?.[l.id] ?? [];
                const isExpanded = expandedLine === l.id;
                return (
                  <>
                    <TableRow
                      key={l.id}
                      className={cn('cursor-pointer', notCounted && 'opacity-50')}
                      onClick={() => setExpandedLine(isExpanded ? null : l.id)}
                    >
                      <TableCell className="px-2">
                        {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </TableCell>
                      <TableCell className="text-sm font-medium">{l.productos?.nombre}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{l.productos?.codigo}</TableCell>
                      <TableCell className="text-right font-mono">{l.cantidad_esperada}</TableCell>
                      <TableCell className="text-right font-mono">{l.cantidad_real ?? '-'}</TableCell>
                      <TableCell className={cn('text-right font-mono font-semibold',
                        diff > 0 ? 'text-green-600' : diff < 0 ? 'text-destructive' : '')}>
                        {notCounted ? '-' : (diff > 0 ? '+' : '') + diff}
                      </TableCell>
                      <TableCell className="text-center">
                        {l.ajustado ? <Check className="h-4 w-4 text-green-600 mx-auto" /> : '-'}
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground whitespace-nowrap">
                        {l.cerrada_at ? fmtDt(l.cerrada_at) : '-'}
                      </TableCell>
                      <TableCell className="text-center" onClick={e => e.stopPropagation()}>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => setMovModal({
                            productoId: l.producto_id,
                            nombre: l.productos?.nombre ?? '',
                            codigo: l.productos?.codigo ?? '',
                            esperada: l.cantidad_esperada,
                          })}
                        >
                          <Eye className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      </TableCell>
                    </TableRow>

                    {/* Expanded entries */}
                    {isExpanded && (
                      <TableRow key={`${l.id}-entries`} className="bg-background hover:bg-background">
                        <TableCell colSpan={9} className="p-0 bg-background">
                          <div className="px-8 py-2">
                            {lineEntries.length === 0 ? (
                              <p className="text-xs text-muted-foreground py-2">Sin entradas registradas</p>
                            ) : (
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="text-xs text-muted-foreground border-b">
                                    <th className="text-left py-1 font-medium">#</th>
                                    <th className="text-left py-1 font-medium">Fecha / Hora</th>
                                    <th className="text-left py-1 font-medium">Usuario</th>
                                    <th className="text-right py-1 font-medium">Cantidad</th>
                                    <th className="text-right py-1 font-medium">Acumulado</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {lineEntries.map((entry: any, idx: number) => {
                                    const acum = lineEntries.slice(0, idx + 1).reduce((s: number, e: any) => s + Number(e.cantidad), 0);
                                    return (
                                      <tr key={entry.id} className="border-b border-border/50 last:border-0">
                                        <td className="py-1.5 text-xs text-muted-foreground">{idx + 1}</td>
                                        <td className="py-1.5 text-xs">{fmtDt(entry.created_at)}</td>
                                        <td className="py-1.5 text-xs flex items-center gap-1">
                                          <User className="h-3 w-3 text-muted-foreground" />
                                          {entry.user_id === user?.id ? (profile?.nombre ?? 'Yo') : entry.user_id?.slice(0, 8)}
                                        </td>
                                        <td className="py-1.5 text-right font-mono font-medium">+{entry.cantidad}</td>
                                        <td className="py-1.5 text-right font-mono text-muted-foreground">{acum}</td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                                <tfoot>
                                  <tr className="font-medium">
                                    <td colSpan={3} className="py-1.5 text-xs">Total</td>
                                    <td className="py-1.5 text-right font-mono">
                                      {lineEntries.reduce((s: number, e: any) => s + Number(e.cantidad), 0)}
                                    </td>
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

      {/* Approval dialog */}
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

      <DocumentPreviewModal
        open={showPdfModal}
        onClose={() => { setShowPdfModal(false); setPdfBlob(null); }}
        pdfBlob={pdfBlob}
        fileName={`auditoria-${auditoria?.nombre ?? 'doc'}.pdf`}
        empresaId={empresa?.id ?? ''}
        defaultPhone=""
        caption={`Auditoría ${auditoria?.nombre}`}
        tipo="auditoria"
        referencia_id={id}
      />

      {movModal && (
        <AuditoriaMovimientosModal
          open={!!movModal}
          onOpenChange={() => setMovModal(null)}
          productoId={movModal.productoId}
          productoNombre={movModal.nombre}
          productoCodigo={movModal.codigo}
          cantidadEsperada={movModal.esperada}
          apertura={auditoria?.created_at ?? ''}
          cierre={(auditoria as any)?.cerrada_at ?? auditoria?.fecha_aprobacion ?? null}
        />
      )}
    </div>
  );
}
