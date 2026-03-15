import { useState, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Settings2, Plus, Search, Package } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import ProductQuickSearch from '@/components/ProductQuickSearch';
import { fmtDate } from '@/lib/utils';
import { toast } from 'sonner';

export default function AjustesInventarioPage() {
  const { empresa, user } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [showDialog, setShowDialog] = useState(false);
  const [productoId, setProductoId] = useState('');
  const [productoNombre, setProductoNombre] = useState('');
  const [cantidadActual, setCantidadActual] = useState(0);
  const [cantidadNueva, setCantidadNueva] = useState(0);
  const [motivo, setMotivo] = useState('');

  const { data: ajustes, isLoading } = useQuery({
    queryKey: ['ajustes-inventario', empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ajustes_inventario')
        .select('*, productos(codigo, nombre)')
        .eq('empresa_id', empresa!.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const filtered = useMemo(() => {
    if (!search) return ajustes ?? [];
    const s = search.toLowerCase();
    return (ajustes ?? []).filter((a: any) =>
      a.productos?.nombre?.toLowerCase().includes(s) || a.productos?.codigo?.toLowerCase().includes(s)
    );
  }, [ajustes, search]);

  const selectProducto = async (prod: any) => {
    setProductoId(prod.id);
    setProductoNombre(`${prod.codigo} - ${prod.nombre}`);
    setCantidadActual(prod.cantidad ?? 0);
    setCantidadNueva(prod.cantidad ?? 0);
  };

  const crearAjuste = useMutation({
    mutationFn: async () => {
      if (!productoId) throw new Error('Selecciona un producto');
      if (!motivo) throw new Error('Indica un motivo');

      const diferencia = cantidadNueva - cantidadActual;

      // Insert adjustment record
      const { error } = await supabase.from('ajustes_inventario').insert({
        empresa_id: empresa!.id,
        producto_id: productoId,
        cantidad_anterior: cantidadActual,
        cantidad_nueva: cantidadNueva,
        diferencia,
        motivo,
        user_id: user!.id,
      } as any);
      if (error) throw error;

      // Update product stock
      await supabase.from('productos').update({ cantidad: cantidadNueva } as any).eq('id', productoId);

      // Log movement
      const today = new Date().toISOString().slice(0, 10);
      await supabase.from('movimientos_inventario').insert({
        empresa_id: empresa!.id,
        tipo: diferencia > 0 ? 'entrada' : 'salida',
        producto_id: productoId,
        cantidad: Math.abs(diferencia),
        referencia_tipo: 'ajuste',
        user_id: user?.id,
        fecha: today,
        notas: `Ajuste: ${motivo}`,
      } as any);
    },
    onSuccess: () => {
      toast.success('Ajuste aplicado');
      qc.invalidateQueries({ queryKey: ['ajustes-inventario'] });
      qc.invalidateQueries({ queryKey: ['productos'] });
      qc.invalidateQueries({ queryKey: ['movimientos'] });
      resetForm();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const resetForm = () => {
    setShowDialog(false);
    setProductoId('');
    setProductoNombre('');
    setCantidadActual(0);
    setCantidadNueva(0);
    setMotivo('');
  };

  return (
    <div className="p-4 space-y-4 min-h-full">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
          <Settings2 className="h-5 w-5" /> Ajustes de inventario
        </h1>
        <Button onClick={() => setShowDialog(true)} className="gap-1.5">
          <Plus className="h-4 w-4" /> Nuevo ajuste
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar por producto..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

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
            {isLoading && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Cargando...</TableCell></TableRow>}
            {!isLoading && filtered.length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-12">
                <Package className="h-8 w-8 mx-auto mb-2 opacity-30" /> No hay ajustes
              </TableCell></TableRow>
            )}
            {filtered.map((a: any) => (
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

      <Dialog open={showDialog} onOpenChange={v => !v && resetForm()}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Nuevo ajuste de inventario</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Producto</Label>
              {productoId ? (
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-sm flex-1">{productoNombre}</span>
                  <Button size="sm" variant="ghost" onClick={() => { setProductoId(''); setProductoNombre(''); }}>Cambiar</Button>
                </div>
              ) : (
                <ProductSearchInput onSelect={selectProducto} />
              )}
            </div>

            {productoId && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Cantidad actual</Label>
                    <Input type="number" value={cantidadActual} disabled className="bg-muted" />
                  </div>
                  <div>
                    <Label>Cantidad nueva</Label>
                    <Input type="number" value={cantidadNueva} onChange={e => setCantidadNueva(Number(e.target.value))} min={0} />
                  </div>
                </div>
                <div className="text-sm font-medium">
                  Diferencia: <span className={cantidadNueva - cantidadActual > 0 ? 'text-green-600' : cantidadNueva - cantidadActual < 0 ? 'text-destructive' : ''}>
                    {cantidadNueva - cantidadActual > 0 ? '+' : ''}{cantidadNueva - cantidadActual}
                  </span>
                </div>
              </>
            )}

            <div>
              <Label>Motivo del ajuste</Label>
              <Textarea value={motivo} onChange={e => setMotivo(e.target.value)} rows={2} placeholder="Ej: Conteo físico, merma, error de captura..." />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={resetForm}>Cancelar</Button>
              <Button onClick={() => crearAjuste.mutate()} disabled={crearAjuste.isPending || !productoId}>
                {crearAjuste.isPending ? 'Aplicando...' : 'Aplicar ajuste'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
