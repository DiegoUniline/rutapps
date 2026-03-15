import { useState, useMemo, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, User, Package, FileText, Banknote, Calendar, Wallet, CreditCard, Check, X, Pencil, Plus, Minus, Trash2, Search, Save } from 'lucide-react';
import { useVenta } from '@/hooks/useVentas';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { cn, fmtDate } from '@/lib/utils';

const statusColors: Record<string, string> = {
  borrador: 'bg-muted text-muted-foreground',
  confirmado: 'bg-primary/10 text-primary',
  entregado: 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400',
  facturado: 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400',
  cancelado: 'bg-destructive/10 text-destructive',
};

interface CuentaPendiente {
  id: string;
  folio: string | null;
  fecha: string;
  total: number;
  saldo_pendiente: number;
  montoAplicar: number;
}

interface EditLinea {
  id?: string; // existing line id, undefined for new
  producto_id: string;
  nombre: string;
  codigo: string;
  cantidad: number;
  precio_unitario: number;
  unidad: string;
  tiene_iva: boolean;
  iva_pct: number;
}

type View = 'detalle' | 'editar' | 'cobrar' | 'ticket';

export default function RutaVentaDetalle() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, empresa } = useAuth();
  const queryClient = useQueryClient();
  const { data: venta, isLoading } = useVenta(id);

  const [view, setView] = useState<View>('detalle');
  const [metodoPago, setMetodoPago] = useState<'efectivo' | 'transferencia' | 'tarjeta'>('efectivo');
  const [montoRecibido, setMontoRecibido] = useState('');
  const [referenciaPago, setReferenciaPago] = useState('');
  const [cuentasPendientes, setCuentasPendientes] = useState<CuentaPendiente[]>([]);
  const [saving, setSaving] = useState(false);
  const [ticketData, setTicketData] = useState<{ monto: number; cambio: number; metodo: string; folio: string; fecha: string } | null>(null);

  // Edit state
  const [editLineas, setEditLineas] = useState<EditLinea[]>([]);
  const [editCondicion, setEditCondicion] = useState<'contado' | 'credito' | 'por_definir'>('contado');
  const [editNotas, setEditNotas] = useState('');
  const [showProductSearch, setShowProductSearch] = useState(false);
  const [searchProducto, setSearchProducto] = useState('');

  const clienteId = (venta as any)?.cliente_id;

  // Fetch client credit info
  const { data: clienteData } = useQuery({
    queryKey: ['ruta-cliente-detalle', clienteId],
    enabled: !!clienteId,
    queryFn: async () => {
      const { data } = await supabase.from('clientes').select('id, nombre, credito, limite_credito, dias_credito').eq('id', clienteId!).single();
      return data;
    },
  });

  // Fetch products for adding
  const { data: productos } = useQuery({
    queryKey: ['ruta-productos-edit', empresa?.id],
    enabled: !!empresa?.id && view === 'editar',
    queryFn: async () => {
      const { data } = await supabase
        .from('productos')
        .select('id, codigo, nombre, precio_principal, tiene_iva, tasa_iva_id, unidades:unidad_venta_id(nombre, abreviatura), tasas_iva:tasa_iva_id(porcentaje)')
        .eq('empresa_id', empresa!.id)
        .eq('se_puede_vender', true)
        .eq('status', 'activo')
        .order('nombre');
      return data ?? [];
    },
  });

  // Fetch other pending sales for this client (excluding current)
  const { data: otrasPendientes } = useQuery({
    queryKey: ['ruta-cuentas-pendientes-detalle', clienteId, id],
    enabled: !!clienteId && view === 'cobrar',
    queryFn: async () => {
      const { data } = await supabase
        .from('ventas')
        .select('id, folio, fecha, total, saldo_pendiente')
        .eq('cliente_id', clienteId!)
        .gt('saldo_pendiente', 0)
        .neq('id', id!)
        .in('status', ['borrador', 'confirmado', 'entregado', 'facturado'])
        .order('fecha', { ascending: true });
      return data ?? [];
    },
  });

  // Fetch saldo pendiente total for credit validation
  const { data: ventasPendientesCredito } = useQuery({
    queryKey: ['ruta-saldo-total-credito', clienteId],
    enabled: !!clienteId && view === 'editar',
    queryFn: async () => {
      const { data } = await supabase
        .from('ventas')
        .select('saldo_pendiente')
        .eq('cliente_id', clienteId!)
        .gt('saldo_pendiente', 0)
        .neq('id', id!);
      return (data ?? []).reduce((s, v) => s + (v.saldo_pendiente ?? 0), 0);
    },
  });

  const fmt = (n: number) => n.toLocaleString('es-MX', { minimumFractionDigits: 2 });

  // ─── Edit calculations ───
  const editTotals = useMemo(() => {
    let subtotal = 0, iva = 0;
    editLineas.forEach(item => {
      const lineSub = item.precio_unitario * item.cantidad;
      subtotal += lineSub;
      if (item.tiene_iva) iva += lineSub * (item.iva_pct / 100);
    });
    return { subtotal, iva, total: subtotal + iva };
  }, [editLineas]);

  const saldoPendienteOtras = ventasPendientesCredito ?? 0;
  const creditoDisponible = clienteData ? (clienteData.limite_credito ?? 0) - saldoPendienteOtras : 0;
  const excedeCredito = editCondicion === 'credito' && editTotals.total > creditoDisponible;

  // ─── Cobrar calculations ───
  const saldoActual = venta?.saldo_pendiente ?? 0;
  const totalAplicarOtras = cuentasPendientes.reduce((s, c) => s + c.montoAplicar, 0);
  const totalACobrar = saldoActual + totalAplicarOtras;
  const montoRecibidoNum = parseFloat(montoRecibido) || 0;
  const cambio = montoRecibidoNum > totalACobrar ? montoRecibidoNum - totalACobrar : 0;

  // ─── Init edit mode ───
  const initEditar = () => {
    if (!venta) return;
    const lineas = (venta as any).venta_lineas ?? [];
    setEditLineas(lineas.map((l: any) => ({
      id: l.id,
      producto_id: l.producto_id,
      nombre: l.productos?.nombre ?? l.descripcion ?? '',
      codigo: l.productos?.codigo ?? '',
      cantidad: l.cantidad,
      precio_unitario: l.precio_unitario,
      unidad: l.unidades?.abreviatura ?? 'pz',
      tiene_iva: (l.iva_pct ?? 0) > 0,
      iva_pct: l.iva_pct ?? 0,
    })));
    setEditCondicion(venta.condicion_pago as any);
    setEditNotas(venta.notas ?? '');
    setView('editar');
  };

  const addProductToEdit = (p: any) => {
    const existing = editLineas.find(l => l.producto_id === p.id);
    if (existing) {
      setEditLineas(prev => prev.map(l => l.producto_id === p.id ? { ...l, cantidad: l.cantidad + 1 } : l));
    } else {
      setEditLineas(prev => [...prev, {
        producto_id: p.id,
        nombre: p.nombre,
        codigo: p.codigo,
        cantidad: 1,
        precio_unitario: p.precio_principal ?? 0,
        unidad: (p.unidades as any)?.abreviatura || 'pz',
        tiene_iva: p.tiene_iva ?? false,
        iva_pct: p.tiene_iva ? ((p.tasas_iva as any)?.porcentaje ?? 16) : 0,
      }]);
    }
  };

  const updateEditQty = (idx: number, delta: number) => {
    setEditLineas(prev => prev.map((l, i) => {
      if (i !== idx) return l;
      const newQty = l.cantidad + delta;
      return newQty > 0 ? { ...l, cantidad: newQty } : l;
    }));
  };

  const removeEditLine = (idx: number) => {
    setEditLineas(prev => prev.filter((_, i) => i !== idx));
  };

  const filteredProductos = productos?.filter(p =>
    !searchProducto || p.nombre.toLowerCase().includes(searchProducto.toLowerCase()) || p.codigo.toLowerCase().includes(searchProducto.toLowerCase())
  );

  // ─── Save edits ───
  const handleSaveEdits = async () => {
    if (editLineas.length === 0) { toast.error('Agrega al menos un producto'); return; }
    setSaving(true);
    try {
      // Delete old lines and insert new
      await supabase.from('venta_lineas').delete().eq('venta_id', id!);

      const newLineas = editLineas.map(item => ({
        venta_id: id!,
        producto_id: item.producto_id,
        descripcion: item.nombre,
        cantidad: item.cantidad,
        precio_unitario: item.precio_unitario,
        subtotal: item.precio_unitario * item.cantidad,
        iva_pct: item.iva_pct,
        iva_monto: item.tiene_iva ? item.precio_unitario * item.cantidad * (item.iva_pct / 100) : 0,
        ieps_pct: 0,
        ieps_monto: 0,
        descuento_pct: 0,
        total: item.precio_unitario * item.cantidad * (1 + (item.tiene_iva ? item.iva_pct / 100 : 0)),
      }));
      const { error: linErr } = await supabase.from('venta_lineas').insert(newLineas);
      if (linErr) throw linErr;

      // Update venta totals + condicion
      const newSaldo = editCondicion === 'credito' ? editTotals.total : editTotals.total; // saldo = total until paid
      const { error: ventaErr } = await supabase.from('ventas').update({
        condicion_pago: editCondicion as any,
        notas: editNotas || null,
        subtotal: editTotals.subtotal,
        iva_total: editTotals.iva,
        total: editTotals.total,
        saldo_pendiente: newSaldo,
      }).eq('id', id!);
      if (ventaErr) throw ventaErr;

      toast.success('Venta actualizada');
      queryClient.invalidateQueries({ queryKey: ['venta', id] });
      queryClient.invalidateQueries({ queryKey: ['ventas'] });
      queryClient.invalidateQueries({ queryKey: ['ruta-ventas'] });
      setView('detalle');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  // ─── Init cobrar ───
  const initCobrar = () => {
    if (otrasPendientes && otrasPendientes.length > 0) {
      setCuentasPendientes(otrasPendientes.map(v => ({
        id: v.id, folio: v.folio, fecha: v.fecha, total: v.total ?? 0,
        saldo_pendiente: v.saldo_pendiente ?? 0, montoAplicar: 0,
      })));
    } else {
      setCuentasPendientes([]);
    }
    setMetodoPago('efectivo');
    // Default monto recibido to total a cobrar
    const saldo = venta?.saldo_pendiente ?? 0;
    setMontoRecibido(saldo > 0 ? saldo.toString() : '');
    setReferenciaPago('');
    setView('cobrar');
  };

  const updateCuentaMonto = (cid: string, monto: number) => {
    setCuentasPendientes(prev => prev.map(c =>
      c.id === cid ? { ...c, montoAplicar: Math.min(Math.max(0, monto), c.saldo_pendiente) } : c
    ));
  };

  const liquidarTodas = () => {
    setCuentasPendientes(prev => prev.map(c => ({ ...c, montoAplicar: c.saldo_pendiente })));
  };

  // ─── Handle cobrar ───
  const handleCobrar = async () => {
    if (!user || !venta || totalACobrar <= 0) return;
    setSaving(true);
    try {
      const { data: profile } = await supabase.from('profiles').select('empresa_id').single();
      const { data: cobro, error: cobroErr } = await supabase.from('cobros').insert({
        empresa_id: profile!.empresa_id, cliente_id: clienteId, user_id: user.id,
        monto: totalACobrar, metodo_pago: metodoPago, referencia: referenciaPago || null,
      }).select('id').single();
      if (cobroErr) throw cobroErr;

      const aplicaciones: { cobro_id: string; venta_id: string; monto_aplicado: number }[] = [];

      if (saldoActual > 0) {
        aplicaciones.push({ cobro_id: cobro.id, venta_id: venta.id, monto_aplicado: saldoActual });
        await supabase.from('ventas').update({
          saldo_pendiente: 0,
          status: venta.status === 'borrador' ? 'confirmado' as const : venta.status,
        }).eq('id', venta.id);
      }

      for (const cuenta of cuentasPendientes) {
        if (cuenta.montoAplicar > 0) {
          aplicaciones.push({ cobro_id: cobro.id, venta_id: cuenta.id, monto_aplicado: cuenta.montoAplicar });
          await supabase.from('ventas').update({ saldo_pendiente: cuenta.saldo_pendiente - cuenta.montoAplicar }).eq('id', cuenta.id);
        }
      }

      if (aplicaciones.length > 0) {
        const { error: appErr } = await supabase.from('cobro_aplicaciones').insert(aplicaciones);
        if (appErr) throw appErr;
      }

      setTicketData({
        monto: totalACobrar, cambio, metodo: metodoPago,
        folio: venta.folio ?? 'Sin folio', fecha: new Date().toLocaleString('es-MX'),
      });
      setView('ticket');
      toast.success('¡Cobro registrado!');
      queryClient.invalidateQueries({ queryKey: ['venta', id] });
      queryClient.invalidateQueries({ queryKey: ['ruta-ventas'] });
      queryClient.invalidateQueries({ queryKey: ['ruta-stats'] });
      queryClient.invalidateQueries({ queryKey: ['ventas'] });
      queryClient.invalidateQueries({ queryKey: ['ruta-cuentas-pendientes'] });
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground text-[13px]">Cargando...</p>
      </div>
    );
  }

  if (!venta) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-2">
        <p className="text-muted-foreground text-[13px]">Venta no encontrada</p>
        <button onClick={() => navigate(-1)} className="text-primary text-[13px] font-medium">Volver</button>
      </div>
    );
  }

  const lineas = (venta as any).venta_lineas ?? [];
  const clienteNombre = (venta as any).clientes?.nombre ?? 'Sin cliente';
  const vendedorNombre = (venta as any).vendedores?.nombre ?? '—';

  // ═══════════════════════════════════════
  // ─── TICKET VIEW ───
  // ═══════════════════════════════════════
  if (view === 'ticket' && ticketData) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <div className="sticky top-0 z-10 bg-background border-b border-border px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate('/ruta/ventas')} className="p-1 -ml-1">
            <X className="h-5 w-5 text-foreground" />
          </button>
          <h1 className="text-[16px] font-bold text-foreground">Ticket de cobro</h1>
        </div>
        <div className="flex-1 p-4 flex flex-col items-center">
          <div className="w-full max-w-sm bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
            <div className="bg-green-600 dark:bg-green-700 px-5 py-6 text-center">
              <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-3">
                <Check className="h-7 w-7 text-white" />
              </div>
              <p className="text-white/80 text-[12px] font-medium">Cobro exitoso</p>
              <p className="text-white text-[32px] font-bold mt-1">${fmt(ticketData.monto)}</p>
              {ticketData.cambio > 0 && (
                <p className="text-white/70 text-[13px] mt-1">Cambio: ${fmt(ticketData.cambio)}</p>
              )}
            </div>
            <div className="px-5 py-4 space-y-3">
              <TicketRow label="Folio" value={ticketData.folio} />
              <TicketRow label="Cliente" value={clienteNombre} />
              <TicketRow label="Método" value={ticketData.metodo === 'efectivo' ? 'Efectivo' : ticketData.metodo === 'transferencia' ? 'Transferencia' : 'Tarjeta'} />
              <TicketRow label="Fecha" value={fmtDate(ticketData.fecha)} />
              {cuentasPendientes.filter(c => c.montoAplicar > 0).length > 0 && (
                <div className="border-t border-border pt-3">
                  <p className="text-[10px] text-muted-foreground uppercase font-semibold mb-1.5">Aplicado a cuentas anteriores</p>
                  {cuentasPendientes.filter(c => c.montoAplicar > 0).map(c => (
                    <div key={c.id} className="flex justify-between text-[12px] py-0.5">
                      <span className="text-muted-foreground">{c.folio ?? '—'}</span>
                      <span className="text-foreground font-medium">${fmt(c.montoAplicar)}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="border-t border-border pt-3">
                <p className="text-[10px] text-muted-foreground uppercase font-semibold mb-1.5">Productos</p>
                {lineas.map((l: any) => (
                  <div key={l.id} className="flex justify-between text-[12px] py-0.5">
                    <span className="text-foreground truncate flex-1 mr-2">{l.cantidad}x {l.productos?.nombre ?? l.descripcion ?? '—'}</span>
                    <span className="text-foreground font-medium shrink-0">${fmt(l.total ?? 0)}</span>
                  </div>
                ))}
                <div className="flex justify-between text-[13px] font-bold mt-2 pt-2 border-t border-dashed border-border">
                  <span className="text-foreground">Total venta</span>
                  <span className="text-foreground">${fmt(venta.total ?? 0)}</span>
                </div>
              </div>
            </div>
          </div>
          <div className="w-full max-w-sm mt-5">
            <button onClick={() => navigate('/ruta/ventas')} className="w-full bg-primary text-primary-foreground rounded-xl py-3.5 text-[14px] font-bold active:scale-[0.98] transition-transform">
              Listo
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════
  // ─── EDITAR VIEW ───
  // ═══════════════════════════════════════
  if (view === 'editar') {
    return (
      <div className="flex flex-col h-screen bg-background">
        <header className="sticky top-0 z-20 bg-card/95 backdrop-blur-md border-b border-border">
          <div className="flex items-center gap-2 px-3 h-12">
            <button onClick={() => setView('detalle')} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-accent">
              <ArrowLeft className="h-[18px] w-[18px] text-foreground" />
            </button>
            <span className="text-[15px] font-semibold text-foreground flex-1">Editar venta</span>
            <span className="text-[11px] text-muted-foreground">{venta.folio}</span>
          </div>
        </header>

        <div className="flex-1 overflow-auto px-3 py-3 space-y-3 pb-24">
          {/* Condición de pago */}
          <section className="bg-card rounded-xl border border-border p-3.5">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Condición de pago</p>
            <div className="flex gap-1.5">
              {([
                ['contado', 'Contado'],
                ...(clienteData?.credito ? [['credito', 'Crédito'] as const] : []),
                ['por_definir', 'Por definir'],
              ] as const).map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => setEditCondicion(val as typeof editCondicion)}
                  className={`flex-1 py-2 rounded-lg text-[12px] font-semibold transition-all active:scale-95 ${
                    editCondicion === val
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'bg-accent/60 text-foreground'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {editCondicion === 'credito' && clienteData && (
              <div className={`mt-2.5 rounded-lg px-2.5 py-2 text-[11px] space-y-1 ${excedeCredito ? 'bg-destructive/8' : 'bg-accent/50'}`}>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Límite</span>
                  <span className="font-medium text-foreground">${fmt(clienteData.limite_credito ?? 0)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Saldo otras ventas</span>
                  <span className="font-medium text-foreground">${fmt(saldoPendienteOtras)}</span>
                </div>
                <div className="flex justify-between border-t border-border/40 pt-1">
                  <span className="text-muted-foreground">Disponible</span>
                  <span className={`font-bold ${excedeCredito ? 'text-destructive' : 'text-green-600 dark:text-green-400'}`}>
                    ${fmt(creditoDisponible)}
                  </span>
                </div>
                {excedeCredito && (
                  <p className="text-[10px] text-destructive font-medium mt-1">⚠ El total excede el crédito disponible</p>
                )}
              </div>
            )}
          </section>

          {/* Productos */}
          <section className="bg-card rounded-xl border border-border p-3.5">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                Productos ({editLineas.length})
              </p>
              <button
                onClick={() => setShowProductSearch(true)}
                className="text-[11px] text-primary font-semibold flex items-center gap-1"
              >
                <Plus className="h-3.5 w-3.5" /> Agregar
              </button>
            </div>


            {/* Lines */}
            <div className="space-y-1.5">
              {editLineas.length === 0 && (
                <p className="text-muted-foreground text-[12px] text-center py-4">Sin productos</p>
              )}
              {editLineas.map((item, idx) => {
                const lineTotal = item.precio_unitario * item.cantidad * (1 + (item.tiene_iva ? item.iva_pct / 100 : 0));
                return (
                  <div key={`${item.producto_id}-${idx}`} className="rounded-lg border border-border/60 p-2.5">
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-medium text-foreground truncate">{item.nombre}</p>
                        <p className="text-[10px] text-muted-foreground">{item.codigo} · ${fmt(item.precio_unitario)} / {item.unidad}</p>
                      </div>
                      <button onClick={() => removeEditLine(idx)} className="p-1">
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </button>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1 bg-accent/50 rounded-lg px-1">
                        <button onClick={() => updateEditQty(idx, -1)} className="p-1.5"><Minus className="h-3 w-3" /></button>
                        <span className="text-[13px] font-bold w-8 text-center text-foreground">{item.cantidad}</span>
                        <button onClick={() => updateEditQty(idx, 1)} className="p-1.5"><Plus className="h-3 w-3" /></button>
                      </div>
                      <span className="text-[14px] font-bold text-foreground">${fmt(lineTotal)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Full-screen product picker overlay */}
          {showProductSearch && (
            <div className="fixed inset-0 z-50 bg-background flex flex-col">
              <header className="sticky top-0 z-10 bg-card/95 backdrop-blur-md border-b border-border">
                <div className="flex items-center gap-2 px-3 h-12">
                  <button onClick={() => { setShowProductSearch(false); setSearchProducto(''); }} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-accent active:scale-95 transition-all">
                    <ArrowLeft className="h-[18px] w-[18px] text-foreground" />
                  </button>
                  <span className="text-[15px] font-semibold text-foreground flex-1">Agregar productos</span>
                  <span className="text-[11px] text-muted-foreground">{editLineas.length} sel.</span>
                </div>
              </header>

              <div className="px-3 pt-2.5 pb-1.5">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Buscar producto..."
                    className="w-full bg-accent/60 rounded-lg pl-8 pr-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1.5 focus:ring-primary/40 transition-shadow"
                    value={searchProducto}
                    onChange={e => setSearchProducto(e.target.value)}
                    autoFocus
                  />
                </div>
              </div>

              <div className="flex-1 overflow-auto px-3 space-y-[3px] pb-20">
                {filteredProductos?.map(p => {
                  const inEdit = editLineas.find(l => l.producto_id === p.id);
                  const inEditIdx = editLineas.findIndex(l => l.producto_id === p.id);
                  return (
                    <div
                      key={p.id}
                      className={`rounded-lg px-3 py-2 transition-all ${
                        inEdit ? 'bg-primary/[0.04] ring-1 ring-primary/20' : 'bg-card'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="flex-1 min-w-0" onClick={() => !inEdit && addProductToEdit(p)}>
                          <p className="text-[12.5px] font-medium text-foreground truncate">{p.nombre}</p>
                          <span className="text-[10px] text-muted-foreground font-mono">{p.codigo}</span>
                          <p className="text-[13px] font-bold text-foreground mt-px">
                            ${fmt(p.precio_principal ?? 0)}
                          </p>
                        </div>

                        {inEdit ? (
                          <div className="flex items-center gap-0.5 shrink-0">
                            <button
                              onClick={() => inEdit.cantidad === 1 ? removeEditLine(inEditIdx) : updateEditQty(inEditIdx, -1)}
                              className="w-7 h-7 rounded-md bg-accent flex items-center justify-center active:scale-90 transition-transform"
                            >
                              {inEdit.cantidad === 1 ? <Trash2 className="h-3 w-3 text-destructive" /> : <Minus className="h-3 w-3 text-foreground" />}
                            </button>
                            <span className="text-[13px] font-bold w-8 text-center text-foreground">{inEdit.cantidad}</span>
                            <button
                              onClick={() => updateEditQty(inEditIdx, 1)}
                              className="w-7 h-7 rounded-md bg-primary text-primary-foreground flex items-center justify-center active:scale-90 transition-transform"
                            >
                              <Plus className="h-3 w-3" />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => addProductToEdit(p)}
                            className="w-8 h-8 rounded-lg bg-accent hover:bg-primary/10 flex items-center justify-center text-primary active:scale-90 transition-all shrink-0"
                          >
                            <Plus className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
                {filteredProductos?.length === 0 && (
                  <p className="text-[11px] text-muted-foreground text-center py-8">Sin resultados</p>
                )}
              </div>

              {editLineas.length > 0 && (
                <div className="fixed bottom-0 left-0 right-0 z-30 px-3 pb-3 pt-1 bg-gradient-to-t from-background via-background to-transparent safe-area-bottom">
                  <button
                    onClick={() => { setShowProductSearch(false); setSearchProducto(''); }}
                    className="w-full bg-primary text-primary-foreground rounded-xl py-3 flex items-center justify-between px-4 active:scale-[0.98] transition-transform shadow-lg shadow-primary/20"
                  >
                    <div className="flex items-center gap-1.5">
                      <Package className="h-4 w-4 opacity-80" />
                      <span className="text-[13px] font-medium">{editLineas.length} {editLineas.length === 1 ? 'producto' : 'productos'}</span>
                    </div>
                    <span className="text-[14px] font-bold">${fmt(editTotals.total)}</span>
                  </button>
                </div>
              )}
            </div>
          )}

          <section className="bg-card rounded-xl border border-border p-3.5">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Notas</p>
            <textarea
              className="w-full bg-accent/40 rounded-md px-2.5 py-2 text-[12px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1.5 focus:ring-primary/40 resize-none"
              rows={2}
              placeholder="Instrucciones o comentarios..."
              value={editNotas}
              onChange={e => setEditNotas(e.target.value)}
            />
          </section>

          {/* Totals */}
          <section className="bg-card rounded-xl border border-border p-3.5 space-y-1.5">
            <div className="flex justify-between text-[12px]">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="font-medium text-foreground tabular-nums">${fmt(editTotals.subtotal)}</span>
            </div>
            {editTotals.iva > 0 && (
              <div className="flex justify-between text-[12px]">
                <span className="text-muted-foreground">IVA</span>
                <span className="font-medium text-foreground tabular-nums">${fmt(editTotals.iva)}</span>
              </div>
            )}
            <div className="flex justify-between items-baseline pt-1.5 border-t border-border/60">
              <span className="text-[13px] font-semibold text-foreground">Total</span>
              <span className="text-[20px] font-bold text-primary tabular-nums">${fmt(editTotals.total)}</span>
            </div>
          </section>
        </div>

        {/* Bottom actions */}
        <div className="fixed bottom-0 left-0 right-0 z-30 px-3 pb-3 pt-1 bg-gradient-to-t from-background via-background to-transparent">
          <button
            onClick={handleSaveEdits}
            disabled={saving || editLineas.length === 0 || excedeCredito}
            className="w-full bg-primary text-primary-foreground rounded-xl py-3.5 text-[14px] font-bold disabled:opacity-40 active:scale-[0.98] transition-transform shadow-lg flex items-center justify-center gap-1.5"
          >
            <Save className="h-4 w-4" />
            {saving ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════
  // ─── COBRAR VIEW ───
  // ═══════════════════════════════════════
  if (view === 'cobrar') {
    return (
      <div className="flex flex-col h-screen bg-background">
        <div className="sticky top-0 z-10 bg-background border-b border-border px-4 py-3 flex items-center gap-3">
          <button onClick={() => setView('detalle')} className="p-1 -ml-1">
            <ArrowLeft className="h-5 w-5 text-foreground" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-[16px] font-bold text-foreground">Cobrar</h1>
            <p className="text-[11px] text-muted-foreground">{clienteNombre} · {venta.folio ?? 'Sin folio'}</p>
          </div>
        </div>

        <div className="flex-1 overflow-auto px-3 py-3 space-y-3 pb-24">
          <section className="bg-card rounded-xl border border-border p-3.5">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Venta actual</p>
            <div className="flex justify-between items-baseline">
              <span className="text-[13px] text-foreground">{venta.folio ?? 'Sin folio'}</span>
              <span className="text-[18px] font-bold text-foreground">${fmt(saldoActual)}</span>
            </div>
          </section>

          {cuentasPendientes.length > 0 && (
            <section className="bg-card rounded-xl border border-border p-3.5">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Otras cuentas ({cuentasPendientes.length})</p>
                <button onClick={liquidarTodas} className="text-[10.5px] text-primary font-semibold">Liquidar todas</button>
              </div>
              <div className="space-y-1.5">
                {cuentasPendientes.map(cuenta => (
                  <div key={cuenta.id} className="rounded-lg border border-border/60 p-2.5">
                    <div className="flex items-center justify-between mb-1.5">
                      <div>
                        <span className="text-[11px] font-semibold text-foreground">{cuenta.folio ?? '—'}</span>
                        <span className="text-[10px] text-muted-foreground ml-2">{fmtDate(cuenta.fecha)}</span>
                      </div>
                      <span className="text-[11px] font-medium text-destructive">Debe: ${fmt(cuenta.saldo_pendiente)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => updateCuentaMonto(cuenta.id, cuenta.saldo_pendiente)}
                        className={`text-[10px] px-2 py-1 rounded font-medium transition-all ${cuenta.montoAplicar === cuenta.saldo_pendiente ? 'bg-primary text-primary-foreground' : 'bg-accent/60 text-foreground'}`}
                      >Liquidar</button>
                      <div className="flex-1 relative">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground">$</span>
                        <input type="number" inputMode="decimal"
                          className="w-full bg-accent/40 rounded-md pl-5 pr-2 py-1.5 text-[12px] text-foreground font-medium focus:outline-none focus:ring-1.5 focus:ring-primary/40 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          value={cuenta.montoAplicar || ''} placeholder="0.00"
                          onChange={e => updateCuentaMonto(cuenta.id, parseFloat(e.target.value) || 0)}
                        />
                      </div>
                      {cuenta.montoAplicar > 0 && (
                        <button onClick={() => updateCuentaMonto(cuenta.id, 0)} className="text-[10px] text-destructive font-medium">Quitar</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              {totalAplicarOtras > 0 && (
                <div className="mt-2 pt-2 border-t border-border/60 flex justify-between">
                  <span className="text-[11px] text-muted-foreground">Total a cuentas anteriores</span>
                  <span className="text-[12px] font-bold text-foreground">${fmt(totalAplicarOtras)}</span>
                </div>
              )}
            </section>
          )}

          <section className="bg-card rounded-xl border border-border p-3.5">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Método de pago</p>
            <div className="flex gap-1.5">
              {([['efectivo', 'Efectivo', Wallet], ['transferencia', 'Transfer.', Banknote], ['tarjeta', 'Tarjeta', CreditCard]] as const).map(([val, label, Icon]) => (
                <button key={val} onClick={() => setMetodoPago(val as typeof metodoPago)}
                  className={`flex-1 py-2.5 rounded-lg text-[11px] font-semibold transition-all active:scale-95 flex flex-col items-center gap-1 ${metodoPago === val ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-accent/60 text-foreground'}`}>
                  <Icon className="h-4 w-4" />{label}
                </button>
              ))}
            </div>
            {metodoPago === 'efectivo' && (
              <div className="mt-2.5 space-y-1.5">
                <label className="text-[10px] text-muted-foreground font-medium">Monto recibido</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[14px] text-muted-foreground font-medium">$</span>
                  <input type="number" inputMode="decimal" min="0"
                    className="w-full bg-accent/40 rounded-lg pl-7 pr-3 py-2.5 text-[16px] font-bold text-foreground focus:outline-none focus:ring-1.5 focus:ring-primary/40 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    value={montoRecibido} placeholder={fmt(totalACobrar)}
                    onChange={e => {
                      const val = parseFloat(e.target.value);
                      if (e.target.value === '' || val >= 0) {
                        setMontoRecibido(e.target.value);
                      }
                    }}
                  />
                </div>
                {cambio > 0 && (
                  <div className="flex justify-between bg-green-50 dark:bg-green-950/30 rounded-md px-2.5 py-2">
                    <span className="text-[12px] text-green-700 dark:text-green-400 font-medium">Cambio</span>
                    <span className="text-[14px] text-green-700 dark:text-green-400 font-bold">${fmt(cambio)}</span>
                  </div>
                )}
              </div>
            )}
            {metodoPago !== 'efectivo' && (
              <div className="mt-2.5">
                <label className="text-[10px] text-muted-foreground font-medium">Referencia (opcional)</label>
                <input type="text"
                  className="w-full mt-1 bg-accent/40 rounded-lg px-3 py-2 text-[12px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1.5 focus:ring-primary/40"
                  value={referenciaPago} placeholder="No. de referencia o autorización" onChange={e => setReferenciaPago(e.target.value)}
                />
              </div>
            )}
          </section>

          <section className="bg-card rounded-xl border border-border p-3.5">
            <div className="space-y-1">
              <div className="flex justify-between text-[12px]">
                <span className="text-muted-foreground">Saldo de esta venta</span>
                <span className="font-medium text-foreground tabular-nums">${fmt(saldoActual)}</span>
              </div>
              {totalAplicarOtras > 0 && (
                <div className="flex justify-between text-[12px]">
                  <span className="text-muted-foreground">Cuentas anteriores</span>
                  <span className="font-medium text-foreground tabular-nums">${fmt(totalAplicarOtras)}</span>
                </div>
              )}
            </div>
            <div className="flex justify-between items-baseline mt-2 pt-2 border-t border-border/60">
              <span className="text-[13px] font-semibold text-foreground">Total a cobrar</span>
              <span className="text-[20px] font-bold text-primary tabular-nums">${fmt(totalACobrar)}</span>
            </div>
          </section>
        </div>

        <div className="fixed bottom-0 left-0 right-0 z-30 px-3 pb-3 pt-1 bg-gradient-to-t from-background via-background to-transparent">
          <button onClick={handleCobrar} disabled={saving || totalACobrar <= 0}
            className="w-full bg-green-600 text-white rounded-xl py-3.5 text-[14px] font-bold disabled:opacity-40 active:scale-[0.98] transition-transform shadow-lg shadow-green-600/20 flex items-center justify-center gap-1.5">
            <Check className="h-4 w-4" />
            {saving ? 'Procesando...' : `Cobrar $${fmt(totalACobrar)}`}
          </button>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════
  // ─── DETALLE VIEW (default) ───
  // ═══════════════════════════════════════
  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-10 bg-background border-b border-border px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-1 -ml-1">
          <ArrowLeft className="h-5 w-5 text-foreground" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-[16px] font-bold text-foreground truncate">{venta.folio ?? 'Sin folio'}</h1>
          <p className="text-[11px] text-muted-foreground">{venta.tipo === 'venta_directa' ? 'Venta directa' : 'Pedido'}</p>
        </div>
        {/* Edit button */}
        {venta.status !== 'cancelado' && venta.status !== 'facturado' && (
          <button onClick={initEditar} className="p-2 rounded-lg hover:bg-accent active:scale-95 transition-all">
            <Pencil className="h-4 w-4 text-muted-foreground" />
          </button>
        )}
        <span className={cn('text-[11px] px-2.5 py-1 rounded-full font-medium', statusColors[venta.status] ?? '')}>
          {venta.status}
        </span>
      </div>

      <div className="p-4 space-y-4 pb-28">
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <p className="text-[11px] text-muted-foreground mb-1">Total</p>
          <p className="text-[28px] font-bold text-foreground">$ {fmt(venta.total ?? 0)}</p>
          {(venta.saldo_pendiente ?? 0) > 0 && (
            <p className="text-[12px] text-destructive font-medium mt-1">Saldo pendiente: $ {fmt(venta.saldo_pendiente ?? 0)}</p>
          )}
        </div>

        <div className="bg-card border border-border rounded-xl divide-y divide-border">
          <InfoRow icon={User} label="Cliente" value={clienteNombre} />
          <InfoRow icon={Calendar} label="Fecha" value={fmtDate(venta.fecha)} />
          {venta.fecha_entrega && <InfoRow icon={Calendar} label="Entrega" value={fmtDate(venta.fecha_entrega)} />}
          <InfoRow icon={Banknote} label="Pago" value={venta.condicion_pago} />
          <InfoRow icon={FileText} label="Vendedor" value={vendedorNombre} />
        </div>

        <div>
          <h2 className="text-[13px] font-semibold text-foreground mb-2 flex items-center gap-1.5">
            <Package className="h-4 w-4 text-muted-foreground" /> Productos ({lineas.length})
          </h2>
          <div className="bg-card border border-border rounded-xl divide-y divide-border">
            {lineas.length === 0 && <p className="text-muted-foreground text-[12px] p-4 text-center">Sin productos</p>}
            {lineas.map((l: any) => (
              <div key={l.id} className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-foreground truncate">{l.productos?.nombre ?? l.descripcion ?? '—'}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {l.cantidad} × $ {fmt(l.precio_unitario ?? 0)}
                      {l.unidades?.abreviatura ? ` / ${l.unidades.abreviatura}` : ''}
                    </p>
                  </div>
                  <p className="text-[14px] font-bold text-foreground shrink-0">$ {fmt(l.total ?? 0)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl p-4 space-y-2">
          <TotalRow label="Subtotal" value={venta.subtotal ?? 0} />
          {(venta.descuento_total ?? 0) > 0 && <TotalRow label="Descuento" value={-(venta.descuento_total ?? 0)} />}
          {(venta.iva_total ?? 0) > 0 && <TotalRow label="IVA" value={venta.iva_total ?? 0} />}
          {(venta.ieps_total ?? 0) > 0 && <TotalRow label="IEPS" value={venta.ieps_total ?? 0} />}
          <div className="border-t border-border pt-2 flex justify-between">
            <span className="text-[14px] font-bold text-foreground">Total</span>
            <span className="text-[14px] font-bold text-foreground">$ {fmt(venta.total ?? 0)}</span>
          </div>
        </div>

        {venta.notas && (
          <div className="bg-card border border-border rounded-xl p-4">
            <p className="text-[11px] text-muted-foreground mb-1">Notas</p>
            <p className="text-[13px] text-foreground">{venta.notas}</p>
          </div>
        )}
      </div>

      {/* Bottom actions */}
      {(venta.saldo_pendiente ?? 0) > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-30 px-4 pb-4 pt-2 bg-gradient-to-t from-background via-background to-transparent space-y-2">
          <button onClick={initCobrar}
            className="w-full bg-green-600 text-white rounded-xl py-3.5 text-[14px] font-bold active:scale-[0.98] transition-transform shadow-lg shadow-green-600/20 flex items-center justify-center gap-2">
            <Banknote className="h-5 w-5" /> Cobrar $ {fmt(venta.saldo_pendiente ?? 0)}
          </button>
          {venta.status !== 'cancelado' && venta.status !== 'facturado' && (
            <button onClick={initEditar}
              className="w-full bg-card border border-border text-foreground rounded-xl py-3 text-[13px] font-semibold active:scale-[0.98] transition-transform flex items-center justify-center gap-2">
              <Pencil className="h-4 w-4" /> Editar venta
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
      <span className="text-[12px] text-muted-foreground w-20 shrink-0">{label}</span>
      <span className="text-[13px] font-medium text-foreground truncate capitalize">{value}</span>
    </div>
  );
}

function TotalRow({ label, value }: { label: string; value: number }) {
  const fmt = (n: number) => n.toLocaleString('es-MX', { minimumFractionDigits: 2 });
  return (
    <div className="flex justify-between">
      <span className="text-[12px] text-muted-foreground">{label}</span>
      <span className="text-[13px] text-foreground">$ {fmt(value)}</span>
    </div>
  );
}

function TicketRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-[12px]">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground font-medium capitalize">{value}</span>
    </div>
  );
}
