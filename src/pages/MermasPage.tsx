import { DateRangePicker } from '@/components/shared/DateRangePicker';
import { useState, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { usePermisos } from '@/hooks/usePermisos';
import { Navigate } from 'react-router-dom';
import { useAlmacenes, useProductosForSelect } from '@/hooks/useData';
import { useMermas, useMermaMotivos, useRegistrarMerma, useCancelarMerma, useMerma } from '@/hooks/useMermas';
import { useLotesPorReferencia } from '@/hooks/useLotesPorReferencia';
import { LoteCell } from '@/components/lotes/LoteCell';
import { useManejaLotes } from '@/hooks/useManejaLotes';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Plus, Trash2, X, Settings, AlertTriangle } from 'lucide-react';
import { fmtDate, fmtNum } from '@/lib/utils';
import { fmtMoney } from '@/lib/currency';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import { confirmDialog } from '@/lib/confirm';


interface LineaForm {
  producto_id: string;
  nombre: string;
  unidad: string;
  cantidad: number;
  costo_unitario: number;
  precio_venta_unitario: number;
}

export default function MermasPage() {
  const { empresa } = useAuth();
  const { hasPermiso, loading: permisosLoading } = usePermisos();
  const { data: almacenes } = useAlmacenes();
  const { data: motivos } = useMermaMotivos();
  const { data: productos } = useProductosForSelect();
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const { data: mermas, isLoading } = useMermas({ desde: desde || undefined, hasta: hasta || undefined });
  const registrar = useRegistrarMerma();
  const cancelar = useCancelarMerma();

  const [open, setOpen] = useState(false);
  const [almacenId, setAlmacenId] = useState('');
  const [motivoId, setMotivoId] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [lineas, setLineas] = useState<LineaForm[]>([]);
  const [productPickerOpen, setProductPickerOpen] = useState(false);

  const [detalleId, setDetalleId] = useState<string | null>(null);
  const { data: detalle } = useMerma(detalleId ?? undefined);
  const manejaLotes = useManejaLotes();
  const { data: lotesMerma } = useLotesPorReferencia(detalleId ?? undefined, ['merma_lote']);

  const totalCosto = useMemo(() => lineas.reduce((s, l) => s + l.cantidad * l.costo_unitario, 0), [lineas]);
  const totalVenta = useMemo(() => lineas.reduce((s, l) => s + l.cantidad * l.precio_venta_unitario, 0), [lineas]);

  const resetForm = () => {
    setAlmacenId('');
    setMotivoId('');
    setObservaciones('');
    setLineas([]);
  };

  const addProducto = (p: any) => {
    if (lineas.find(l => l.producto_id === p.id)) {
      toast.info('Producto ya agregado');
      return;
    }
    const unidadName = p.es_granel ? (p.unidad_granel || 'kg') : (p.unidades_venta?.abreviatura || p.unidades_venta?.nombre || 'pza');
    setLineas([...lineas, {
      producto_id: p.id,
      nombre: p.nombre,
      unidad: unidadName,
      cantidad: 1,
      costo_unitario: Number(p.costo) || 0,
      precio_venta_unitario: Number(p.precio_principal) || 0,
    }]);
    setProductPickerOpen(false);
  };

  const handleSubmit = async () => {
    if (!almacenId) return toast.error('Selecciona un almacén origen');
    if (!motivoId) return toast.error('Selecciona un motivo');
    if (lineas.length === 0) return toast.error('Agrega al menos un producto');
    if (lineas.some(l => l.cantidad <= 0)) return toast.error('Cantidades deben ser mayores a 0');

    try {
      await registrar.mutateAsync({
        almacen_origen_id: almacenId,
        motivo_id: motivoId,
        observaciones,
        lineas: lineas.map(l => ({
          producto_id: l.producto_id,
          cantidad: l.cantidad,
          costo_unitario: l.costo_unitario,
          precio_venta_unitario: l.precio_venta_unitario,
        })),
      });
      resetForm();
      setOpen(false);
    } catch (e: any) {
      toast.error(e.message || 'Error al registrar merma');
    }
  };

  const canViewMermas = hasPermiso('almacen.ajustes', 'ver');
  const canCreateMermas = hasPermiso('almacen.ajustes', 'crear');
  const canCancelMermas = hasPermiso('almacen.ajustes', 'eliminar');

  if (!permisosLoading && !canViewMermas) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3 p-6 text-center">
        <AlertTriangle className="h-10 w-10 text-warning" />
        <h2 className="text-xl font-semibold">Acceso restringido</h2>
        <p className="text-sm text-muted-foreground max-w-md">
          Tu rol no tiene permiso para ver ajustes y mermas.
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 space-y-4 bg-background min-h-[100dvh]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <AlertTriangle className="h-6 w-6 text-primary" />
            Mermas y Desperdicio
            
          </h1>
          <p className="text-sm text-muted-foreground">Controla los kg/unidades que se pierden y su impacto en costo y venta.</p>
        </div>
        <div className="flex gap-2">
          <Link to="/almacen/mermas/motivos">
            <Button variant="outline"><Settings className="h-4 w-4 mr-1" /> Motivos</Button>
          </Link>
          {canCreateMermas && (
            <Button onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4 mr-1" /> Registrar merma
            </Button>
          )}
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-2 items-end bg-card border rounded-lg p-3">
        <div>
          <Label className="text-xs">Rango de fechas</Label>
          <DateRangePicker from={desde} to={hasta} onChange={(f, t) => { setDesde(f); setHasta(t); }} />
        </div>
        {(desde || hasta) && (
          <Button variant="ghost" size="sm" onClick={() => { setDesde(''); setHasta(''); }}>
            <X className="h-4 w-4" /> Limpiar
          </Button>
        )}
      </div>

      {/* Lista */}
      <div className="bg-card border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Folio</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead>Almacén origen</TableHead>
              <TableHead>Motivo</TableHead>
              <TableHead>Usuario</TableHead>
              <TableHead className="text-right">Costo perdido</TableHead>
              <TableHead className="text-right">Venta no realizada</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="w-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={9} className="text-center py-8">Cargando…</TableCell></TableRow>
            ) : (mermas ?? []).length === 0 ? (
              <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Sin mermas registradas</TableCell></TableRow>
            ) : (mermas ?? []).map((m: any) => (
              <TableRow
                key={m.id}
                className={`cursor-pointer hover:bg-muted/50 ${m.cancelada ? 'opacity-50' : ''}`}
                onClick={() => setDetalleId(m.id)}
              >
                <TableCell className="font-mono font-semibold">{m.folio}</TableCell>
                <TableCell>{fmtDate(m.fecha)}</TableCell>
                <TableCell>{m.almacenes?.nombre ?? '—'}</TableCell>
                <TableCell>{m.merma_motivos?.nombre ?? '—'}</TableCell>
                <TableCell>{m.profiles?.nombre ?? '—'}</TableCell>
                <TableCell className="text-right">{fmtMoney(m.total_costo)}</TableCell>
                <TableCell className="text-right">{fmtMoney(m.total_venta)}</TableCell>
                <TableCell>
                  {m.cancelada ? <Badge variant="outline">Cancelada</Badge> : <Badge>Activa</Badge>}
                </TableCell>
                <TableCell onClick={e => e.stopPropagation()}>
                  {!m.cancelada && canCancelMermas && (
                    <Button variant="ghost" size="icon" title="Cancelar"
                      onClick={async () => {
                        if (await confirmDialog(`¿Cancelar merma ${m.folio}? Se devolverá el stock al almacén origen.`)) {
                          cancelar.mutate(m.id);
                        }
                      }}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          {!!(mermas ?? []).length && (() => {
            const activas = (mermas ?? []).filter((m: any) => !m.cancelada);
            const tc = activas.reduce((s: number, m: any) => s + (m.total_costo ?? 0), 0);
            const tv = activas.reduce((s: number, m: any) => s + (m.total_venta ?? 0), 0);
            return (
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={5} className="text-[11px] text-muted-foreground font-semibold">Totales activas ({activas.length})</TableCell>
                  <TableCell className="text-right font-bold tabular-nums text-destructive">{fmtMoney(tc)}</TableCell>
                  <TableCell className="text-right font-bold tabular-nums">{fmtMoney(tv)}</TableCell>
                  <TableCell colSpan={2} />
                </TableRow>
              </TableFooter>
            );
          })()}
        </Table>
      </div>

      {/* Modal: nueva merma */}
      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
        <DialogContent className="max-w-3xl max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Registrar merma</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Almacén origen *</Label>
              <Select value={almacenId} onValueChange={setAlmacenId}>
                <SelectTrigger><SelectValue placeholder="Selecciona almacén" /></SelectTrigger>
                <SelectContent>
                  {(almacenes ?? []).map((a: any) => (
                    <SelectItem key={a.id} value={a.id}>{a.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Motivo *</Label>
              <Select value={motivoId} onValueChange={setMotivoId}>
                <SelectTrigger><SelectValue placeholder="Selecciona motivo" /></SelectTrigger>
                <SelectContent>
                  {(motivos ?? []).map(m => (
                    <SelectItem key={m.id} value={m.id}>{m.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Observaciones</Label>
            <Textarea value={observaciones} onChange={e => setObservaciones(e.target.value)} rows={2} placeholder="Detalle opcional…" />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Productos</Label>
              <Popover open={productPickerOpen} onOpenChange={setProductPickerOpen}>
                <PopoverTrigger asChild>
                  <Button size="sm" variant="outline"><Plus className="h-4 w-4 mr-1" /> Agregar producto</Button>
                </PopoverTrigger>
                <PopoverContent className="w-[400px] p-0" align="end">
                  <Command>
                    <CommandInput placeholder="Buscar producto…" />
                    <CommandList>
                      <CommandEmpty>Sin resultados</CommandEmpty>
                      <CommandGroup>
                        {(productos ?? []).map((p: any) => (
                          <CommandItem key={p.id} value={`${p.codigo} ${p.nombre}`} onSelect={() => addProducto(p)}>
                            <span className="font-mono text-xs text-muted-foreground mr-2">{p.codigo}</span>
                            {p.nombre}
                            {p.es_granel && <Badge variant="outline" className="ml-2 text-xxs">Granel</Badge>}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            {lineas.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-6 border rounded-md">Aún no agregas productos</div>
            ) : (
              <div className="border rounded-md overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Producto</TableHead>
                      <TableHead className="w-32">Cantidad</TableHead>
                      <TableHead className="w-32">Costo unit.</TableHead>
                      <TableHead className="w-32">Precio venta</TableHead>
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lineas.map((l, idx) => (
                      <TableRow key={l.producto_id}>
                        <TableCell>
                          <div className="font-medium">{l.nombre}</div>
                          <div className="text-xs text-muted-foreground">{l.unidad}</div>
                        </TableCell>
                        <TableCell>
                          <Input type="number" min={0} step="0.001" value={l.cantidad}
                            onChange={e => {
                              const v = Number(e.target.value);
                              setLineas(lineas.map((x, i) => i === idx ? { ...x, cantidad: v } : x));
                            }}
                            className="text-right" />
                        </TableCell>
                        <TableCell>
                          <Input type="number" min={0} step="0.01" value={l.costo_unitario}
                            onChange={e => {
                              const v = Number(e.target.value);
                              setLineas(lineas.map((x, i) => i === idx ? { ...x, costo_unitario: v } : x));
                            }}
                            className="text-right" />
                        </TableCell>
                        <TableCell>
                          <Input type="number" min={0} step="0.01" value={l.precio_venta_unitario}
                            onChange={e => {
                              const v = Number(e.target.value);
                              setLineas(lineas.map((x, i) => i === idx ? { ...x, precio_venta_unitario: v } : x));
                            }}
                            className="text-right" />
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" onClick={() => setLineas(lineas.filter((_, i) => i !== idx))}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {lineas.length > 0 && (
              <div className="flex justify-end gap-6 text-sm">
                <div><span className="text-muted-foreground">Costo perdido: </span><span className="font-semibold">{fmtMoney(totalCosto)}</span></div>
                <div><span className="text-muted-foreground">Venta no realizada: </span><span className="font-semibold">{fmtMoney(totalVenta)}</span></div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={handleSubmit} disabled={registrar.isPending}>
              {registrar.isPending ? 'Guardando…' : 'Registrar merma'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detalle */}
      <Dialog open={!!detalleId} onOpenChange={(v) => !v && setDetalleId(null)}>
        <DialogContent className="max-w-3xl max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Merma {detalle?.folio}</DialogTitle>
          </DialogHeader>
          {detalle && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-muted-foreground">Fecha: </span>{fmtDate(detalle.fecha)}</div>
                <div><span className="text-muted-foreground">Almacén: </span>{(detalle as any).almacenes?.nombre}</div>
                <div><span className="text-muted-foreground">Motivo: </span>{(detalle as any).merma_motivos?.nombre}</div>
                <div><span className="text-muted-foreground">Usuario: </span>{(detalle as any).profiles?.nombre}</div>
              </div>
              {detalle.observaciones && (
                <div className="text-sm bg-muted p-2 rounded">{detalle.observaciones}</div>
              )}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Producto</TableHead>
                    {manejaLotes && <TableHead>Lote</TableHead>}
                    <TableHead className="text-right">Cantidad</TableHead>
                    <TableHead className="text-right">Costo</TableHead>
                    <TableHead className="text-right">Precio venta</TableHead>
                    <TableHead className="text-right">Subtotal costo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {((detalle as any).merma_lineas ?? []).map((l: any) => (
                    <TableRow key={l.id}>
                      <TableCell>{l.productos?.nombre}</TableCell>
                      {manejaLotes && <TableCell><LoteCell lotes={lotesMerma?.[l.producto_id]} /></TableCell>}
                      <TableCell className="text-right">{fmtNum(l.cantidad)} {l.productos?.unidad_granel || ''}</TableCell>
                      <TableCell className="text-right">{fmtMoney(l.costo_unitario)}</TableCell>
                      <TableCell className="text-right">{fmtMoney(l.precio_venta_unitario)}</TableCell>
                      <TableCell className="text-right">{fmtMoney(l.subtotal_costo)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="flex justify-end gap-6 text-sm border-t pt-2">
                <div><span className="text-muted-foreground">Total costo: </span><span className="font-bold">{fmtMoney(detalle.total_costo)}</span></div>
                <div><span className="text-muted-foreground">Total venta: </span><span className="font-bold">{fmtMoney(detalle.total_venta)}</span></div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
