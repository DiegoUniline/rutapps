import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { ArrowLeft, Check, X, Plus, Truck, Package, PackageCheck, Zap, FileText } from 'lucide-react';
import { OdooStatusbar } from '@/components/OdooStatusbar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TableSkeleton } from '@/components/TableSkeleton';
import SearchableSelect from '@/components/SearchableSelect';
import ModalSelect from '@/components/ModalSelect';
import ProductSearchInput from '@/components/ProductSearchInput';
import {
  useEntrega, useSurtirLinea, useSurtirTodo,
  useAsignarEntrega, useCargarEntrega, useAsignarYCargar,
  useCancelarEntrega, useVendedoresList,
  type StatusEntrega,
} from '@/hooks/useEntregas';
import { useProductosForSelect, useAlmacenes } from '@/hooks/useData';
import { useClientes } from '@/hooks/useClientes';
import { supabase } from '@/lib/supabase';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { cn, fmtDate } from '@/lib/utils';
import { generarEntregaPdf } from '@/lib/entregaPdf';
import DocumentPreviewModal from '@/components/DocumentPreviewModal';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';

const STEPS: { key: StatusEntrega; label: string }[] = [
  { key: 'borrador', label: 'Borrador' },
  { key: 'surtido', label: 'Surtido' },
  { key: 'asignado', label: 'Asignado' },
  { key: 'cargado', label: 'Cargado' },
  { key: 'en_ruta', label: 'En ruta' },
  { key: 'hecho', label: 'Entregado' },
];

