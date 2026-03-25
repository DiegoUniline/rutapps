import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { todayInTimezone } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import {
  Search, Plus, Minus, Trash2, X, User, ShoppingCart, CreditCard,
  Wallet, Banknote, Check, Barcode, ArrowLeft, Receipt, Package
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import TicketVenta from '@/components/ruta/TicketVenta';
import { resolveProductPrice, type TarifaLineaRule } from '@/lib/priceResolver';
import { printTicket, buildTicketDataFromVenta } from '@/lib/printTicketUtil';
import { fmtDate, fmtNum } from '@/lib/utils';
import { useCurrency } from '@/hooks/useCurrency';

const CATALOG_STALE = 5 * 60 * 1000;

interface PosItem {
  producto_id: string;
  codigo: string;
  nombre: string;
  precio_unitario: number;
  cantidad: number;
  tiene_iva: boolean;
  iva_pct: number;
  tiene_ieps: boolean;
  ieps_pct: number;
  unidad: string;
}

type PayMethod = 'efectivo' | 'transferencia' | 'tarjeta';

interface PaySplit {
  id: string;
  metodo: PayMethod;
  monto: string;
  referencia: string;
}

export default function PuntoVentaPage() {
  const navigate = useNavigate();
  const { empresa, user, profile } = useAuth();
  const { symbol: s, fmt: fmtC } = useCurrency();
  const queryClient = useQueryClient();
  const scanRef = useRef<HTMLInputElement>(null);

  const [cart, setCart] = useState<PosItem[]>([]);
  const [search, setSearch] = useState('');
  const [clienteId, setClienteId] = useState<string | null>(null);
  const [clienteNombre, setClienteNombre] = useState('Público general');
  const [showClientes, setShowClientes] = useState(false);
  const [clienteSearch, setClienteSearch] = useState('');
  const [showPago, setShowPago] = useState(false);
  const [paySplits, setPaySplits] = useState<PaySplit[]>([{ id: crypto.randomUUID(), metodo: 'efectivo', monto: '', referencia: '' }]);
  const [saving, setSaving] = useState(false);
  const [condicion, setCondicion] = useState<'contado' | 'credito'>('contado');
  const [scanBuffer, setScanBuffer] = useState('');
  const [lastScanTime, setLastScanTime] = useState(0);
  const [clienteTarifaId, setClienteTarifaId] = useState<string | null>(null);
  const [clienteListaPrecioId, setClienteListaPrecioId] = useState<string | null>(null);

  // Products
  const { data: productos } = useQuery({
    queryKey: ['pos-productos'],
    staleTime: CATALOG_STALE,
    queryFn: async () => {
      const { data, error } = await supabase.from('productos')
        .select('id, codigo, nombre, precio_principal, costo, cantidad, imagen_url, tiene_iva, iva_pct, tiene_ieps, ieps_pct, ieps_tipo, clave_alterna, unidad_venta_id, se_puede_vender, status, clasificacion_id, vender_sin_stock')
        .eq('se_puede_vender', true)
        .eq('status', 'activo')
        .order('nombre');
      if (error) throw error;
      return data ?? [];
    },
  });

  // Clients
  const { data: clientes } = useQuery({
    queryKey: ['pos-clientes'],
    staleTime: CATALOG_STALE,
    queryFn: async () => {
      const { data } = await supabase.from('clientes')
        .select('id, codigo, nombre, credito, limite_credito, dias_credito, tarifa_id, lista_precio_id')
        .eq('status', 'activo')
        .order('nombre');
      return data ?? [];
    },
  });

  // Only load tarifa rules when a real client with tarifa is selected
  const effectiveTarifaId = clienteTarifaId || null;
  const { data: effectiveTarifaLineas } = useQuery({
    queryKey: ['pos-tarifa-lineas', effectiveTarifaId], enabled: !!effectiveTarifaId, staleTime: CATALOG_STALE,
    queryFn: async () => { const { data } = await supabase.from('tarifa_lineas').select('*').eq('tarifa_id', effectiveTarifaId!); return (data ?? []) as TarifaLineaRule[]; },
  });
  const resolvePosPrice = useCallback((p: any): number => {
    // No client or no tarifa → use precio_principal directly
    if (!effectiveTarifaId) return p.precio_principal ?? 0;
    const rules = effectiveTarifaLineas ?? [];
    if (!rules.length) return p.precio_principal ?? 0;
    return resolveProductPrice(rules, { id: p.id, precio_principal: p.precio_principal ?? 0, costo: p.costo ?? 0, clasificacion_id: p.clasificacion_id, tiene_iva: p.tiene_iva, iva_pct: p.iva_pct ?? 16, tiene_ieps: p.tiene_ieps, ieps_pct: p.ieps_pct ?? 0, ieps_tipo: p.ieps_tipo }, clienteListaPrecioId);
  }, [effectiveTarifaId, effectiveTarifaLineas, clienteListaPrecioId]);
  useEffect(() => {
    if (cart.length === 0 || !productos) return;
    setCart(prev => prev.map(item => { const prod = productos.find(p => p.id === item.producto_id); if (!prod) return item; return { ...item, precio_unitario: resolvePosPrice(prod) }; }));
  }, [effectiveTarifaLineas, clienteListaPrecioId]);

  // Barcode scanner: listen for rapid key presses
  useEffect(() => {
    let buffer = '';
    let timer: ReturnType<typeof setTimeout>;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input (except the scan field)
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' && target !== scanRef.current && target.id !== 'pos-search') return;
      if (target.tagName === 'TEXTAREA') return;

      if (e.key === 'Enter' && buffer.length > 2) {
        e.preventDefault();
        handleScan(buffer.trim());
        buffer = '';
        return;
      }

      if (e.key.length === 1) {
        buffer += e.key;
        clearTimeout(timer);
        timer = setTimeout(() => { buffer = ''; }, 100);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => { window.removeEventListener('keydown', handleKeyDown); clearTimeout(timer); };
  }, [productos, cart]);

  const handleScan = useCallback((code: string) => {
    if (!productos) return;
    const found = productos.find(p =>
      p.codigo.toLowerCase() === code.toLowerCase() ||
      (p.clave_alterna && p.clave_alterna.toLowerCase() === code.toLowerCase())
    );
    if (found) {
      addToCart(found);
      toast.success(`${found.nombre} agregado`);
    } else {
      toast.error(`Producto no encontrado: ${code}`);
    }
  }, [productos, cart]);

  const filteredProducts = useMemo(() => {
    if (!productos) return [];
    // Filter out products with no stock unless vender_sin_stock is enabled
    const available = productos.filter(p => p.vender_sin_stock || (p.cantidad ?? 0) > 0);
    if (!search) return available;
    const s = search.toLowerCase();
    return available.filter(p =>
      p.nombre.toLowerCase().includes(s) ||
      p.codigo.toLowerCase().includes(s) ||
      (p.clave_alterna && p.clave_alterna.toLowerCase().includes(s))
    );
  }, [productos, search]);

  const filteredClientes = useMemo(() => {
    if (!clientes) return [];
    if (!clienteSearch) return clientes;
    const s = clienteSearch.toLowerCase();
    return clientes.filter(c => c.nombre.toLowerCase().includes(s) || c.codigo?.toLowerCase().includes(s));
  }, [clientes, clienteSearch]);

  const addToCart = (p: any) => {
    const stock = p.cantidad ?? 0;
    const canSellWithout = p.vender_sin_stock;
    setCart(prev => {
      const existing = prev.find(c => c.producto_id === p.id);
      if (existing) {
        const newQty = existing.cantidad + 1;
        if (!canSellWithout && newQty > stock) {
          toast.error(`Stock máximo: ${stock}`);
          return prev;
        }
        return prev.map(c => c.producto_id === p.id ? { ...c, cantidad: newQty } : c);
      }
      if (!canSellWithout && stock < 1) {
        toast.error('Sin stock disponible');
        return prev;
      }
      return [...prev, {
        producto_id: p.id,
        codigo: p.codigo,
        nombre: p.nombre,
        precio_unitario: resolvePosPrice(p),
        cantidad: 1,
        tiene_iva: p.tiene_iva ?? false,
        iva_pct: p.tiene_iva ? (p.iva_pct ?? 16) : 0,
        tiene_ieps: p.tiene_ieps ?? false,
        ieps_pct: p.tiene_ieps ? (p.ieps_pct ?? 0) : 0,
        unidad: 'pz',
        _max_stock: canSellWithout ? Infinity : stock,
      }];
    });
  };

  const updateQty = (id: string, qty: number) => {
    if (qty <= 0) {
      setCart(prev => prev.filter(c => c.producto_id !== id));
    } else {
      const item = cart.find(c => c.producto_id === id);
      const prod = productos?.find(p => p.id === id);
      const maxStock = prod?.vender_sin_stock ? Infinity : (prod?.cantidad ?? 0);
      if (qty > maxStock) {
        toast.error(`Stock máximo: ${maxStock}`);
        return;
      }
      setCart(prev => prev.map(c => c.producto_id === id ? { ...c, cantidad: qty } : c));
    }
  };

  const updatePrice = (id: string, price: number) => {
    setCart(prev => prev.map(c => c.producto_id === id ? { ...c, precio_unitario: price } : c));
  };

  const removeItem = (id: string) => setCart(prev => prev.filter(c => c.producto_id !== id));

  const totals = useMemo(() => {
    let subtotal = 0, iva = 0, ieps = 0, items = 0;
    cart.forEach(item => {
      const line = item.precio_unitario * item.cantidad;
      subtotal += line;
      const lineIeps = item.tiene_ieps ? line * (item.ieps_pct / 100) : 0;
      ieps += lineIeps;
      if (item.tiene_iva) iva += (line + lineIeps) * (item.iva_pct / 100);
      items += item.cantidad;
    });
    return { subtotal, iva, ieps, total: subtotal + iva + ieps, items };
  }, [cart]);

  const totalPagado = useMemo(() => paySplits.reduce((s, p) => s + (parseFloat(p.monto) || 0), 0), [paySplits]);
  const cambio = totalPagado > totals.total ? totalPagado - totals.total : 0;
  const faltante = Math.max(0, totals.total - totalPagado);

  const fmt = (n: number) => n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtM = (n: number) => `${s}${fmt(n)}`;

  const addSplit = () => setPaySplits(prev => [...prev, { id: crypto.randomUUID(), metodo: 'efectivo', monto: '', referencia: '' }]);
  const removeSplit = (id: string) => setPaySplits(prev => prev.length > 1 ? prev.filter(p => p.id !== id) : prev);
  const updateSplit = (id: string, field: keyof PaySplit, value: string) =>
    setPaySplits(prev => prev.map(p => p.id === id ? { ...p, [field]: value } : p));

  const clearAll = () => {
    setCart([]);
    setClienteId(null);
    setClienteNombre('Público general');
    setClienteTarifaId(null);
    setClienteListaPrecioId(null);
    setCondicion('contado');
    setShowPago(false);
    setPaySplits([{ id: crypto.randomUUID(), metodo: 'efectivo', monto: '', referencia: '' }]);
    setSearch('');
  };

  // Ticket state
  const [showTicket, setShowTicket] = useState(false);
  const [lastVentaData, setLastVentaData] = useState<any>(null);

  // Save sale
  const handleCobrar = async () => {
    if (!empresa || !user || cart.length === 0) return;
    setSaving(true);
    try {
      const ventaId = crypto.randomUUID();
      const almacenId = profile?.almacen_id || null;
      const today = todayInTimezone(empresa?.zona_horaria);

      // 1. Insert venta
      const { data: ventaData, error: ventaErr } = await supabase.from('ventas').insert({
        id: ventaId,
        empresa_id: empresa.id,
        cliente_id: clienteId,
        tipo: 'venta_directa',
        vendedor_id: profile?.vendedor_id || profile?.id || null,
        condicion_pago: condicion,
        entrega_inmediata: true,
        status: 'confirmado',
        almacen_id: almacenId,
        subtotal: totals.subtotal,
        iva_total: totals.iva,
        ieps_total: totals.ieps,
        descuento_total: 0,
        total: totals.total,
        saldo_pendiente: condicion === 'credito' ? totals.total : 0,
        fecha: today,
      }).select('folio').single();
      if (ventaErr) throw ventaErr;

      // 2. Insert lines
      const lineas = cart.map(item => {
        const lineSub = item.precio_unitario * item.cantidad;
        const lineIeps = item.tiene_ieps ? lineSub * (item.ieps_pct / 100) : 0;
        const lineIva = item.tiene_iva ? (lineSub + lineIeps) * (item.iva_pct / 100) : 0;
        return {
          venta_id: ventaId,
          producto_id: item.producto_id,
          descripcion: item.nombre,
          cantidad: item.cantidad,
          precio_unitario: item.precio_unitario,
          subtotal: lineSub,
          iva_pct: item.iva_pct,
          iva_monto: lineIva,
          ieps_pct: item.ieps_pct,
          ieps_monto: lineIeps,
          descuento_pct: 0,
          total: lineSub + lineIeps + lineIva,
        };
      });
      const { error: linErr } = await supabase.from('venta_lineas').insert(lineas);
      if (linErr) throw linErr;

      // 3. Deduct stock from global inventory and log movements
      for (const item of cart) {
        const { data: prod } = await supabase.from('productos').select('cantidad').eq('id', item.producto_id).single();
        const currentQty = Number(prod?.cantidad ?? 0);
        await supabase.from('productos').update({ cantidad: Math.max(0, currentQty - item.cantidad) } as any).eq('id', item.producto_id);
        
        // Deduct from stock_almacen if almacen assigned
        if (almacenId) {
          const { data: sa } = await supabase.from('stock_almacen')
            .select('id, cantidad')
            .eq('almacen_id', almacenId)
            .eq('producto_id', item.producto_id)
            .maybeSingle();
          if (sa) {
            await supabase.from('stock_almacen').update({ cantidad: Math.max(0, sa.cantidad - item.cantidad), updated_at: new Date().toISOString() } as any).eq('id', sa.id);
          }
        }
        
        // Log inventory movement
        await supabase.from('movimientos_inventario').insert({
          empresa_id: empresa.id,
          tipo: 'salida',
          producto_id: item.producto_id,
          cantidad: item.cantidad,
          almacen_origen_id: almacenId,
          referencia_tipo: 'venta',
          referencia_id: ventaId,
          user_id: user.id,
          fecha: today,
          notas: `Venta POS ${ventaData?.folio ?? ventaId.slice(0, 8)}`,
        } as any);
      }

      // 4. Insert cobros if contado (one per split)
      if (condicion === 'contado' && totals.total > 0) {
        for (const split of paySplits) {
          const splitMonto = parseFloat(split.monto) || 0;
          if (splitMonto <= 0) continue;
          const cobroId = crypto.randomUUID();
          const { error: cobErr } = await supabase.from('cobros').insert({
            id: cobroId,
            empresa_id: empresa.id,
            cliente_id: clienteId ?? empresa.id,
            user_id: user.id,
            monto: Math.min(splitMonto, totals.total),
            metodo_pago: split.metodo,
            referencia: split.referencia || null,
            fecha: today,
          });
          if (!cobErr) {
            await supabase.from('cobro_aplicaciones').insert({
              cobro_id: cobroId,
              venta_id: ventaId,
              monto_aplicado: Math.min(splitMonto, totals.total),
            });
          }
        }
      }

      // Save ticket data for display
      setLastVentaData({
        folio: ventaData?.folio ?? ventaId.slice(0, 8),
        fecha: today,
        clienteNombre,
        lineas: cart.map(item => {
          const lineSub = item.precio_unitario * item.cantidad;
          const lineIeps = item.tiene_ieps ? lineSub * (item.ieps_pct / 100) : 0;
          const lineIva = item.tiene_iva ? (lineSub + lineIeps) * (item.iva_pct / 100) : 0;
          return {
            nombre: item.nombre,
            cantidad: item.cantidad,
            precio: item.precio_unitario,
            subtotal: lineSub,
            iva_monto: lineIva,
            ieps_monto: lineIeps,
            total: lineSub + lineIeps + lineIva,
          };
        }),
        subtotal: totals.subtotal,
        iva: totals.iva,
        ieps: totals.ieps,
        total: totals.total,
        condicionPago: condicion,
        metodoPago: paySplits.map(s => s.metodo).join(' + '),
        montoRecibido: totalPagado > 0 ? totalPagado : undefined,
        cambio: cambio > 0 ? cambio : undefined,
      });

      toast.success('¡Venta registrada!');
      queryClient.invalidateQueries({ queryKey: ['ventas'] });
      queryClient.invalidateQueries({ queryKey: ['pos-productos'] });
      queryClient.invalidateQueries({ queryKey: ['productos'] });
      queryClient.invalidateQueries({ queryKey: ['inventario'] });
      setShowTicket(true);
      setShowPago(false);
    } catch (err: any) {
      toast.error(err.message || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  // Quick amounts
  const quickAmounts = useMemo(() => {
    const t = totals.total;
    if (t <= 0) return [];
    const rounded = Math.ceil(t / 50) * 50;
    const amounts = [t];
    if (rounded !== t) amounts.push(rounded);
    if (rounded + 50 <= t * 3) amounts.push(rounded + 50);
    if (rounded + 100 <= t * 3) amounts.push(rounded + 100);
    return [...new Set(amounts)].sort((a, b) => a - b).slice(0, 4);
  }, [totals.total]);

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      {/* Top bar */}
      <header className="h-12 bg-card border-b border-border flex items-center px-4 gap-3 shrink-0">
        <button onClick={() => navigate('/dashboard')} className="p-1.5 rounded-md hover:bg-accent transition-colors" title="Volver">
          <ArrowLeft className="h-4 w-4 text-foreground" />
        </button>
        <div className="flex items-center gap-2">
          <ShoppingCart className="h-5 w-5 text-primary" />
          <span className="text-[16px] font-bold text-foreground tracking-tight">Punto de venta</span>
        </div>
        <div className="flex-1" />
        {/* Client selector */}
        <button
          onClick={() => setShowClientes(true)}
          className="flex items-center gap-2 bg-accent/60 hover:bg-accent rounded-lg px-3 py-1.5 transition-colors"
        >
          <User className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-[12px] font-medium text-foreground max-w-[180px] truncate">{clienteNombre}</span>
        </button>
        <button onClick={clearAll} className="text-[11px] text-destructive font-medium hover:underline">
          Limpiar
        </button>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* ─── LEFT: Products ─── */}
        <div className="flex-1 flex flex-col min-w-0 border-r border-border">
          {/* Search + scanner */}
          <div className="px-4 pt-3 pb-2 flex gap-2">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                id="pos-search"
                type="text"
                placeholder="Buscar producto o escanear código..."
                className="w-full bg-accent/50 border border-border rounded-lg pl-10 pr-3 py-2.5 text-[13px] text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40"
                value={search}
                onChange={e => setSearch(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && search.trim()) {
                    // Try exact barcode match
                    const found = productos?.find(p =>
                      p.codigo.toLowerCase() === search.trim().toLowerCase() ||
                      (p.clave_alterna && p.clave_alterna.toLowerCase() === search.trim().toLowerCase())
                    );
                    if (found) {
                      addToCart(found);
                      setSearch('');
                      toast.success(`${found.nombre} agregado`);
                    }
                  }
                }}
                autoFocus
              />
            </div>
            <div className="flex items-center gap-1 bg-accent/30 rounded-lg px-3 text-muted-foreground">
              <Barcode className="h-4 w-4" />
              <span className="text-[10px] font-medium">Escáner activo</span>
            </div>
          </div>

          {/* Product grid */}
          <div className="flex-1 overflow-auto px-4 pb-4">
            <div className="grid grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-2">
              {filteredProducts.map(p => {
                const inCart = cart.find(c => c.producto_id === p.id);
                const stock = p.cantidad ?? 0;
                return (
                  <button
                    key={p.id}
                    onClick={() => addToCart(p)}
                    className={`relative rounded-xl border p-3 text-left transition-all active:scale-[0.97] hover:shadow-md ${
                      inCart
                        ? 'border-primary/40 bg-primary/[0.04] ring-1 ring-primary/20'
                        : 'border-border bg-card hover:border-primary/20'
                    }`}
                  >
                    {inCart && (
                      <div className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[11px] font-bold shadow-sm">
                        {inCart.cantidad}
                      </div>
                    )}
                    <div className="w-full aspect-square rounded-lg bg-accent/50 mb-2 flex items-center justify-center overflow-hidden">
                      {p.imagen_url ? (
                        <img src={p.imagen_url} alt="" className="w-full h-full object-cover" loading="lazy" />
                      ) : (
                        <Package className="h-8 w-8 text-muted-foreground/30" />
                      )}
                    </div>
                    <p className="text-[11px] font-medium text-foreground truncate leading-tight">{p.nombre}</p>
                    <p className="text-[10px] text-muted-foreground font-mono mt-0.5">{p.codigo}</p>
                    <div className="flex items-baseline justify-between mt-1">
                      <span className="text-[14px] font-bold text-primary">{fmtM(p.precio_principal ?? 0)}</span>
                      <span className={`text-[9px] font-medium ${stock > 0 ? 'text-green-600' : 'text-destructive'}`}>
                        {fmtNum(stock)} disp.
                      </span>
                    </div>
                  </button>
                );
              })}
              {filteredProducts.length === 0 && (
                <div className="col-span-full py-16 text-center">
                  <Package className="h-10 w-10 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-[13px] text-muted-foreground">No se encontraron productos</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ─── RIGHT: Cart ─── */}
        <div className="w-[380px] xl:w-[420px] flex flex-col bg-card shrink-0">
          {/* Cart header */}
          <div className="px-4 pt-3 pb-2 border-b border-border">
            <div className="flex items-center justify-between">
              <h2 className="text-[13px] font-semibold text-foreground flex items-center gap-1.5">
                <Receipt className="h-4 w-4 text-primary" />
                Ticket
                {cart.length > 0 && <span className="text-muted-foreground font-normal">({totals.items} art.)</span>}
              </h2>
              {cart.length > 0 && (
                <button onClick={() => setCart([])} className="text-[10px] text-destructive font-medium hover:underline">
                  Vaciar
                </button>
              )}
            </div>
          </div>

          {/* Cart items */}
          <div className="flex-1 overflow-auto px-3 py-2 space-y-1">
            {cart.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center gap-2 opacity-40">
                <ShoppingCart className="h-12 w-12 text-muted-foreground" />
                <p className="text-[13px] text-muted-foreground">Escanea o selecciona productos</p>
              </div>
            )}
            {cart.map(item => {
              const lineTotal = item.precio_unitario * item.cantidad;
              return (
                <div key={item.producto_id} className="group rounded-lg px-3 py-2 bg-accent/30 hover:bg-accent/50 transition-colors">
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-medium text-foreground truncate">{item.nombre}</p>
                      <p className="text-[10px] text-muted-foreground">{item.codigo}</p>
                    </div>
                    <button onClick={() => removeItem(item.producto_id)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-destructive/10 rounded">
                      <X className="h-3 w-3 text-destructive" />
                    </button>
                  </div>
                  <div className="flex items-center gap-2 mt-1.5">
                    <div className="flex items-center bg-background rounded-md border border-border">
                      <button onClick={() => updateQty(item.producto_id, item.cantidad - 1)}
                        className="px-2 py-1 hover:bg-accent rounded-l-md transition-colors">
                        <Minus className="h-3 w-3 text-foreground" />
                      </button>
                      <input
                        type="number"
                        className="w-10 text-center text-[12px] font-bold bg-transparent focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none text-foreground"
                        value={item.cantidad}
                        onChange={e => { const v = parseInt(e.target.value); if (!isNaN(v) && v > 0) updateQty(item.producto_id, v); }}
                        onFocus={e => e.target.select()}
                      />
                      <button onClick={() => updateQty(item.producto_id, item.cantidad + 1)}
                        className="px-2 py-1 hover:bg-accent rounded-r-md transition-colors">
                        <Plus className="h-3 w-3 text-foreground" />
                      </button>
                    </div>
                    <span className="text-[10px] text-muted-foreground">×</span>
                    <input
                      type="number"
                      className="w-20 text-[12px] font-medium text-foreground bg-background border border-border rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary/30 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      value={item.precio_unitario}
                      onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v) && v >= 0) updatePrice(item.producto_id, v); }}
                      onFocus={e => e.target.select()}
                    />
                    <span className="flex-1 text-right text-[13px] font-bold text-foreground tabular-nums">{fmtM(lineTotal)}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Totals + Checkout */}
          <div className="border-t border-border px-4 py-3 space-y-2 bg-card">
            <div className="flex justify-between text-[12px]">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="font-medium text-foreground tabular-nums">${fmt(totals.subtotal)}</span>
            </div>
            {totals.iva > 0 && (
              <div className="flex justify-between text-[12px]">
                <span className="text-muted-foreground">IVA</span>
                <span className="font-medium text-foreground tabular-nums">${fmt(totals.iva)}</span>
              </div>
            )}
            {totals.ieps > 0 && (
              <div className="flex justify-between text-[12px]">
                <span className="text-muted-foreground">IEPS</span>
                <span className="font-medium text-foreground tabular-nums">${fmt(totals.ieps)}</span>
              </div>
            )}
            <div className="flex justify-between items-baseline pt-2 border-t border-border">
              <span className="text-[14px] font-bold text-foreground">Total</span>
              <span className="text-[24px] font-black text-primary tabular-nums">${fmt(totals.total)}</span>
            </div>

            <button
              onClick={() => setShowPago(true)}
              disabled={cart.length === 0}
              className="w-full bg-primary text-primary-foreground rounded-xl py-3.5 text-[15px] font-bold disabled:opacity-30 active:scale-[0.98] transition-transform shadow-lg shadow-primary/20 flex items-center justify-center gap-2"
            >
              <CreditCard className="h-5 w-5" />
              Cobrar ${fmt(totals.total)}
            </button>
          </div>
        </div>
      </div>

      {/* ─── Client picker modal ─── */}
      {showClientes && (
        <div className="fixed inset-0 z-50 bg-foreground/40 flex items-start justify-center pt-20" onClick={() => setShowClientes(false)}>
          <div className="bg-card rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-border" onClick={e => e.stopPropagation()}>
            <div className="px-4 pt-4 pb-2">
              <h3 className="text-[14px] font-bold text-foreground mb-2">Seleccionar cliente</h3>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Buscar cliente..."
                  className="w-full bg-accent/50 border border-border rounded-lg pl-10 pr-3 py-2.5 text-[13px] text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/30"
                  value={clienteSearch}
                  onChange={e => setClienteSearch(e.target.value)}
                  autoFocus
                />
              </div>
            </div>
            <div className="max-h-72 overflow-auto px-2 pb-2">
              <button
                onClick={() => { setClienteId(null); setClienteNombre('Público general'); setClienteTarifaId(null); setClienteListaPrecioId(null); setShowClientes(false); setClienteSearch(''); if (condicion === 'credito') setCondicion('contado'); }}
                className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-accent text-[13px] text-foreground font-medium"
              >
                Público general
              </button>
              {filteredClientes.map(c => (
                <button
                  key={c.id}
                  onClick={() => { setClienteId(c.id); setClienteNombre(c.nombre); setClienteTarifaId((c as any).tarifa_id || null); setClienteListaPrecioId((c as any).lista_precio_id || null); setShowClientes(false); setClienteSearch(''); if (!(c as any).credito && condicion === 'credito') setCondicion('contado'); }}
                  className={`w-full text-left px-3 py-2.5 rounded-lg hover:bg-accent transition-colors ${clienteId === c.id ? 'bg-primary/10' : ''}`}
                >
                  <p className="text-[13px] font-medium text-foreground truncate">{c.nombre}</p>
                  <div className="flex items-center gap-2">{c.codigo && <span className="text-[10px] text-muted-foreground">{c.codigo}</span>}{(c as any).credito && <span className="text-[9px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-medium">Crédito</span>}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ─── Payment modal ─── */}
      {showPago && (
        <div className="fixed inset-0 z-50 bg-foreground/40 flex items-center justify-center" onClick={() => !saving && setShowPago(false)}>
          <div className="bg-card rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border border-border" onClick={e => e.stopPropagation()}>
            <div className="px-6 pt-5 pb-3 border-b border-border">
              <div className="flex items-center justify-between">
                <h3 className="text-[16px] font-bold text-foreground">Cobrar</h3>
                <button onClick={() => setShowPago(false)} className="p-1 rounded-md hover:bg-accent">
                  <X className="h-4 w-4 text-muted-foreground" />
                </button>
              </div>
              <div className="flex items-baseline justify-between mt-2">
                <span className="text-[13px] text-muted-foreground">{clienteNombre} · {totals.items} artículos</span>
                <span className="text-[28px] font-black text-primary tabular-nums">${fmt(totals.total)}</span>
              </div>
            </div>

            <div className="px-6 py-4 space-y-4">
              {/* Condición */}
              <div>
                <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Condición de pago</label>
                <div className="flex gap-2 mt-1.5">
                  {(['contado', 'credito'] as const).map(c => (
                    <button key={c} onClick={() => setCondicion(c)}
                      className={`flex-1 py-2 rounded-lg text-[12px] font-semibold transition-all ${condicion === c ? 'bg-primary text-primary-foreground' : 'bg-accent text-foreground'}`}>
                      {c === 'contado' ? 'Contado' : 'Crédito'}
                    </button>
                  ))}
                </div>
              </div>

              {condicion === 'contado' && (
                <>
                  {/* Payment splits */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Métodos de pago</label>
                      <button onClick={addSplit} className="text-[11px] text-primary font-semibold hover:underline flex items-center gap-1">
                        <Plus className="h-3 w-3" /> Agregar método
                      </button>
                    </div>

                    {paySplits.map((split, idx) => (
                      <div key={split.id} className="rounded-xl border border-border bg-accent/20 p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-semibold text-muted-foreground">Pago {idx + 1}</span>
                          {paySplits.length > 1 && (
                            <button onClick={() => removeSplit(split.id)} className="text-destructive hover:underline text-[10px] font-medium">Quitar</button>
                          )}
                        </div>
                        {/* Method selector */}
                        <div className="flex gap-1.5">
                          {([['efectivo', 'Efectivo', Wallet], ['transferencia', 'Transfer.', Banknote], ['tarjeta', 'Tarjeta', CreditCard]] as const).map(([val, label, Icon]) => (
                            <button key={val} onClick={() => updateSplit(split.id, 'metodo', val)}
                              className={`flex-1 py-2 rounded-lg text-[10px] font-semibold transition-all flex flex-col items-center gap-0.5 ${split.metodo === val ? 'bg-primary text-primary-foreground' : 'bg-background text-foreground border border-border'}`}>
                              <Icon className="h-3.5 w-3.5" />{label}
                            </button>
                          ))}
                        </div>
                        {/* Amount */}
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[14px] text-muted-foreground font-medium">$</span>
                          <input
                            type="number"
                            inputMode="decimal"
                            className="w-full bg-background border border-border rounded-lg pl-8 pr-3 py-2.5 text-[16px] font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            value={split.monto}
                            placeholder={paySplits.length === 1 ? fmt(totals.total) : '0.00'}
                            onChange={e => updateSplit(split.id, 'monto', e.target.value)}
                            autoFocus={idx === 0}
                          />
                        </div>
                        {/* Quick amounts only for first split if single */}
                        {paySplits.length === 1 && split.metodo === 'efectivo' && (
                          <div className="flex gap-1.5">
                            {quickAmounts.map(a => (
                              <button key={a} onClick={() => updateSplit(split.id, 'monto', a.toString())}
                                className={`flex-1 py-1.5 rounded-md text-[10px] font-semibold transition-all ${parseFloat(split.monto) === a ? 'bg-primary text-primary-foreground' : 'bg-background text-foreground border border-border hover:bg-accent'}`}>
                                ${fmt(a)}
                              </button>
                            ))}
                          </div>
                        )}
                        {/* Reference for non-cash */}
                        {split.metodo !== 'efectivo' && (
                          <input
                            type="text"
                            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-[12px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/30"
                            value={split.referencia}
                            placeholder="Referencia (opcional)"
                            onChange={e => updateSplit(split.id, 'referencia', e.target.value)}
                          />
                        )}
                      </div>
                    ))}

                    {/* Summary */}
                    {paySplits.length > 1 && (
                      <div className="rounded-lg bg-accent/40 px-3 py-2 space-y-1">
                        <div className="flex justify-between text-[11px]">
                          <span className="text-muted-foreground">Total pagado</span>
                          <span className="font-bold text-foreground tabular-nums">${fmt(totalPagado)}</span>
                        </div>
                        {faltante > 0 && (
                          <div className="flex justify-between text-[11px]">
                            <span className="text-destructive font-medium">Faltante</span>
                            <span className="font-bold text-destructive tabular-nums">${fmt(faltante)}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {cambio > 0 && (
                      <div className="flex justify-between bg-green-50 dark:bg-green-950/30 rounded-lg px-3 py-2.5">
                        <span className="text-[13px] text-green-700 dark:text-green-400 font-medium">Cambio</span>
                        <span className="text-[18px] text-green-700 dark:text-green-400 font-bold tabular-nums">${fmt(cambio)}</span>
                      </div>
                    )}
                  </div>
                </>
              )}

              {condicion === 'credito' && (
                <div className="bg-accent/50 rounded-lg p-3 text-center">
                  <p className="text-[12px] text-muted-foreground">Se registrará a crédito — no se cobra ahora</p>
                </div>
              )}
            </div>

            <div className="px-6 pb-5 pt-2">
              <button
                onClick={handleCobrar}
                disabled={saving || cart.length === 0}
                className="w-full bg-green-600 hover:bg-green-700 text-white rounded-xl py-4 text-[16px] font-bold disabled:opacity-40 active:scale-[0.98] transition-all shadow-lg flex items-center justify-center gap-2"
              >
                <Check className="h-5 w-5" />
                {saving ? 'Guardando...' : condicion === 'credito' ? 'Confirmar venta a crédito' : `Confirmar $${fmt(totals.total)}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Ticket after sale ─── */}
      {showTicket && lastVentaData && (
        <div className="fixed inset-0 z-50 bg-background">
          <TicketVenta
            empresa={{
              nombre: empresa?.nombre ?? '',
              telefono: empresa?.telefono,
              direccion: empresa?.direccion,
              logo_url: empresa?.logo_url,
              rfc: empresa?.rfc,
              moneda: empresa?.moneda,
            }}
            folio={lastVentaData.folio}
            fecha={lastVentaData.fecha}
            clienteNombre={lastVentaData.clienteNombre}
            lineas={lastVentaData.lineas}
            subtotal={lastVentaData.subtotal}
            iva={lastVentaData.iva}
            ieps={lastVentaData.ieps}
            total={lastVentaData.total}
            condicionPago={lastVentaData.condicionPago}
            metodoPago={lastVentaData.metodoPago}
            montoRecibido={lastVentaData.montoRecibido}
            cambio={lastVentaData.cambio}
            onPrintTicket={() => {
              const td = buildTicketDataFromVenta({
                empresa,
                venta: {
                  folio: lastVentaData.folio,
                  fecha: lastVentaData.fecha,
                  subtotal: lastVentaData.subtotal,
                  iva_total: lastVentaData.iva,
                  ieps_total: lastVentaData.ieps,
                  total: lastVentaData.total,
                  condicion_pago: lastVentaData.condicionPago,
                  metodo_pago: lastVentaData.metodoPago,
                },
                clienteNombre: lastVentaData.clienteNombre,
                lineas: lastVentaData.lineas.map((l: any) => ({
                  nombre: l.nombre,
                  cantidad: l.cantidad,
                  precio_unitario: l.precio,
                  total: l.total,
                  iva_monto: l.iva_monto,
                  ieps_monto: l.ieps_monto,
                })),
                montoRecibido: lastVentaData.montoRecibido,
                cambio: lastVentaData.cambio,
              });
              const ticketAncho = (empresa as any)?.ticket_ancho ?? '58';
              printTicket(td, { ticketAncho });
            }}
            onClose={() => {
              setShowTicket(false);
              setLastVentaData(null);
              clearAll();
            }}
          />
        </div>
      )}
    </div>
  );
}
