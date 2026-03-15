import { useState, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowRightLeft, Plus, Search, Package } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import SearchableSelect from '@/components/SearchableSelect';
import ProductSearchInput from '@/components/ProductSearchInput';
import { fmtDate, cn } from '@/lib/utils';
import { toast } from 'sonner';

const TIPO_LABELS: Record<string, string> = {
  almacen_almacen: 'Almacén → Almacén',
  almacen_ruta: 'Almacén → Ruta',
  ruta_almacen: 'Ruta → Almacén',
};

const STATUS_BADGE: Record<string, { label: string; variant: 'secondary' | 'default' | 'destructive' }> = {
  borrador: { label: 'Borrador', variant: 'secondary' },
  confirmado: { label: 'Confirmado', variant: 'default' },
  cancelado: { label: 'Cancelado', variant: 'destructive' },
};

interface LineaForm {
  producto_id: string;
  producto_nombre: string;
  cantidad: number;
}

export default function TraspasosPage() {
  const { empresa, user } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [showDialog, setShowDialog] = useState(false);
  const [tipo, setTipo] = useState<string>('almacen_almacen');
  const [almacenOrigenId, setAlmacenOrigenId] = useState('');
  const [almacenDestinoId, setAlmacenDestinoId] = useState('');
  const [vendedorOrigenId, setVendedorOrigenId] = useState('');
  const [vendedorDestinoId, setVendedorDestinoId] = useState('');
  const [notas, setNotas] = useState('');
  const [lineas, setLineas] = useState<LineaForm[]>([]);

  const { data: traspasos, isLoading } = useQuery({
    queryKey: ['traspasos', empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('traspasos')
        .select('*, almacen_origen:almacenes!traspasos_almacen_origen_id_fkey(nombre), almacen_destino:almacenes!traspasos_almacen_destino_id_fkey(nombre), vendedor_origen:vendedores!traspasos_vendedor_origen_id_fkey(nombre), vendedor_destino:vendedores!traspasos_vendedor_destino_id_fkey(nombre)')
        .eq('empresa_id', empresa!.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: almacenes } = useQuery({
    queryKey: ['almacenes', empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { data } = await supabase.from('almacenes').select('id, nombre').eq('empresa_id', empresa!.id).order('nombre');
      return data ?? [];
    },
  });

  const { data: vendedores } = useQuery({
    queryKey: ['vendedores-list', empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { data } = await supabase.from('vendedores').select('id, nombre').eq('empresa_id', empresa!.id).order('nombre');
      return data ?? [];
    },
  });

  const almacenOpts = (almacenes ?? []).map(a => ({ value: a.id, label: a.nombre }));
  const vendedorOpts = (vendedores ?? []).map(v => ({ value: v.id, label: v.nombre }));

  const filtered = useMemo(() => {
    if (!search) return traspasos ?? [];
    return (traspasos ?? []).filter((t: any) => t.folio?.toLowerCase().includes(search.toLowerCase()));
  }, [traspasos, search]);

  const addLinea = (prod: any) => {
    if (lineas.find(l => l.producto_id === prod.id)) return;
    setLineas([...lineas, { producto_id: prod.id, producto_nombre: `${prod.codigo} - ${prod.nombre}`, cantidad: 1 }]);
  };

  const updateCantidad = (idx: number, val: number) => {
    const next = [...lineas];
    next[idx].cantidad = val;
    setLineas(next);
  };

  const removeLinea = (idx: number) => setLineas(lineas.filter((_, i) => i !== idx));

  const crearMut = useMutation({
    mutationFn: async () => {
      if (lineas.length === 0) throw new Error('Agrega al menos un producto');

      const insert: any = {
        empresa_id: empresa!.id,
        tipo,
        user_id: user!.id,
        notas: notas || null,
      };

      if (tipo === 'almacen_almacen') {
        if (!almacenOrigenId || !almacenDestinoId) throw new Error('Selecciona ambos almacenes');
        if (almacenOrigenId === almacenDestinoId) throw new Error('Los almacenes deben ser diferentes');
        insert.almacen_origen_id = almacenOrigenId;
        insert.almacen_destino_id = almacenDestinoId;
      } else if (tipo === 'almacen_ruta') {
        if (!almacenOrigenId || !vendedorDestinoId) throw new Error('Selecciona almacén y ruta destino');
        insert.almacen_origen_id = almacenOrigenId;
        insert.vendedor_destino_id = vendedorDestinoId;
      } else {
        if (!vendedorOrigenId || !almacenDestinoId) throw new Error('Selecciona ruta origen y almacén destino');
        insert.vendedor_origen_id = vendedorOrigenId;
        insert.almacen_destino_id = almacenDestinoId;
      }

      const { data: traspaso, error } = await supabase
        .from('traspasos')
        .insert(insert)
        .select('id')
        .single();
      if (error) throw error;

      const { error: lErr } = await supabase.from('traspaso_lineas').insert(
        lineas.map(l => ({ traspaso_id: traspaso.id, producto_id: l.producto_id, cantidad: l.cantidad }))
      );
      if (lErr) throw lErr;

      return traspaso;
    },
    onSuccess: () => {
      toast.success('Traspaso creado');
      qc.invalidateQueries({ queryKey: ['traspasos'] });
      resetForm();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const confirmarMut = useMutation({
    mutationFn: async (traspasoId: string) => {
      const { data: traspaso } = await supabase.from('traspasos').select('*').eq('id', traspasoId).single();
      if (!traspaso) throw new Error('Traspaso no encontrado');

      const { data: tLineas } = await supabase.from('traspaso_lineas').select('*').eq('traspaso_id', traspasoId);
      const today = new Date().toISOString().slice(0, 10);

      for (const l of tLineas ?? []) {
        // Deduct from origin
        if (traspaso.almacen_origen_id) {
          const { data: prod } = await supabase.from('productos').select('cantidad').eq('id', l.producto_id).single();
          const stock = prod?.cantidad ?? 0;
          if (l.cantidad > stock) {
            const { data: p } = await supabase.from('productos').select('nombre').eq('id', l.producto_id).single();
            throw new Error(`Stock insuficiente para "${p?.nombre}". Disponible: ${stock}`);
          }
          await supabase.from('productos').update({ cantidad: Math.max(0, stock - l.cantidad) } as any).eq('id', l.producto_id);

          await supabase.from('movimientos_inventario').insert({
            empresa_id: empresa!.id, tipo: 'salida', producto_id: l.producto_id,
            cantidad: l.cantidad, almacen_origen_id: traspaso.almacen_origen_id,
            referencia_tipo: 'traspaso', referencia_id: traspasoId,
            user_id: user?.id, fecha: today, notas: `Traspaso ${traspaso.folio}`,
          } as any);
        }

        if (traspaso.vendedor_origen_id) {
          // Deduct from stock_camion
          const { data: sc } = await supabase.from('stock_camion')
            .select('id, cantidad_actual')
            .eq('vendedor_id', traspaso.vendedor_origen_id)
            .eq('producto_id', l.producto_id)
            .gt('cantidad_actual', 0)
            .order('created_at', { ascending: true })
            .limit(1)
            .single();
          if (sc) {
            await supabase.from('stock_camion').update({ cantidad_actual: Math.max(0, sc.cantidad_actual - l.cantidad) } as any).eq('id', sc.id);
          }

          await supabase.from('movimientos_inventario').insert({
            empresa_id: empresa!.id, tipo: 'salida', producto_id: l.producto_id,
            cantidad: l.cantidad, vendedor_destino_id: traspaso.vendedor_origen_id,
            referencia_tipo: 'traspaso', referencia_id: traspasoId,
            user_id: user?.id, fecha: today, notas: `Traspaso ${traspaso.folio} (salida ruta)`,
          } as any);
        }

        // Add to destination
        if (traspaso.almacen_destino_id) {
          const { data: prod } = await supabase.from('productos').select('cantidad').eq('id', l.producto_id).single();
          await supabase.from('productos').update({ cantidad: (prod?.cantidad ?? 0) + Number(l.cantidad) } as any).eq('id', l.producto_id);

          await supabase.from('movimientos_inventario').insert({
            empresa_id: empresa!.id, tipo: 'entrada', producto_id: l.producto_id,
            cantidad: l.cantidad, almacen_destino_id: traspaso.almacen_destino_id,
            referencia_tipo: 'traspaso', referencia_id: traspasoId,
            user_id: user?.id, fecha: today, notas: `Traspaso ${traspaso.folio}`,
          } as any);
        }

        if (traspaso.vendedor_destino_id) {
          await supabase.from('stock_camion').insert({
            empresa_id: empresa!.id, vendedor_id: traspaso.vendedor_destino_id,
            producto_id: l.producto_id, cantidad_inicial: l.cantidad,
            cantidad_actual: l.cantidad, fecha: today,
          } as any);

          await supabase.from('movimientos_inventario').insert({
            empresa_id: empresa!.id, tipo: 'entrada', producto_id: l.producto_id,
            cantidad: l.cantidad, vendedor_destino_id: traspaso.vendedor_destino_id,
            referencia_tipo: 'traspaso', referencia_id: traspasoId,
            user_id: user?.id, fecha: today, notas: `Traspaso ${traspaso.folio} (entrada ruta)`,
          } as any);
        }
      }

      await supabase.from('traspasos').update({ status: 'confirmado' } as any).eq('id', traspasoId);
    },
    onSuccess: () => {
      toast.success('Traspaso confirmado — stock actualizado');
      qc.invalidateQueries({ queryKey: ['traspasos'] });
      qc.invalidateQueries({ queryKey: ['productos'] });
      qc.invalidateQueries({ queryKey: ['stock-camion'] });
      qc.invalidateQueries({ queryKey: ['movimientos'] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const resetForm = () => {
    setShowDialog(false);
    setTipo('almacen_almacen');
    setAlmacenOrigenId('');
    setAlmacenDestinoId('');
    setVendedorOrigenId('');
    setVendedorDestinoId('');
    setNotas('');
    setLineas([]);
  };

  const getOrigenLabel = (t: any) => {
    if (t.almacen_origen) return t.almacen_origen.nombre;
    if (t.vendedor_origen) return t.vendedor_origen.nombre;
    return '-';
  };

  const getDestinoLabel = (t: any) => {
    if (t.almacen_destino) return t.almacen_destino.nombre;
    if (t.vendedor_destino) return t.vendedor_destino.nombre;
    return '-';
  };

  return (
    <div className="p-4 space-y-4 min-h-full">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
          <ArrowRightLeft className="h-5 w-5" /> Traspasos
        </h1>
        <Button onClick={() => setShowDialog(true)} className="gap-1.5">
          <Plus className="h-4 w-4" /> Nuevo traspaso
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar por folio..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div className="border border-border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Folio</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Origen</TableHead>
              <TableHead>Destino</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead>Status</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Cargando...</TableCell></TableRow>}
            {!isLoading && filtered.length === 0 && (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-12">
                <Package className="h-8 w-8 mx-auto mb-2 opacity-30" /> No hay traspasos
              </TableCell></TableRow>
            )}
            {filtered.map((t: any) => {
              const badge = STATUS_BADGE[t.status] ?? STATUS_BADGE.borrador;
              return (
                <TableRow key={t.id}>
                  <TableCell className="font-mono text-xs">{t.folio}</TableCell>
                  <TableCell className="text-xs">{TIPO_LABELS[t.tipo] ?? t.tipo}</TableCell>
                  <TableCell>{getOrigenLabel(t)}</TableCell>
                  <TableCell>{getDestinoLabel(t)}</TableCell>
                  <TableCell className="text-xs">{fmtDate(t.fecha)}</TableCell>
                  <TableCell><Badge variant={badge.variant}>{badge.label}</Badge></TableCell>
                  <TableCell>
                    {t.status === 'borrador' && (
                      <Button size="sm" variant="outline" onClick={() => confirmarMut.mutate(t.id)}
                        disabled={confirmarMut.isPending}>
                        Confirmar
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Dialog nuevo traspaso */}
      <Dialog open={showDialog} onOpenChange={v => !v && resetForm()}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Nuevo traspaso</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Tipo de traspaso</Label>
              <div className="flex gap-1 mt-1">
                {Object.entries(TIPO_LABELS).map(([k, l]) => (
                  <Button key={k} size="sm" variant={tipo === k ? 'default' : 'outline'} onClick={() => setTipo(k)} className="text-xs">
                    {l}
                  </Button>
                ))}
              </div>
            </div>

            {/* Origin */}
            {(tipo === 'almacen_almacen' || tipo === 'almacen_ruta') && (
              <div>
                <Label>Almacén origen</Label>
                <SearchableSelect options={almacenOpts} value={almacenOrigenId} onChange={setAlmacenOrigenId} placeholder="Seleccionar..." />
              </div>
            )}
            {tipo === 'ruta_almacen' && (
              <div>
                <Label>Ruta origen (vendedor)</Label>
                <SearchableSelect options={vendedorOpts} value={vendedorOrigenId} onChange={setVendedorOrigenId} placeholder="Seleccionar..." />
              </div>
            )}

            {/* Destination */}
            {(tipo === 'almacen_almacen' || tipo === 'ruta_almacen') && (
              <div>
                <Label>Almacén destino</Label>
                <SearchableSelect options={almacenOpts} value={almacenDestinoId} onChange={setAlmacenDestinoId} placeholder="Seleccionar..." />
              </div>
            )}
            {tipo === 'almacen_ruta' && (
              <div>
                <Label>Ruta destino (vendedor)</Label>
                <SearchableSelect options={vendedorOpts} value={vendedorDestinoId} onChange={setVendedorDestinoId} placeholder="Seleccionar..." />
              </div>
            )}

            {/* Products */}
            <div>
              <Label>Productos</Label>
              <ProductSearchInput onSelect={addLinea} />
              {lineas.length > 0 && (
                <div className="mt-2 space-y-1">
                  {lineas.map((l, i) => (
                    <div key={l.producto_id} className="flex items-center gap-2 bg-muted/50 rounded p-2 text-sm">
                      <span className="flex-1 truncate">{l.producto_nombre}</span>
                      <Input type="number" className="w-20 h-8" min={1} value={l.cantidad}
                        onChange={e => updateCantidad(i, Number(e.target.value))} />
                      <Button size="sm" variant="ghost" className="h-8 text-destructive" onClick={() => removeLinea(i)}>×</Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <Label>Notas</Label>
              <Textarea value={notas} onChange={e => setNotas(e.target.value)} rows={2} />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={resetForm}>Cancelar</Button>
              <Button onClick={() => crearMut.mutate()} disabled={crearMut.isPending}>
                {crearMut.isPending ? 'Creando...' : 'Crear traspaso'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
