import { useCallback, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useSaveDevolucion, usePrecioDevolucionCliente, useMermaMotivoConfig } from '@/hooks/useDevoluciones';
import { useCurrency } from '@/hooks/useCurrency';
import { todayInTimezone } from '@/lib/utils';
import {
  destinoSugerido, resumenDevolucion,
  type AccionDevolucionUI, type DestinoDevolucion,
} from '@/lib/devolucionGuardado';
import { precioPorPiezaDeVenta, type ProductoPrecioDevolucion } from '@/lib/devolucionPrecio';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, RotateCcw, Plus, Trash2, Search } from 'lucide-react';

const MOTIVOS = [
  { value: 'no_vendido', label: 'No vendido' },
  { value: 'cambio', label: 'Cambio' },
  { value: 'error_pedido', label: 'Error de pedido' },
  { value: 'danado', label: 'Dañado' },
  { value: 'vencido', label: 'Vencido' },
  { value: 'caducado', label: 'Caducado' },
  { value: 'otro', label: 'Otro' },
];

const METODOS = [
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'tarjeta', label: 'Tarjeta' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'deposito', label: 'Depósito' },
];

type DestinoValor = 'saldo_favor' | 'aplicar_venta' | 'devolver_dinero' | 'reposicion';
const ACCION_POR_DESTINO: Record<DestinoValor, AccionDevolucionUI> = {
  saldo_favor: 'nota_credito', aplicar_venta: 'aplicar_venta', devolver_dinero: 'devolucion_dinero', reposicion: 'reposicion',
};

const SELECT_PRODUCTO = 'id, codigo, nombre, precio_principal, costo, clasificacion_id, lista_id, tiene_iva, iva_pct, tiene_ieps, ieps_pct, ieps_tipo, usa_listas_precio, costo_incluye_impuestos';
type ProductoDev = ProductoPrecioDevolucion & { codigo?: string | null; nombre: string };

interface Renglon {
  producto: ProductoDev;
  cantidad: number;
  motivo: string;
  destino: DestinoDevolucion;
  destinoElegido: boolean;
}

interface Props {
  venta: { id: string; folio?: string | null; cliente_id?: string | null };
  onClose: () => void;
  onDone: () => void;
}

/**
 * Devolución desde escritorio (D-049): cualquier producto (los de la venta solo se
 * sugieren), sin tope. Precio (D-070): el producto que está en esta venta se acredita al precio
 * por pieza con que se vendió (total del renglón / cantidad, con impuestos; respeta precio de
 * caja/presentación y descuentos); el que no está en la venta, al precio de la lista del cliente; por renglón vendible
 * (almacén elegido) o merma (almacén Mermas). Una sola vía: RPC registrar_devolucion.
 */