export default function EntregaFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { empresa, user } = useAuth();
  const qc = useQueryClient();
  const isNew = id === 'nuevo';

  const { data: entrega, isLoading } = useEntrega(isNew ? undefined : id);
  const surtirLineaMut = useSurtirLinea();
  const surtirTodoMut = useSurtirTodo();
  const asignarMut = useAsignarEntrega();
  const cargarMut = useCargarEntrega();
  const asignarYCargarMut = useAsignarYCargar();
  const cancelarMut = useCancelarEntrega();
  const { data: vendedores } = useVendedoresList();
  const { data: productosList } = useProductosForSelect();
  const { data: almacenesList } = useAlmacenes();
  const { data: clientesList } = useClientes();

  const [lineas, setLineas] = useState<any[]>([]);
  const [form, setForm] = useState<any>({});
  const [showAsignarDialog, setShowAsignarDialog] = useState(false);
  const [showExpressDialog, setShowExpressDialog] = useState(false);
  const [showSurtirDialog, setShowSurtirDialog] = useState(false);
  const [selectedVendedorRuta, setSelectedVendedorRuta] = useState('');
  const [surtirAlmacenId, setSurtirAlmacenId] = useState('');
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [showPdfModal, setShowPdfModal] = useState(false);
  const readOnly = !isNew && (form.status === 'hecho' || form.status === 'cancelado' || form.status === 'cargado' || form.status === 'en_ruta');
  const isSurtido = form.status === 'surtido';
  const isAsignado = form.status === 'asignado';
  const isBorrador = form.status === 'borrador';

  useEffect(() => {
    if (entrega) {
      setForm(entrega);
      setLineas((entrega as any).entrega_lineas ?? []);
    }
  }, [entrega]);

  const allLinesDone = lineas.length > 0 && lineas.every((l: any) => l.hecho);

  // Surtir individual line
  const handleSurtirLinea = async (idx: number) => {
    const l = lineas[idx];
    if (!l.id || !l.almacen_origen_id) {
      toast.error('Selecciona el almacén origen');
      return;
    }
    const cant = Number(l.cantidad_entregada) || Number(l.cantidad_pedida);
    try {
      await surtirLineaMut.mutateAsync({
        lineaId: l.id,
        productoId: l.producto_id,
        almacenOrigenId: l.almacen_origen_id,
        cantidadSurtida: cant,
        entregaId: form.id,
        empresaId: empresa!.id,
      });
      toast.success('Línea surtida');
      setLineas(prev => {
        const next = [...prev];
        next[idx] = { ...next[idx], hecho: true, cantidad_entregada: cant };
        return next;
      });
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  // Open surtir todo dialog
  const openSurtirTodoDialog = () => {
    setSurtirAlmacenId(form.almacen_id ?? '');
    setShowSurtirDialog(true);
  };

  // Surtir all pending lines (after confirming almacén)
  const handleSurtirTodoConfirmado = async () => {
    if (!surtirAlmacenId) {
      toast.error('Selecciona un almacén origen');
      return;
    }
    const pendientes = lineas.filter((l: any) => !l.hecho);
    try {
      await surtirTodoMut.mutateAsync({
        entregaId: form.id,
        lineas: pendientes.map((l: any) => ({
          id: l.id,
          producto_id: l.producto_id,
          cantidad_pedida: Number(l.cantidad_pedida),
          almacen_origen_id: l.almacen_origen_id || surtirAlmacenId,
          hecho: l.hecho,
        })),
        empresaId: empresa!.id,
        almacenDefaultId: surtirAlmacenId,
      });
      toast.success('Todas las líneas surtidas');
      setForm((p: any) => ({ ...p, status: 'surtido', almacen_id: surtirAlmacenId }));
      setLineas(prev => prev.map(l => ({ ...l, hecho: true, cantidad_entregada: l.cantidad_pedida })));
      setShowSurtirDialog(false);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  // Mark as surtido manually if all lines are done
  const handleMarcarSurtido = async () => {
    await supabase.from('entregas').update({ status: 'surtido' } as any).eq('id', form.id);
    setForm((p: any) => ({ ...p, status: 'surtido' }));
    qc.invalidateQueries({ queryKey: ['entrega'] });
    qc.invalidateQueries({ queryKey: ['entregas-list'] });
    toast.success('Entrega marcada como surtida');
  };

  // Assign to route
  const handleAsignar = async () => {
    if (!selectedVendedorRuta) { toast.error('Selecciona un repartidor'); return; }
    try {
      await asignarMut.mutateAsync({ entregaId: form.id, vendedorRutaId: selectedVendedorRuta });
      toast.success('Entrega asignada a ruta');
      setForm((p: any) => ({ ...p, status: 'asignado', vendedor_ruta_id: selectedVendedorRuta }));
      setShowAsignarDialog(false);
    } catch (e: any) { toast.error(e.message); }
  };

  // Load to truck
  const handleCargar = async () => {
    try {
      await cargarMut.mutateAsync({ entregaId: form.id });
      toast.success('Entrega cargada al camión');
      setForm((p: any) => ({ ...p, status: 'cargado' }));
    } catch (e: any) { toast.error(e.message); }
  };

  // Express: assign + load
  const handleExpressAsignarCargar = async () => {
    if (!selectedVendedorRuta) { toast.error('Selecciona un repartidor'); return; }
    try {
      await asignarYCargarMut.mutateAsync({ entregaId: form.id, vendedorRutaId: selectedVendedorRuta });
      toast.success('Entrega asignada y cargada');
      setForm((p: any) => ({ ...p, status: 'cargado', vendedor_ruta_id: selectedVendedorRuta }));
      setShowExpressDialog(false);
    } catch (e: any) { toast.error(e.message); }
  };

  const handleCancelar = async () => {
    if (!form.id) return;
    try {
      await cancelarMut.mutateAsync(form.id);
      toast.success('Entrega cancelada');
      setForm((prev: any) => ({ ...prev, status: 'cancelado' }));
    } catch (e: any) { toast.error(e.message); }
  };

  const updateLineaLocal = (idx: number, field: string, val: any) => {
    setLineas(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: val };
      return next;
    });
  };

  const addLine = () => {
    setLineas(prev => [...prev, { producto_id: '', cantidad_pedida: 0, cantidad_entregada: 0, hecho: false }]);
  };

  if (!isNew && isLoading) {
    return <div className="p-4 min-h-full"><TableSkeleton rows={6} cols={4} /></div>;
  }

  const vendedorOptions = (vendedores ?? []).map(v => ({ value: v.id, label: v.nombre }));
  const clienteOptions = (clientesList ?? []).map(c => ({ value: c.id, label: `${c.codigo ? c.codigo + ' · ' : ''}${c.nombre}` }));
  const almacenOptions = (almacenesList ?? []).map(a => ({ value: a.id, label: a.nombre }));

  // Stock summary for surtir dialog
  const pendientesParaSurtir = lineas.filter((l: any) => !l.hecho);
  const resumenSurtir = pendientesParaSurtir.map((l: any) => {
    const prod = l.productos ?? productosList?.find((p: any) => p.id === l.producto_id);
    return {
      nombre: prod ? `${prod.codigo} · ${prod.nombre}` : '—',
      pedida: Number(l.cantidad_pedida) || 0,
      stock: prod?.cantidad ?? 0,
    };
  });

  return (
    <div className="min-h-full">
      {/* Header */}
      <div className="bg-card border-b border-border px-5 py-2.5 flex items-center justify-between gap-3 sticky top-0 z-10">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={() => navigate('/logistica/entregas')} className="btn-odoo-secondary !px-2.5">
            <ArrowLeft className="h-3.5 w-3.5" />
          </button>
          <div className="min-w-0">
            <h1 className="text-[15px] font-semibold text-foreground truncate flex items-center gap-2">
              <Truck className="h-4 w-4" />
              {isNew ? 'Nueva entrega' : (form.folio || 'Entrega')}
            </h1>
            {form.clientes?.nombre && <p className="text-xs text-muted-foreground truncate">{form.clientes.nombre}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          {/* Surtir todo — only in borrador when lines exist */}
          {!isNew && isBorrador && lineas.length > 0 && !allLinesDone && (
            <Button onClick={openSurtirTodoDialog} size="sm" variant="default" disabled={surtirTodoMut.isPending}>
              <PackageCheck className="h-3.5 w-3.5" /> Surtir todo
            </Button>
          )}
          {/* Mark surtido if all lines done but status still borrador */}
          {!isNew && isBorrador && allLinesDone && (
            <Button onClick={handleMarcarSurtido} size="sm">
              <Check className="h-3.5 w-3.5" /> Marcar surtido
            </Button>
          )}
          {/* Asignar — only when surtido */}
          {!isNew && isSurtido && (
            <>
              <Button onClick={() => setShowAsignarDialog(true)} size="sm" variant="outline">
                <Package className="h-3.5 w-3.5" /> Asignar ruta
              </Button>
              <Button onClick={() => setShowExpressDialog(true)} size="sm" variant="default">
                <Zap className="h-3.5 w-3.5" /> Asignar y cargar
              </Button>
            </>
          )}
          {/* Cargar — only when asignado */}
          {!isNew && isAsignado && (
            <Button onClick={handleCargar} size="sm" disabled={cargarMut.isPending}>
              <Truck className="h-3.5 w-3.5" /> Cargar camión
            </Button>
          )}
          {/* Cancel */}
          {!isNew && !readOnly && (
            <Button onClick={handleCancelar} size="sm" variant="ghost" className="text-destructive text-xs">Cancelar</Button>
          )}
        </div>
      </div>

      {/* Statusbar */}
      {!isNew && (
        <div className="px-5 pt-3">
          <OdooStatusbar steps={STEPS} current={form.status ?? 'borrador'} />
        </div>
      )}

      <div className="p-5 space-y-4 max-w-[1200px]">
        {/* Header card */}
        <div className="bg-card border border-border rounded-md p-5">
          {readOnly && (
            <div className="mb-3 text-xs text-muted-foreground bg-muted/60 border border-border px-3 py-2 rounded flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-muted-foreground/50" />
              Esta entrega está {form.status} y no se puede editar.
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-3">
              <div>
                <label className="label-odoo">Cliente</label>
                {readOnly || !isNew ? (
                  <div className="text-[13px] py-1.5 px-1 text-foreground">{form.clientes?.nombre ?? clientesList?.find(c => c.id === form.cliente_id)?.nombre ?? '—'}</div>
                ) : (
                  <SearchableSelect options={clienteOptions} value={form.cliente_id ?? ''} onChange={v => setForm((p: any) => ({ ...p, cliente_id: v }))} placeholder="Buscar cliente..." />
                )}
              </div>
              <div>
                <label className="label-odoo">Vendedor</label>
                {readOnly || !isNew ? (
                  <div className="text-[13px] py-1.5 px-1 text-foreground">{form.vendedores?.nombre ?? vendedores?.find(v => v.id === form.vendedor_id)?.nombre ?? '—'}</div>
                ) : (
                  <SearchableSelect options={vendedorOptions} value={form.vendedor_id ?? ''} onChange={v => setForm((p: any) => ({ ...p, vendedor_id: v }))} placeholder="Vendedor..." />
                )}
              </div>
            </div>
            <div className="space-y-3">
              <div>
                <label className="label-odoo">Folio</label>
                <div className="text-[13px] text-muted-foreground py-1.5 px-1">{form.folio || (isNew ? 'Se asigna al guardar' : '—')}</div>
              </div>
              <div>
                <label className="label-odoo">Pedido origen</label>
                <div className="text-[13px] py-1.5 px-1">
                  {form.pedido_id ? (
                    <Link to={`/ventas/${form.pedido_id}`} className="text-primary hover:underline">
                      {(form as any).ventas?.folio ?? form.pedido_id}
                    </Link>
                  ) : '—'}
                </div>
              </div>
            </div>
            <div className="space-y-3">
              <div>
                <label className="label-odoo">Almacén por defecto</label>
                {readOnly || !isNew ? (
                  <div className="text-[13px] py-1.5 px-1 text-foreground">{form.almacenes?.nombre ?? almacenesList?.find(a => a.id === form.almacen_id)?.nombre ?? '—'}</div>
                ) : (
                  <SearchableSelect options={almacenOptions} value={form.almacen_id ?? ''} onChange={v => setForm((p: any) => ({ ...p, almacen_id: v }))} placeholder="Almacén..." />
                )}
              </div>
              <div>
                <label className="label-odoo">Fecha</label>
                <div className="text-[13px] py-1.5 px-1 text-foreground">{fmtDate(form.fecha) || fmtDate(new Date().toISOString())}</div>
              </div>
              {form.vendedor_ruta_id && (
                <div>
                  <label className="label-odoo">Repartidor asignado</label>
                  <div className="text-[13px] py-1.5 px-1 text-foreground">{vendedores?.find(v => v.id === form.vendedor_ruta_id)?.nombre ?? '—'}</div>
                </div>
              )}
              {form.fecha_asignacion && (
                <div>
                  <label className="label-odoo">Asignado</label>
                  <div className="text-[11px] text-muted-foreground py-1.5 px-1">{new Date(form.fecha_asignacion).toLocaleString('es-MX')}</div>
                </div>
              )}
              {form.fecha_carga && (
                <div>
                  <label className="label-odoo">Cargado</label>
                  <div className="text-[11px] text-muted-foreground py-1.5 px-1">{new Date(form.fecha_carga).toLocaleString('es-MX')}</div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Lines table */}
        <div className="bg-card border border-border rounded-md">
          <div className="p-4 overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-table-border text-left">
                  <th className="py-2 px-2 text-muted-foreground font-medium text-[11px] w-8">#</th>
                  <th className="py-2 px-2 text-muted-foreground font-medium text-[11px] min-w-[200px]">Producto</th>
                  <th className="py-2 px-2 text-muted-foreground font-medium text-[11px] w-36">Almacén origen</th>
                  <th className="py-2 px-2 text-muted-foreground font-medium text-[11px] w-20 text-right">Stock</th>
                  <th className="py-2 px-2 text-muted-foreground font-medium text-[11px] w-24 text-right">Pedida</th>
                  <th className="py-2 px-2 text-muted-foreground font-medium text-[11px] w-24 text-right">Surtida</th>
                  <th className="py-2 px-2 text-muted-foreground font-medium text-[11px] w-16 text-center">Hecho</th>
                  <th className="py-2 px-2 text-muted-foreground font-medium text-[11px] w-24"></th>
                </tr>
              </thead>
              <tbody>
                {lineas.map((l: any, idx: number) => {
                  const prod = l.productos ?? productosList?.find((p: any) => p.id === l.producto_id);
                  const stock = prod?.cantidad ?? 0;
                  const cantPedida = Number(l.cantidad_pedida) || 0;
                  const cantEntregada = Number(l.cantidad_entregada) || 0;
                  const almNombre = l.almacenes?.nombre;

                  return (
                    <tr key={l.id ?? idx} className={cn(
                      "border-b border-table-border transition-colors group",
                      l.hecho && "bg-primary/5",
                      !l.hecho && cantPedida > stock && "bg-destructive/5"
                    )}>
                      <td className="py-1.5 px-2 text-muted-foreground text-xs">{idx + 1}</td>
                      <td className="py-1 px-2">
                        {isNew && !l.id ? (
                          <ProductSearchInput
                            products={(productosList ?? []).map((p: any) => ({ id: p.id, codigo: p.codigo, nombre: p.nombre, precio_principal: p.precio_principal }))}
                            value={l.producto_id ?? ''}
                            displayText={prod ? `${prod.codigo} · ${prod.nombre}` : undefined}
                            onSelect={pid => {
                              const p = productosList?.find((pp: any) => pp.id === pid);
                              setLineas(prev => {
                                const next = [...prev];
                                next[idx] = { ...next[idx], producto_id: pid, unidad_id: p?.unidad_venta_id };
                                return next;
                              });
                            }}
                            readOnly={readOnly}
                          />
                        ) : (
                          <span className="text-[12px]">
                            {prod ? `${prod.codigo} · ${prod.nombre}` : '—'}
                          </span>
                        )}
                      </td>
                      {/* Almacén origen per line */}
                      <td className="py-1 px-2">
                        {l.hecho ? (
                          <span className="text-[12px] text-muted-foreground">{almNombre ?? '—'}</span>
                        ) : isBorrador || isNew ? (
                          <SearchableSelect
                            options={almacenOptions}
                            value={l.almacen_origen_id ?? form.almacen_id ?? ''}
                            onChange={v => updateLineaLocal(idx, 'almacen_origen_id', v)}
                            placeholder="Origen..."
                          />
                        ) : (
                          <span className="text-[12px] text-muted-foreground">{almNombre ?? '—'}</span>
                        )}
                      </td>
                      <td className="py-1.5 px-2 text-right text-[12px]">
                        <span className={cn(cantPedida > stock && !l.hecho ? 'text-destructive font-medium' : 'text-muted-foreground')}>
                          {stock}
                        </span>
                      </td>
                      <td className="py-1.5 px-2 text-right text-[12px]">
                        {isNew && !l.id ? (
                          <input
                            type="number"
                            inputMode="numeric"
                            className="inline-edit-input text-[12px] text-right !py-1 w-full"
                            value={l.cantidad_pedida ?? ''}
                            onChange={e => {
                              const v = e.target.value;
                              setLineas(prev => {
                                const next = [...prev];
                                next[idx] = { ...next[idx], cantidad_pedida: v };
                                return next;
                              });
                            }}
                            min="0"
                          />
                        ) : cantPedida}
                      </td>
                      <td className="py-1.5 px-2 text-right text-[12px]">
                        {l.hecho ? (
                          <span className="font-medium text-primary">{cantEntregada}</span>
                        ) : isBorrador ? (
                          <input
                            type="number"
                            inputMode="numeric"
                            className="inline-edit-input text-[12px] text-right !py-1 w-full"
                            value={l.cantidad_entregada ?? l.cantidad_pedida ?? ''}
                            onChange={e => updateLineaLocal(idx, 'cantidad_entregada', e.target.value)}
                            min="0"
                            max={cantPedida || undefined}
                          />
                        ) : (
                          <span>{cantEntregada}</span>
                        )}
                      </td>
                      <td className="py-1.5 px-2 text-center">
                        {l.hecho ? (
                          <Check className="h-4 w-4 text-primary mx-auto" />
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </td>
                      <td className="py-1.5 px-2">
                        {!l.hecho && isBorrador && l.id && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-[11px] h-7"
                            disabled={surtirLineaMut.isPending}
                            onClick={() => handleSurtirLinea(idx)}
                          >
                            Surtir
                          </Button>
                        )}
                        {l.hecho && (
                          <Badge className="text-[10px] bg-primary/10 text-primary border-primary/20">Surtido</Badge>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {(isNew || isBorrador) && (
              <button onClick={addLine} className="btn-odoo-secondary text-xs mt-3">
                <Plus className="h-3 w-3" /> Agregar producto
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ─── Dialog: Surtir todo (confirmar almacén) ─── */}
      <Dialog open={showSurtirDialog} onOpenChange={setShowSurtirDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PackageCheck className="h-5 w-5 text-primary" />
              Surtir todo
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Se descontará stock del almacén origen para <span className="font-bold text-foreground">{pendientesParaSurtir.length}</span> línea(s) pendiente(s).
            </p>

            <div>
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide block mb-1.5">
                Almacén origen *
              </label>
              <ModalSelect
                options={almacenOptions}
                value={surtirAlmacenId}
                onChange={setSurtirAlmacenId}
                placeholder="Seleccionar almacén..."
              />
            </div>

            {/* Resumen de productos y stock */}
            <div className="bg-muted/50 rounded-lg overflow-hidden">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-1.5 px-3 text-muted-foreground font-medium">Producto</th>
                    <th className="text-right py-1.5 px-3 text-muted-foreground font-medium">Pedida</th>
                    <th className="text-right py-1.5 px-3 text-muted-foreground font-medium">Stock</th>
                  </tr>
                </thead>
                <tbody>
                  {resumenSurtir.map((r, i) => (
                    <tr key={i} className="border-b border-border/50">
                      <td className="py-1.5 px-3 truncate max-w-[200px]">{r.nombre}</td>
                      <td className="py-1.5 px-3 text-right font-medium">{r.pedida}</td>
                      <td className={cn("py-1.5 px-3 text-right font-medium", r.pedida > r.stock ? "text-destructive" : "text-muted-foreground")}>
                        {r.stock}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {resumenSurtir.some(r => r.pedida > r.stock) && (
              <p className="text-[11px] text-destructive flex items-center gap-1">
                ⚠️ Hay productos con stock insuficiente. Se detendrá el proceso si no alcanza.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSurtirDialog(false)}>Cancelar</Button>
            <Button
              onClick={handleSurtirTodoConfirmado}
              disabled={!surtirAlmacenId || surtirTodoMut.isPending}
            >
              {surtirTodoMut.isPending ? 'Surtiendo...' : 'Confirmar surtido'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Asignar ruta dialog */}
      <Dialog open={showAsignarDialog} onOpenChange={setShowAsignarDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Asignar a ruta</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <label className="label-odoo">Repartidor / Vendedor</label>
            <ModalSelect
              options={vendedorOptions}
              value={selectedVendedorRuta}
              onChange={setSelectedVendedorRuta}
              placeholder="Seleccionar repartidor..."
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAsignarDialog(false)}>Cancelar</Button>
            <Button onClick={handleAsignar} disabled={asignarMut.isPending}>Asignar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Express assign + load dialog */}
      <Dialog open={showExpressDialog} onOpenChange={setShowExpressDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Zap className="h-4 w-4" /> Asignar y cargar</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Se asignará la ruta y se cargará directamente al camión.</p>
          <div className="space-y-3 py-2">
            <label className="label-odoo">Repartidor / Vendedor</label>
            <ModalSelect
              options={vendedorOptions}
              value={selectedVendedorRuta}
              onChange={setSelectedVendedorRuta}
              placeholder="Seleccionar repartidor..."
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowExpressDialog(false)}>Cancelar</Button>
            <Button onClick={handleExpressAsignarCargar} disabled={asignarYCargarMut.isPending}>
              <Zap className="h-3.5 w-3.5" /> Asignar y cargar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
