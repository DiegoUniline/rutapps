import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { Eye, RefreshCw, TrendingUp, TrendingDown, Scale, CheckCircle, XCircle } from 'lucide-react';
import ConteoKardexModal from './ConteoKardexModal';
import { useCurrency } from '@/hooks/useCurrency';

interface Props {
  conteoId: string;
  open: boolean;
  onClose: () => void;
}

const fmt = (n: number) => n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const STATUS_BADGE: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  pendiente: { label: 'Pendiente', variant: 'outline' },
  contado: { label: 'Contado', variant: 'secondary' },
  cerrado: { label: 'Cerrado', variant: 'default' },
};

export default function ConteoDetailModal({ conteoId, open, onClose }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [kardexItemId, setKardexItemId] = useState<string | null>(null);
  const [adjusting, setAdjusting] = useState(false);

  const { data: conteo } = useQuery({
    queryKey: ['conteo-fisico', conteoId],
    enabled: !!conteoId,
    queryFn: async () => {
      const { data, error } = await supabase.from('conteos_fisicos')
        .select('*, almacenes(nombre), clasificaciones(nombre)')
        .eq('id', conteoId).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: lineas, refetch: refetchLineas } = useQuery({
    queryKey: ['conteo-items', conteoId],
    enabled: !!conteoId,
    queryFn: async () => {
      const { data, error } = await supabase.from('conteo_lineas')
        .select('*, productos(codigo, nombre)')
        .eq('conteo_id', conteoId)
        .order('created_at');
      if (error) throw error;
      return data ?? [];
    },
  });

  const cerradas = (lineas ?? []).filter((l: any) => l.status === 'cerrado');
  const positivas = cerradas.filter((l: any) => (l.diferencia ?? 0) > 0);
  const negativas = cerradas.filter((l: any) => (l.diferencia ?? 0) < 0);
  const montoPositivo = positivas.reduce((s: number, l: any) => s + (l.diferencia_valor ?? 0), 0);
  const montoNegativo = negativas.reduce((s: number, l: any) => s + (l.diferencia_valor ?? 0), 0);
  const balanceNeto = montoPositivo + montoNegativo;
  const ajustables = cerradas.filter((l: any) => !l.ajuste_aplicado);
  const allAjustadas = cerradas.length > 0 && ajustables.length === 0;

  const handleAjustarTodas = async () => {
    if (ajustables.length === 0) return;
    setAdjusting(true);
    try {
      for (const linea of ajustables) {
        // Get current stock
        const { data: sa } = await supabase.from('stock_almacen')
          .select('cantidad')
          .eq('almacen_id', conteo?.almacen_id)
          .eq('producto_id', linea.producto_id)
          .single();

        const stockActual = sa?.cantidad ?? 0;
        const dif = (linea.cantidad_contada ?? 0) - stockActual;

        if (dif !== 0) {
          // Update stock
          await supabase.from('stock_almacen').upsert({
            empresa_id: conteo?.empresa_id,
            almacen_id: conteo?.almacen_id,
            producto_id: linea.producto_id,
            cantidad: stockActual + dif,
          } as any, { onConflict: 'almacen_id,producto_id' });

          // Register movement
          await supabase.from('movimientos_inventario').insert({
            empresa_id: conteo?.empresa_id,
            tipo: dif > 0 ? 'entrada' : 'salida',
            producto_id: linea.producto_id,
            cantidad: Math.abs(dif),
            almacen_origen_id: conteo?.almacen_id,
            referencia_tipo: 'conteo_fisico',
            referencia_id: conteoId,
            notas: `Ajuste por conteo físico ${conteo?.folio}. Contado: ${linea.cantidad_contada}, Sistema: ${stockActual}`,
            user_id: user!.id,
          } as any);

          // Update producto cantidad
          const { data: totalStock } = await supabase
            .from('stock_almacen')
            .select('cantidad')
            .eq('producto_id', linea.producto_id)
            .eq('empresa_id', conteo?.empresa_id);
          const totalQty = (totalStock ?? []).reduce((s: number, r: any) => s + (r.cantidad ?? 0), 0);
          await supabase.from('productos').update({ cantidad: totalQty } as any).eq('id', linea.producto_id);
        }

        // Mark as adjusted
        await supabase.from('conteo_lineas').update({ ajuste_aplicado: true } as any).eq('id', linea.id);
      }

      toast.success(`${ajustables.length} ajustes aplicados`);
      refetchLineas();
      qc.invalidateQueries({ queryKey: ['conteos-fisicos'] });
      qc.invalidateQueries({ queryKey: ['productos'] });
      qc.invalidateQueries({ queryKey: ['stock-almacen'] });
      qc.invalidateQueries({ queryKey: ['inventario-dashboard'] });
      qc.invalidateQueries({ queryKey: ['productos-ajuste'] });
    } catch (err: any) {
      toast.error(err.message ?? 'Error al ajustar');
    } finally {
      setAdjusting(false);
    }
  };

  const handleCerrarConteo = async () => {
    const allClosed = (lineas ?? []).every((l: any) => l.status === 'cerrado');
    if (!allClosed) { toast.error('Todas las líneas deben estar cerradas'); return; }
    await supabase.from('conteos_fisicos').update({ status: 'cerrado', cerrado_en: new Date().toISOString() } as any).eq('id', conteoId);
    toast.success('Conteo cerrado');
    qc.invalidateQueries({ queryKey: ['conteo-fisico', conteoId] });
    qc.invalidateQueries({ queryKey: ['conteos-fisicos'] });
  };

  const handleCancelarConteo = async () => {
    await supabase.from('conteos_fisicos').update({ status: 'cancelado' } as any).eq('id', conteoId);
    toast.success('Conteo cancelado');
    qc.invalidateQueries({ queryKey: ['conteo-fisico', conteoId] });
    qc.invalidateQueries({ queryKey: ['conteos-fisicos'] });
  };

  const isClosed = conteo?.status === 'cerrado' || conteo?.status === 'cancelado';

  return (
    <>
      <Dialog open={open} onOpenChange={v => !v && onClose()}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-mono">{conteo?.folio ?? 'Conteo'}</DialogTitle>
          </DialogHeader>

          <Tabs defaultValue="resumen">
            <TabsList className="w-full">
              <TabsTrigger value="resumen" className="flex-1">Resumen</TabsTrigger>
              <TabsTrigger value="productos" className="flex-1">Productos</TabsTrigger>
              <TabsTrigger value="acciones" className="flex-1">Acciones</TabsTrigger>
            </TabsList>

            {/* RESUMEN */}
            <TabsContent value="resumen" className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">Almacén:</span> {(conteo?.almacenes as any)?.nombre}</div>
                <div><span className="text-muted-foreground">Estado:</span> {conteo?.status}</div>
                <div><span className="text-muted-foreground">Apertura:</span> {conteo?.abierto_en ? format(new Date(conteo.abierto_en), 'dd/MM/yyyy HH:mm', { locale: es }) : '—'}</div>
                <div><span className="text-muted-foreground">Cierre:</span> {conteo?.cerrado_en ? format(new Date(conteo.cerrado_en), 'dd/MM/yyyy HH:mm', { locale: es }) : '—'}</div>
                {conteo?.clasificaciones && <div><span className="text-muted-foreground">Categoría:</span> {(conteo.clasificaciones as any)?.nombre}</div>}
                <div><span className="text-muted-foreground">Filtro:</span> {conteo?.filtro_stock}</div>
              </div>

              {/* Progress */}
              <div className="flex items-center gap-3">
                <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-primary rounded-full" style={{ width: `${conteo?.total_productos ? Math.round((cerradas.length / conteo.total_productos) * 100) : 0}%` }} />
                </div>
                <span className="text-sm text-muted-foreground">{cerradas.length}/{conteo?.total_productos ?? 0}</span>
              </div>

              {/* Summary cards */}
              <div className="grid grid-cols-3 gap-3">
                <Card className="p-3">
                  <div className="flex items-center gap-2 text-green-600">
                    <TrendingUp className="h-4 w-4" />
                    <span className="text-xs">Sobrantes</span>
                  </div>
                  <p className="text-lg font-bold text-green-600">$ {fmt(montoPositivo)}</p>
                  <p className="text-xs text-muted-foreground">{positivas.length} productos</p>
                </Card>
                <Card className="p-3">
                  <div className="flex items-center gap-2 text-red-600">
                    <TrendingDown className="h-4 w-4" />
                    <span className="text-xs">Faltantes</span>
                  </div>
                  <p className="text-lg font-bold text-red-600">$ {fmt(Math.abs(montoNegativo))}</p>
                  <p className="text-xs text-muted-foreground">{negativas.length} productos</p>
                </Card>
                <Card className="p-3">
                  <div className="flex items-center gap-2">
                    <Scale className="h-4 w-4" />
                    <span className="text-xs">Balance</span>
                  </div>
                  <p className={cn("text-lg font-bold", balanceNeto >= 0 ? "text-green-600" : "text-red-600")}>
                    $ {fmt(balanceNeto)}
                  </p>
                </Card>
              </div>
            </TabsContent>

            {/* PRODUCTOS */}
            <TabsContent value="productos">
              <div className="border border-border rounded overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-[11px]">Producto</TableHead>
                      <TableHead className="text-[11px] text-center">Contado</TableHead>
                      <TableHead className="text-[11px] text-center">Esperado</TableHead>
                      <TableHead className="text-[11px] text-center">Diferencia</TableHead>
                      <TableHead className="text-[11px]">Estado</TableHead>
                      <TableHead className="text-[11px] text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(lineas ?? []).map((l: any) => {
                      const dif = l.diferencia ?? 0;
                      return (
                        <TableRow key={l.id}>
                          <TableCell className="text-xs">
                            <div>{(l.productos as any)?.nombre}</div>
                            <div className="text-[10px] text-muted-foreground font-mono">{(l.productos as any)?.codigo}</div>
                          </TableCell>
                          <TableCell className="text-center text-xs font-mono">{l.cantidad_contada ?? '—'}</TableCell>
                          <TableCell className="text-center text-xs font-mono">{l.stock_esperado ?? '—'}</TableCell>
                          <TableCell className="text-center">
                            {l.status === 'cerrado' ? (
                              <span className={cn("text-xs font-mono font-bold", dif >= 0 ? "text-green-600" : "text-red-600")}>
                                {dif >= 0 ? '+' : ''}{dif}
                              </span>
                            ) : '—'}
                          </TableCell>
                          <TableCell>
                            <Badge variant={STATUS_BADGE[l.status]?.variant ?? 'outline'} className="text-[10px]">
                              {STATUS_BADGE[l.status]?.label ?? l.status}
                            </Badge>
                            {l.ajuste_aplicado && (
                              <Badge variant="outline" className="text-[10px] ml-1 border-blue-300 text-blue-600">Ajustado</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {l.status === 'cerrado' && (
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setKardexItemId(l.id)} title="Ver Kardex">
                                <Eye className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            {/* ACCIONES */}
            <TabsContent value="acciones" className="space-y-4">
              {/* Adjust card */}
              <Card className="p-4 space-y-3">
                <h3 className="font-medium flex items-center gap-2">
                  <RefreshCw className="h-4 w-4" /> Ajustar Inventario
                </h3>
                {cerradas.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No hay líneas cerradas para ajustar</p>
                ) : allAjustadas ? (
                  <div className="flex items-center gap-2 text-green-600">
                    <CheckCircle className="h-4 w-4" />
                    <span className="text-sm">Todos los ajustes han sido aplicados</span>
                  </div>
                ) : (
                  <>
                    <div className="text-sm text-muted-foreground">
                      {positivas.filter((l: any) => !l.ajuste_aplicado).length} sobrantes,{' '}
                      {negativas.filter((l: any) => !l.ajuste_aplicado).length} faltantes.
                      Valor neto: <span className={cn("font-medium", balanceNeto >= 0 ? "text-green-600" : "text-red-600")}>$ {fmt(balanceNeto)}</span>
                    </div>
                    <Button onClick={handleAjustarTodas} disabled={adjusting}>
                      {adjusting ? 'Ajustando...' : `Ajustar Todas las Líneas (${ajustables.length})`}
                    </Button>
                  </>
                )}
              </Card>

              {/* Conteo actions */}
              <Card className="p-4 space-y-3">
                <h3 className="font-medium">Acciones del Conteo</h3>
                {isClosed ? (
                  <p className="text-sm text-muted-foreground">
                    Este conteo está {conteo?.status === 'cerrado' ? 'cerrado' : 'cancelado'}.
                  </p>
                ) : (
                  <div className="flex gap-2">
                    <Button onClick={handleCerrarConteo} disabled={(lineas ?? []).some((l: any) => l.status !== 'cerrado')}>
                      Cerrar Conteo
                    </Button>
                    <Button variant="destructive" onClick={handleCancelarConteo}>
                      <XCircle className="h-4 w-4 mr-1" /> Cancelar Conteo
                    </Button>
                  </div>
                )}
              </Card>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {kardexItemId && (
        <ConteoKardexModal
          conteoId={conteoId}
          lineaId={kardexItemId}
          open={!!kardexItemId}
          onClose={() => setKardexItemId(null)}
        />
      )}
    </>
  );
}