export function DevolucionVentaModal({ venta, onClose, onDone }: Props) {
  const { empresa } = useAuth();
  const { fmt } = useCurrency();
  const save = useSaveDevolucion();
  const { precio: precioLista, cargando: cargandoPrecios } = usePrecioDevolucionCliente(venta.cliente_id);
  const { data: mermaConfig } = useMermaMotivoConfig();

  const [renglones, setRenglones] = useState<Renglon[]>([]);
  const [busca, setBusca] = useState('');
  const [almacenId, setAlmacenId] = useState('');
  const [destino, setDestino] = useState<DestinoValor>('saldo_favor');
  const [reembolsoMetodo, setReembolsoMetodo] = useState('efectivo');
  const [registrarGasto, setRegistrarGasto] = useState(false);
  const [notas, setNotas] = useState('');
  const [saving, setSaving] = useState(false);

  // Productos de la venta: atajo para agregarlos (la devolución no se limita a ellos).
  const { data: productosVenta = [] } = useQuery({
    queryKey: ['venta-productos-devolucion', venta.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('venta_lineas')
        .select(`producto_id, cantidad, total, productos!venta_lineas_producto_id_fkey(${SELECT_PRODUCTO})`)
        .eq('venta_id', venta.id);
      if (error) throw error;
      const vistos = new Map<string, { producto: ProductoDev; vendida: number; importe: number }>();
      for (const l of (data ?? []) as unknown as { producto_id: string | null; cantidad: number | null; total: number | null; productos: ProductoDev | null }[]) {
        if (!l.producto_id || !l.productos) continue;
        const prev = vistos.get(l.producto_id);
        vistos.set(l.producto_id, {
          producto: l.productos,
          vendida: (prev?.vendida ?? 0) + (Number(l.cantidad) || 0),
          importe: (prev?.importe ?? 0) + (Number(l.total) || 0),
        });
      }
      return [...vistos.values()];
    },
  });

  const termino = busca.trim();
  const { data: encontrados = [] } = useQuery({
    queryKey: ['productos-devolucion-busca', empresa?.id, termino],
    enabled: !!empresa?.id && termino.length >= 2,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const t = termino.replace(/[%,()]/g, ' ');
      const { data, error } = await supabase
        .from('productos')
        .select(SELECT_PRODUCTO)
        .eq('empresa_id', empresa!.id)
        .eq('status', 'activo')
        .or(`nombre.ilike.%${t}%,codigo.ilike.%${t}%`)
        .order('nombre')
        .limit(20);
      if (error) throw error;
      return (data ?? []) as unknown as ProductoDev[];
    },
  });

  const { data: ventaInfo } = useQuery({
    queryKey: ['venta-info-devolucion', venta.id],
    queryFn: async () => {
      const { data } = await supabase.from('ventas').select('total, saldo_pendiente').eq('id', venta.id).maybeSingle();
      return data;
    },
  });
  const ventaTotal = Number(ventaInfo?.total) || 0;
  const ventaSaldo = Number(ventaInfo?.saldo_pendiente) || 0;
  const tieneSaldo = ventaSaldo > 0.01;

  const { data: almacenes = [] } = useQuery({
    queryKey: ['almacenes-devolucion', empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from('almacenes').select('id, nombre, es_merma, activo')
        .eq('empresa_id', empresa!.id).eq('activo', true)
        .order('es_merma').order('nombre');
      return data ?? [];
    },
  });
  const almacenesVendibles = (almacenes as { id: string; nombre: string; es_merma: boolean | null }[]).filter(a => !a.es_merma);

  // D-070: precio por pieza de esta venta (con impuestos) para los productos que trae; los demás, lista del cliente.
  const precioVenta = useMemo(() => precioPorPiezaDeVenta(productosVenta.map(pv => ({ producto_id: pv.producto.id, cantidad: pv.vendida, total: pv.importe }))), [productosVenta]);
  const precio = useCallback((p: ProductoDev) => precioVenta.get(p.id) ?? precioLista(p), [precioVenta, precioLista]);

  const accion = ACCION_POR_DESTINO[destino];
  const lineas = useMemo(() => renglones.map(r => ({
    producto_id: r.producto.id,
    cantidad: r.cantidad,
    motivo: r.motivo,
    destino: r.destino,
    accion,
    precio_unitario: precio(r.producto),
  })), [renglones, accion, precio]);
  const resumen = resumenDevolucion(lineas);
  const valor = resumen.nota + resumen.notaAplicada + resumen.dinero;
  const aplicadoVenta = Math.min(resumen.notaAplicada, ventaSaldo);

  const agregar = (p: ProductoDev) => {
    setRenglones(prev => prev.some(r => r.producto.id === p.id)
      ? prev.map(r => r.producto.id === p.id ? { ...r, cantidad: r.cantidad + 1 } : r)
      : [...prev, { producto: p, cantidad: 1, motivo: 'no_vendido', destino: destinoSugerido('no_vendido', mermaConfig), destinoElegido: false }]);
    setBusca('');
  };
  const cambiar = (pid: string, cambio: Partial<Renglon>) =>
    setRenglones(prev => prev.map(r => {
      if (r.producto.id !== pid) return r;
      const next = { ...r, ...cambio };
      if (cambio.motivo && !r.destinoElegido) next.destino = destinoSugerido(cambio.motivo, mermaConfig);
      if (cambio.destino) next.destinoElegido = true;
      return next;
    }));

  const almacenMermas = (almacenes as { id: string; es_merma: boolean | null }[]).find(a => a.es_merma)?.id;
  const necesitaAlmacen = renglones.some(r => r.destino === 'vendible') || destino === 'reposicion' || !almacenMermas;
  const cantidadesOk = renglones.every(r => Number.isFinite(r.cantidad) && r.cantidad > 0);
  const canSave = !saving && !cargandoPrecios && renglones.length > 0 && cantidadesOk && (!necesitaAlmacen || !!almacenId);

  const handleSave = async () => {
    if (!empresa?.id) return;
    if (necesitaAlmacen && !almacenId) { toast.error('Elige el almacén para lo vendible'); return; }
    if (!cantidadesOk) { toast.error('La cantidad a devolver debe ser mayor a cero'); return; }
    setSaving(true);
    try {
      const esDinero = destino === 'devolver_dinero';
      await save.mutateAsync({
        devolucion: {
          venta_id: venta.id,
          cliente_id: venta.cliente_id ?? undefined,
          // Merma va a Mermas; si todo es merma y no hay reposición, el almacén no se usa.
          almacen_destino_id: almacenId || almacenMermas,
          reembolso_metodo: esDinero ? reembolsoMetodo : undefined,
          registrar_gasto: esDinero && registrarGasto,
          tipo: 'almacen',
          fecha: todayInTimezone(empresa?.zona_horaria),
          notas: notas || undefined,
        },
        lineas,
      });
      toast.success('Devolución registrada');
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al registrar la devolución');
    } finally {
      setSaving(false);
    }
  };

  const yaAgregado = new Set(renglones.map(r => r.producto.id));

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><RotateCcw className="h-5 w-5 text-primary" /> Registrar devolución {venta.folio ? `· ${venta.folio}` : ''}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Agregar productos: los de la venta como atajo + cualquier producto */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <p className="text-[11px] font-semibold text-muted-foreground uppercase mb-1">Productos de la venta</p>
              <div className="border border-border rounded-md max-h-36 overflow-y-auto">
                {productosVenta.map(({ producto, vendida }) => (
                  <button key={producto.id} type="button" onClick={() => agregar(producto)}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-left border-t first:border-t-0 border-border hover:bg-accent/40">
                    <span className="flex-1 truncate">{producto.nombre}</span>
                    <span className="text-muted-foreground tabular-nums">vendida {vendida}</span>
                    <Plus className={`h-3.5 w-3.5 ${yaAgregado.has(producto.id) ? 'text-muted-foreground' : 'text-primary'}`} />
                  </button>
                ))}
                {productosVenta.length === 0 && <p className="px-2.5 py-3 text-xs text-muted-foreground text-center">Sin productos</p>}
              </div>
            </div>
            <div>
              <p className="text-[11px] font-semibold text-muted-foreground uppercase mb-1">Cualquier producto</p>
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por nombre o código…" className="h-8 pl-7 text-xs" />
              </div>
              {termino.length >= 2 && (
                <div className="border border-border rounded-md mt-1 max-h-28 overflow-y-auto">
                  {encontrados.map(p => (
                    <button key={p.id} type="button" onClick={() => agregar(p)}
                      className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-left border-t first:border-t-0 border-border hover:bg-accent/40">
                      <span className="font-mono text-muted-foreground">{p.codigo}</span>
                      <span className="flex-1 truncate">{p.nombre}</span>
                      <Plus className="h-3.5 w-3.5 text-primary" />
                    </button>
                  ))}
                  {encontrados.length === 0 && <p className="px-2.5 py-2 text-xs text-muted-foreground">Sin resultados</p>}
                </div>
              )}
            </div>
          </div>

          {/* Renglones */}
          <div className="border border-border rounded-lg overflow-hidden">
            <div className="bg-accent/40 px-3 py-1.5 text-[11px] font-semibold text-muted-foreground uppercase grid grid-cols-12 gap-2">
              <div className="col-span-4">Producto</div>
              <div className="col-span-2 text-right">Devolver</div>
              <div className="col-span-2">Motivo</div>
              <div className="col-span-2">Destino</div>
              <div className="col-span-1 text-right">Precio</div>
              <div className="col-span-1" />
            </div>
            {renglones.map(r => (
              <div key={r.producto.id} className="px-3 py-1.5 text-xs border-t border-border grid grid-cols-12 gap-2 items-center">
                <div className="col-span-4 truncate">{r.producto.nombre}</div>
                <div className="col-span-2">
                  <Input type="number" min={0} step="any" inputMode="decimal" className="h-7 text-right text-xs"
                    value={Number.isFinite(r.cantidad) ? r.cantidad : ''}
                    onChange={e => cambiar(r.producto.id, { cantidad: parseFloat(e.target.value) })} />
                </div>
                <div className="col-span-2">
                  <select value={r.motivo} onChange={e => cambiar(r.producto.id, { motivo: e.target.value })}
                    className="w-full border border-border rounded-md px-1.5 py-1 text-xs bg-background">
                    {MOTIVOS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <select value={r.destino} aria-label="Destino" onChange={e => cambiar(r.producto.id, { destino: e.target.value as DestinoDevolucion })}
                    className={`w-full border rounded-md px-1.5 py-1 text-xs bg-background ${r.destino === 'merma' ? 'border-warning text-warning' : 'border-border'}`}>
                    <option value="vendible">Vendible</option>
                    <option value="merma">Merma (a Mermas)</option>
                  </select>
                </div>
                <div className="col-span-1 text-right tabular-nums text-muted-foreground">{fmt(precio(r.producto))}</div>
                <div className="col-span-1 text-right">
                  <button type="button" aria-label="Quitar" onClick={() => setRenglones(prev => prev.filter(x => x.producto.id !== r.producto.id))}
                    className="text-destructive p-1 rounded hover:bg-destructive/10"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </div>
            ))}
            {renglones.length === 0 && <div className="px-3 py-6 text-center text-muted-foreground text-xs border-t border-border">Agrega los productos que regresa el cliente.</div>}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-semibold text-muted-foreground uppercase block mb-1">Almacén para lo vendible{necesitaAlmacen ? ' *' : ''}</label>
              <select value={almacenId} onChange={e => setAlmacenId(e.target.value)} className="w-full border border-border rounded-md px-2 py-1.5 text-sm bg-background">
                <option value="">Elegir…</option>
                {almacenesVendibles.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
              </select>
              <p className="text-[10.5px] text-muted-foreground mt-1">Lo marcado como merma va al almacén Mermas.</p>
            </div>
            <div>
              <label className="text-[11px] font-semibold text-muted-foreground uppercase block mb-1">Notas</label>
              <Input value={notas} onChange={e => setNotas(e.target.value)} placeholder="Opcional…" />
            </div>
          </div>

          {/* ¿Qué hacer con el valor? */}
          <div className="border border-border rounded-lg p-3 space-y-2">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase">¿Qué se le da al cliente? <span className="normal-case font-normal">(precio de esta venta con impuestos; si el producto no está en la venta, el de su lista)</span></p>
            <label className="flex items-start gap-2 text-sm">
              <input type="radio" name="destino" className="mt-1" checked={destino === 'saldo_favor'} onChange={() => setDestino('saldo_favor')} />
              <span><strong>Nota de crédito</strong> — saldo a favor para próximas compras.</span>
            </label>
            <label className={`flex items-start gap-2 text-sm ${!tieneSaldo ? 'opacity-40' : ''}`}>
              <input type="radio" name="destino" className="mt-1" disabled={!tieneSaldo} checked={destino === 'aplicar_venta'} onChange={() => setDestino('aplicar_venta')} />
              <span><strong>Aplicar a esta venta</strong> — la nota paga esta venta{!tieneSaldo ? ' (ya está pagada)' : ` (${fmt(ventaSaldo)} pendiente; lo que sobre queda a favor)`}.</span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input type="radio" name="destino" className="mt-1" checked={destino === 'devolver_dinero'} onChange={() => setDestino('devolver_dinero')} />
              <span><strong>Devolver el dinero</strong> — con tu turno de caja abierto sale como retiro de caja.</span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input type="radio" name="destino" className="mt-1" checked={destino === 'reposicion'} onChange={() => setDestino('reposicion')} />
              <span><strong>Reposición</strong> — se le entrega el mismo producto (sale del almacén elegido), sin dinero.</span>
            </label>
            {destino === 'devolver_dinero' && (
              <div className="pl-6 pt-1 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-muted-foreground">Método:</span>
                  <select value={reembolsoMetodo} onChange={e => setReembolsoMetodo(e.target.value)} className="border border-border rounded-md px-2 py-1 text-xs bg-background">
                    {METODOS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </div>
                <label className="flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={registrarGasto} onChange={e => setRegistrarGasto(e.target.checked)} />
                  <span>Sin turno de caja: registrar el egreso en <strong>Gastos</strong> (ligado a la devolución)</span>
                </label>
              </div>
            )}
          </div>

          {/* Resumen */}
          <div className="bg-accent/30 border border-border rounded-lg p-3 text-xs">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div><div className="text-[10px] text-muted-foreground uppercase">Total venta</div><div className="font-bold tabular-nums">{fmt(ventaTotal)}</div></div>
              <div><div className="text-[10px] text-muted-foreground uppercase">Saldo actual</div><div className="font-bold tabular-nums">{fmt(ventaSaldo)}</div></div>
              <div><div className="text-[10px] text-muted-foreground uppercase">Valor devolución</div><div className="font-bold tabular-nums text-primary">{fmt(valor)}</div></div>
            </div>
            <div className="mt-2 pt-2 border-t border-border space-y-0.5">
              {renglones.length > 0 && <p>• {renglones.map(r => `${r.cantidad} ${r.producto.nombre} → ${r.destino === 'merma' ? 'Mermas' : ((almacenesVendibles.find(a => a.id === almacenId)?.nombre) ?? 'almacén por elegir')}`).join(' · ')}</p>}
              {destino === 'saldo_favor' && <p>• Genera <strong>{fmt(resumen.nota)}</strong> de saldo a favor.</p>}
              {destino === 'aplicar_venta' && <p>• Paga <strong>{fmt(aplicadoVenta)}</strong> de esta venta{resumen.notaAplicada > aplicadoVenta + 0.009 ? `; ${fmt(resumen.notaAplicada - aplicadoVenta)} queda a favor` : ''}.</p>}
              {destino === 'devolver_dinero' && <p>• Reembolso de <strong>{fmt(resumen.dinero)}</strong> en {METODOS.find(m => m.value === reembolsoMetodo)?.label}.</p>}
              {destino === 'reposicion' && <p>• Se entrega el mismo producto, sin dinero.</p>}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="cancelar" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} disabled={!canSave} className="gap-1.5">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {saving ? 'Guardando…' : 'Registrar devolución'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
