import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { ArrowLeft, Check, X, Plus, Truck } from 'lucide-react';
import { OdooStatusbar } from '@/components/OdooStatusbar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TableSkeleton } from '@/components/TableSkeleton';
import SearchableSelect from '@/components/SearchableSelect';
import ProductSearchInput from '@/components/ProductSearchInput';
import { useEntrega, useValidarEntrega, useCancelarEntrega, useVendedoresList } from '@/hooks/useEntregas';
import { useProductosForSelect, useAlmacenes } from '@/hooks/useData';
import { useClientes } from '@/hooks/useClientes';
import { supabase } from '@/lib/supabase';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { cn, fmtDate } from '@/lib/utils';

type StatusEntrega = 'borrador' | 'listo' | 'hecho' | 'cancelado';

const STEPS: { key: StatusEntrega; label: string }[] = [
  { key: 'borrador', label: 'Borrador' },
  { key: 'listo', label: 'Listo' },
  { key: 'hecho', label: 'Hecho' },
];

export default function EntregaFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { empresa, user } = useAuth();
  const qc = useQueryClient();
  const isNew = id === 'nuevo';

  const { data: entrega, isLoading } = useEntrega(isNew ? undefined : id);
  const validarMut = useValidarEntrega();
  const cancelarMut = useCancelarEntrega();
  const { data: vendedores } = useVendedoresList();
  const { data: productosList } = useProductosForSelect();
  const { data: almacenesList } = useAlmacenes();
  const { data: clientesList } = useClientes();

  const [lineas, setLineas] = useState<any[]>([]);
  const [form, setForm] = useState<any>({});
  const [dirty, setDirty] = useState(false);

  const readOnly = !isNew && form.status === 'hecho' || form.status === 'cancelado';

  useEffect(() => {
    if (entrega) {
      setForm(entrega);
      setLineas((entrega as any).entrega_lineas ?? []);
    }
  }, [entrega]);

  const updateLinea = (idx: number, field: string, val: any) => {
    if (readOnly) return;
    setLineas(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: val };
      // Auto-set hecho when cantidad_entregada equals cantidad_pedida
      if (field === 'cantidad_entregada') {
        next[idx].hecho = Number(val) >= Number(next[idx].cantidad_pedida);
      }
      return next;
    });
    setDirty(true);
  };

  const handleStatusChange = async (newStatus: StatusEntrega) => {
    if (!form.id) return;
    // Only allow forward transitions
    const order: StatusEntrega[] = ['borrador', 'listo', 'hecho'];
    const currentIdx = order.indexOf(form.status);
    const newIdx = order.indexOf(newStatus);
    if (newIdx <= currentIdx) return;

    if (newStatus === 'listo') {
      // Save lineas and advance to listo
      for (const l of lineas) {
        if (l.id) {
          await supabase.from('entrega_lineas').update({
            cantidad_entregada: l.cantidad_entregada,
            hecho: l.hecho,
          }).eq('id', l.id);
        }
      }
      await supabase.from('entregas').update({ status: 'listo' } as any).eq('id', form.id);
      toast.success('Entrega marcada como lista');
      qc.invalidateQueries({ queryKey: ['entrega', form.id] });
      qc.invalidateQueries({ queryKey: ['entregas-list'] });
      setForm((prev: any) => ({ ...prev, status: 'listo' }));
      return;
    }

    if (newStatus === 'hecho') {
      // Validate
      const items = lineas.map(l => ({
        id: l.id,
        producto_id: l.producto_id,
        cantidad_entregada: Number(l.cantidad_entregada) || 0,
        hecho: l.hecho ?? false,
      }));

      const hasPartial = items.some(l => l.cantidad_entregada > 0 && l.cantidad_entregada < Number(lineas.find(ll => ll.id === l.id)?.cantidad_pedida ?? 0));

      try {
        await validarMut.mutateAsync({ entregaId: form.id, lineas: items });
        toast.success('Entrega validada — stock asignado al camión');
        setForm((prev: any) => ({ ...prev, status: 'hecho' }));
      } catch (e: any) {
        toast.error(e.message);
      }
      return;
    }
  };

  const handleCancelar = async () => {
    if (!form.id) return;
    try {
      await cancelarMut.mutateAsync(form.id);
      toast.success('Entrega cancelada');
      setForm((prev: any) => ({ ...prev, status: 'cancelado' }));
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  // New entrega creation
  const handleCreateManual = async () => {
    if (!form.cliente_id || !empresa?.id) {
      toast.error('Selecciona un cliente');
      return;
    }
    const validLineas = lineas.filter(l => l.producto_id && Number(l.cantidad_pedida) > 0);
    if (validLineas.length === 0) {
      toast.error('Agrega al menos un producto');
      return;
    }

    try {
      const { data: ent, error } = await supabase.from('entregas').insert({
        empresa_id: empresa.id,
        vendedor_id: form.vendedor_id ?? null,
        cliente_id: form.cliente_id,
        almacen_id: form.almacen_id ?? null,
        status: 'borrador',
      } as any).select('id').single();
      if (error) throw error;

      const { error: lErr } = await supabase.from('entrega_lineas').insert(
        validLineas.map((l: any) => ({
          entrega_id: ent.id,
          producto_id: l.producto_id,
          unidad_id: l.unidad_id ?? null,
          cantidad_pedida: Number(l.cantidad_pedida),
          cantidad_entregada: Number(l.cantidad_pedida),
          hecho: false,
        }))
      );
      if (lErr) throw lErr;

      toast.success('Entrega creada');
      navigate(`/entregas/${ent.id}`, { replace: true });
    } catch (e: any) {
      toast.error(e.message);
    }
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

  return (
    <div className="min-h-full">
      {/* Header */}
      <div className="bg-card border-b border-border px-5 py-2.5 flex items-center justify-between gap-3 sticky top-0 z-10">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={() => navigate('/entregas')} className="btn-odoo-secondary !px-2.5">
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
        <div className="flex items-center gap-2 shrink-0">
          {isNew && (
            <button onClick={handleCreateManual} className="btn-odoo-primary">Crear</button>
          )}
          {!isNew && form.status === 'borrador' && (
            <button onClick={() => handleStatusChange('listo')} className="btn-odoo-primary">Marcar listo</button>
          )}
          {!isNew && (form.status === 'borrador' || form.status === 'listo') && (
            <button onClick={() => handleStatusChange('hecho')} className="btn-odoo-primary">
              <Check className="h-3.5 w-3.5" /> Validar entrega
            </button>
          )}
          {!isNew && form.status !== 'cancelado' && form.status !== 'hecho' && (
            <button onClick={handleCancelar} className="btn-odoo-secondary text-destructive text-xs">Cancelar</button>
          )}
        </div>
      </div>

      {/* Statusbar */}
      {!isNew && (
        <div className="px-5 pt-3">
          <OdooStatusbar
            steps={STEPS}
            current={form.status ?? 'borrador'}
            onStepClick={readOnly ? undefined : (k => handleStatusChange(k as StatusEntrega))}
          />
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
                <label className="label-odoo">Vendedor destino</label>
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
                <label className="label-odoo">Almacén origen</label>
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
              {form.validado_at && (
                <div>
                  <label className="label-odoo">Validado</label>
                  <div className="text-[11px] text-muted-foreground py-1.5 px-1">{new Date(form.validado_at).toLocaleString('es-MX')}</div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Lines table */}
        <div className="bg-card border border-border rounded-md">
          <div className="p-4">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-table-border text-left">
                  <th className="py-2 px-2 text-muted-foreground font-medium text-[11px] w-8">#</th>
                  <th className="py-2 px-2 text-muted-foreground font-medium text-[11px] min-w-[240px]">Producto</th>
                  <th className="py-2 px-2 text-muted-foreground font-medium text-[11px] w-16 text-center">Unidad</th>
                  <th className="py-2 px-2 text-muted-foreground font-medium text-[11px] w-24 text-right">Cant. pedida</th>
                  <th className="py-2 px-2 text-muted-foreground font-medium text-[11px] w-28 text-right">Cant. a entregar</th>
                  <th className="py-2 px-2 text-muted-foreground font-medium text-[11px] w-16 text-center">Hecho</th>
                  <th className="py-2 px-2 text-muted-foreground font-medium text-[11px] w-24"></th>
                </tr>
              </thead>
              <tbody>
                {lineas.map((l: any, idx: number) => {
                  const prod = productosList?.find((p: any) => p.id === l.producto_id);
                  const cantPedida = Number(l.cantidad_pedida) || 0;
                  const cantEntregada = Number(l.cantidad_entregada) || 0;
                  const isPartial = cantEntregada > 0 && cantEntregada < cantPedida;
                  const isSinStock = cantEntregada === 0 && cantPedida > 0;
                  const unidad = l.unidades?.abreviatura || (prod as any)?.unidades_venta?.abreviatura || '';

                  return (
                    <tr key={l.id ?? idx} className={cn(
                      "border-b border-table-border transition-colors group",
                      isPartial && "bg-warning/10",
                      isSinStock && "bg-destructive/10"
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
                            {l.productos ? `${l.productos.codigo} · ${l.productos.nombre}` : prod ? `${prod.codigo} · ${prod.nombre}` : '—'}
                          </span>
                        )}
                      </td>
                      <td className="py-1.5 px-2 text-center text-muted-foreground text-[12px]">{unidad || '—'}</td>
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
                                next[idx] = { ...next[idx], cantidad_pedida: v, cantidad_entregada: v };
                                return next;
                              });
                            }}
                            min="0"
                          />
                        ) : (
                          cantPedida
                        )}
                      </td>
                      <td className="py-1 px-2">
                        {readOnly ? (
                          <span className="text-[12px] block text-right">{cantEntregada}</span>
                        ) : (
                          <input
                            type="number"
                            inputMode="numeric"
                            className="inline-edit-input text-[12px] text-right !py-1 w-full"
                            value={l.cantidad_entregada ?? ''}
                            onChange={e => updateLinea(idx, 'cantidad_entregada', e.target.value)}
                            min="0"
                            max={cantPedida || undefined}
                          />
                        )}
                      </td>
                      <td className="py-1.5 px-2 text-center">
                        <input
                          type="checkbox"
                          checked={!!l.hecho}
                          disabled={readOnly}
                          onChange={e => updateLinea(idx, 'hecho', e.target.checked)}
                          className="rounded border-input h-4 w-4"
                        />
                      </td>
                      <td className="py-1.5 px-2">
                        {isPartial && <Badge variant="outline" className="text-[10px] border-warning text-warning">Parcial</Badge>}
                        {isSinStock && <Badge variant="destructive" className="text-[10px]">Sin stock</Badge>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {(isNew || (!readOnly && (form.status === 'borrador'))) && (
              <button onClick={addLine} className="btn-odoo-secondary text-xs mt-3">
                <Plus className="h-3 w-3" /> Agregar producto
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
