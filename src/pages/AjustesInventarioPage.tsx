import { useState, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Settings2, Search, Package, RotateCcw, Save, AlertTriangle, FileText } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useAlmacenes } from '@/hooks/useData';
import { fmtDate } from '@/lib/utils';
import { toast } from 'sonner';
import { generarAjusteInventarioPdf } from '@/lib/ajusteInventarioPdf';
import DocumentPreviewModal from '@/components/DocumentPreviewModal';

interface ProductRow {
  id: string;
  codigo: string;
  nombre: string;
  cantidadSistema: number;
  cantidadReal: number | null; // null = not edited
  touched: boolean;
}

export default function AjustesInventarioPage() {
  const { empresa, user, profile } = useAuth();
  const qc = useQueryClient();
  const { data: almacenes } = useAlmacenes();
  const [almacenId, setAlmacenId] = useState('');
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<ProductRow[]>([]);
  const [motivo, setMotivo] = useState('Conteo físico');
  const [applying, setApplying] = useState(false);
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [resetMotivo, setResetMotivo] = useState('Reinicio general de stock');
  const [resetting, setResetting] = useState(false);
  const [tab, setTab] = useState<'ajuste' | 'historial'>('ajuste');

  // Load products for selected almacen
  const { data: productos, isLoading: loadingProducts } = useQuery({
    queryKey: ['productos-ajuste', empresa?.id, almacenId],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('productos')
        .select('id, codigo, nombre, cantidad, se_puede_inventariar, status')
        .eq('empresa_id', empresa!.id)
        .in('status', ['activo'] as any[])
        .order('nombre');
      if (error) throw error;
      return (data ?? []).filter((p: any) => p.se_puede_inventariar !== false);
    },
  });

  // Load history
  const { data: historial, isLoading: loadingHistorial } = useQuery({
    queryKey: ['ajustes-historial', empresa?.id],
    enabled: !!empresa?.id && tab === 'historial',
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ajustes_inventario')
        .select('*, productos(codigo, nombre)')
        .eq('empresa_id', empresa!.id)
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  // Initialize rows when products load or almacen changes
  const initRows = () => {
    if (!productos) return;
    setRows(productos.map((p: any) => ({
      id: p.id,
      codigo: p.codigo,
      nombre: p.nombre,
      cantidadSistema: p.cantidad ?? 0,
      cantidadReal: null,
      touched: false,
    })));
  };

  // Re-init when products change
  useMemo(() => { initRows(); }, [productos]);

  const filteredRows = useMemo(() => {
    if (!search) return rows;
    const s = search.toLowerCase();
    return rows.filter(r => r.nombre.toLowerCase().includes(s) || r.codigo.toLowerCase().includes(s));
  }, [rows, search]);

  const changedRows = rows.filter(r => r.touched && r.cantidadReal !== null && r.cantidadReal !== r.cantidadSistema);

  const updateRow = (id: string, cantidadReal: number) => {
    setRows(prev => prev.map(r =>
      r.id === id ? { ...r, cantidadReal, touched: true } : r
    ));
  };

  // Apply all changes
  const applyAdjustments = async () => {
    if (changedRows.length === 0) { toast.info('No hay cambios'); return; }
    if (!motivo.trim()) { toast.error('Indica un motivo para el ajuste'); return; }
    setApplying(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      for (const row of changedRows) {
        const diferencia = (row.cantidadReal ?? 0) - row.cantidadSistema;

        await supabase.from('ajustes_inventario').insert({
          empresa_id: empresa!.id,
          producto_id: row.id,
          cantidad_anterior: row.cantidadSistema,
          cantidad_nueva: row.cantidadReal,
          diferencia,
          motivo,
          user_id: user!.id,
          almacen_id: almacenId || null,
        } as any);

        await supabase.from('productos').update({ cantidad: row.cantidadReal } as any).eq('id', row.id);

        await supabase.from('movimientos_inventario').insert({
          empresa_id: empresa!.id,
          tipo: diferencia > 0 ? 'entrada' : 'salida',
          producto_id: row.id,
          cantidad: Math.abs(diferencia),
          referencia_tipo: 'ajuste',
          user_id: user?.id,
          fecha: today,
          almacen_origen_id: almacenId || null,
          notas: `Ajuste masivo: ${motivo}`,
        } as any);
      }
      toast.success(`${changedRows.length} producto(s) ajustados`);
      qc.invalidateQueries({ queryKey: ['productos'] });
      qc.invalidateQueries({ queryKey: ['productos-ajuste'] });
      qc.invalidateQueries({ queryKey: ['ajustes-historial'] });
      qc.invalidateQueries({ queryKey: ['movimientos'] });
    } catch (err: any) {
      toast.error(err.message || 'Error al aplicar ajustes');
    } finally {
      setApplying(false);
    }
  };

  // Reset all stock to zero
  const resetStock = async () => {
    if (!resetMotivo.trim()) { toast.error('Indica un motivo'); return; }
    setResetting(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const allProds = productos ?? [];
      const nonZero = allProds.filter((p: any) => (p.cantidad ?? 0) !== 0);

      for (const p of nonZero) {
        const cantAnterior = p.cantidad ?? 0;

        await supabase.from('ajustes_inventario').insert({
          empresa_id: empresa!.id,
          producto_id: p.id,
          cantidad_anterior: cantAnterior,
          cantidad_nueva: 0,
          diferencia: -cantAnterior,
          motivo: resetMotivo,
          user_id: user!.id,
          almacen_id: almacenId || null,
        } as any);

        await supabase.from('productos').update({ cantidad: 0 } as any).eq('id', p.id);

        await supabase.from('movimientos_inventario').insert({
          empresa_id: empresa!.id,
          tipo: 'salida',
          producto_id: p.id,
          cantidad: cantAnterior,
          referencia_tipo: 'ajuste',
          user_id: user?.id,
          fecha: today,
          almacen_origen_id: almacenId || null,
          notas: `Reinicio a ceros: ${resetMotivo}`,
        } as any);
      }

      toast.success(`Stock reiniciado a 0 en ${nonZero.length} productos`);
      setShowResetDialog(false);
      qc.invalidateQueries({ queryKey: ['productos'] });
      qc.invalidateQueries({ queryKey: ['productos-ajuste'] });
      qc.invalidateQueries({ queryKey: ['ajustes-historial'] });
      qc.invalidateQueries({ queryKey: ['movimientos'] });
    } catch (err: any) {
      toast.error(err.message || 'Error al reiniciar stock');
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="p-4 space-y-4 min-h-full">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
          <Settings2 className="h-5 w-5" /> Ajustes de inventario
        </h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setTab(tab === 'ajuste' ? 'historial' : 'ajuste')}>
            {tab === 'ajuste' ? 'Ver historial' : 'Volver a ajuste'}
          </Button>
        </div>
      </div>

      {tab === 'ajuste' ? (
        <>
          {/* Controls */}
          <div className="flex flex-wrap gap-3 items-end">
            <div className="space-y-1 min-w-[200px]">
              <Label className="text-xs text-muted-foreground">Almacén</Label>
              <Select value={almacenId} onValueChange={setAlmacenId}>
                <SelectTrigger className="w-[220px]">
                  <SelectValue placeholder="Selecciona almacén" />
                </SelectTrigger>
                <SelectContent>
                  {(almacenes ?? []).map((a: any) => (
                    <SelectItem key={a.id} value={a.id}>{a.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 flex-1 min-w-[200px] max-w-sm">
              <Label className="text-xs text-muted-foreground">Buscar producto</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Código o nombre..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1 flex-1 min-w-[200px] max-w-sm">
              <Label className="text-xs text-muted-foreground">Motivo del ajuste</Label>
              <Input value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Ej: Conteo físico..." />
            </div>
          </div>

          {/* Summary bar */}
          <div className="flex items-center justify-between flex-wrap gap-3 bg-muted/40 border border-border/40 rounded-lg px-4 py-2.5">
            <div className="flex items-center gap-4 text-sm">
              <span className="text-muted-foreground">{filteredRows.length} productos</span>
              {changedRows.length > 0 && (
                <Badge variant="outline" className="text-primary border-primary/30 bg-primary/5">
                  {changedRows.length} con cambios
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setShowResetDialog(true)}
                className="gap-1.5"
              >
                <RotateCcw className="h-4 w-4" /> Reiniciar a ceros
              </Button>
              <Button
                size="sm"
                onClick={applyAdjustments}
                disabled={applying || changedRows.length === 0}
                className="gap-1.5"
              >
                <Save className="h-4 w-4" />
                {applying ? 'Aplicando...' : `Aplicar ${changedRows.length} ajuste(s)`}
              </Button>
            </div>
          </div>

          {/* Products table */}
          <div className="border border-border rounded-lg overflow-hidden">
            <div className="max-h-[calc(100vh-320px)] overflow-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-card z-10">
                  <TableRow>
                    <TableHead className="w-[100px]">Código</TableHead>
                    <TableHead>Producto</TableHead>
                    <TableHead className="text-right w-[110px]">En sistema</TableHead>
                    <TableHead className="text-right w-[130px]">Cantidad real</TableHead>
                    <TableHead className="text-right w-[100px]">Diferencia</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingProducts && (
                    <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Cargando productos...</TableCell></TableRow>
                  )}
                  {!loadingProducts && filteredRows.length === 0 && (
                    <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-12">
                      <Package className="h-8 w-8 mx-auto mb-2 opacity-30" />
                      {almacenId ? 'No hay productos' : 'Selecciona un almacén'}
                    </TableCell></TableRow>
                  )}
                  {filteredRows.map(row => {
                    const diff = row.touched && row.cantidadReal !== null ? row.cantidadReal - row.cantidadSistema : 0;
                    return (
                      <TableRow
                        key={row.id}
                        className={row.touched && diff !== 0 ? 'bg-primary/5' : ''}
                      >
                        <TableCell className="font-mono text-xs text-muted-foreground">{row.codigo}</TableCell>
                        <TableCell className="text-sm">{row.nombre}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{row.cantidadSistema}</TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            min={0}
                            className="w-[100px] ml-auto text-right font-mono h-8 text-sm"
                            placeholder={String(row.cantidadSistema)}
                            value={row.cantidadReal ?? ''}
                            onChange={e => updateRow(row.id, e.target.value === '' ? row.cantidadSistema : Number(e.target.value))}
                          />
                        </TableCell>
                        <TableCell className={`text-right font-mono text-sm font-semibold ${diff > 0 ? 'text-green-600' : diff < 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
                          {row.touched && diff !== 0 ? `${diff > 0 ? '+' : ''}${diff}` : '—'}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        </>
      ) : (
        /* Historial tab */
        <div className="border border-border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Producto</TableHead>
                <TableHead className="text-right">Anterior</TableHead>
                <TableHead className="text-right">Nueva</TableHead>
                <TableHead className="text-right">Diferencia</TableHead>
                <TableHead>Motivo</TableHead>
                <TableHead>Fecha</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loadingHistorial && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Cargando...</TableCell></TableRow>}
              {!loadingHistorial && (historial ?? []).length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-12">
                  <Package className="h-8 w-8 mx-auto mb-2 opacity-30" /> No hay ajustes registrados
                </TableCell></TableRow>
              )}
              {(historial ?? []).map((a: any) => (
                <TableRow key={a.id}>
                  <TableCell className="text-sm">{a.productos?.codigo} - {a.productos?.nombre}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{a.cantidad_anterior}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{a.cantidad_nueva}</TableCell>
                  <TableCell className={`text-right font-mono text-sm font-semibold ${a.diferencia > 0 ? 'text-green-600' : a.diferencia < 0 ? 'text-destructive' : ''}`}>
                    {a.diferencia > 0 ? '+' : ''}{a.diferencia}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">{a.motivo}</TableCell>
                  <TableCell className="text-xs">{fmtDate(a.fecha)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Reset Dialog */}
      <Dialog open={showResetDialog} onOpenChange={setShowResetDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" /> Reiniciar stock a ceros
            </DialogTitle>
            <DialogDescription>
              Esto pondrá el stock de <strong>todos los productos</strong> en 0. Se registrará un ajuste y movimiento por cada producto como historial.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Motivo</Label>
              <Textarea
                value={resetMotivo}
                onChange={e => setResetMotivo(e.target.value)}
                rows={2}
                placeholder="Ej: Cierre de ejercicio, inventario inicial..."
              />
            </div>
            <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3">
              <p className="text-sm text-destructive font-medium">⚠️ Esta acción no se puede deshacer</p>
              <p className="text-xs text-muted-foreground mt-1">
                Se registrará quién lo hizo ({profile?.nombre || user?.email}), cuándo y el motivo.
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowResetDialog(false)}>Cancelar</Button>
              <Button variant="destructive" onClick={resetStock} disabled={resetting}>
                <RotateCcw className="h-4 w-4 mr-1.5" />
                {resetting ? 'Reiniciando...' : 'Confirmar reinicio'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
