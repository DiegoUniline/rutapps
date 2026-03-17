import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Search, Plus, Minus, Trash2, RotateCcw, ChevronRight } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useCargaActiva } from '@/hooks/useCargas';
import { useSaveDevolucion } from '@/hooks/useDevoluciones';
import { useOfflineQuery } from '@/hooks/useOfflineData';
import { toast } from 'sonner';

interface DevItem {
  producto_id: string;
  codigo: string;
  nombre: string;
  cantidad: number;
  motivo: 'no_vendido' | 'vencido' | 'danado' | 'cambio' | 'otro';
  max: number;
}

const MOTIVOS = [
  { value: 'no_vendido', label: 'No vendido' },
  { value: 'vencido', label: 'Vencido' },
  { value: 'danado', label: 'Dañado' },
  { value: 'cambio', label: 'Cambio' },
  { value: 'otro', label: 'Otro' },
];

type Tipo = 'almacen' | 'tienda';
type Step = 'tipo' | 'cliente' | 'items' | 'confirm';

export default function RutaDevolucion() {
  const navigate = useNavigate();
  const { user, profile, empresa } = useAuth();
  const [tipo, setTipo] = useState<Tipo>('almacen');
  const [items, setItems] = useState<DevItem[]>([]);
  const [notas, setNotas] = useState('');
  const [saving, setSaving] = useState(false);
  const [clienteId, setClienteId] = useState<string | null>(null);
  const [clienteNombre, setClienteNombre] = useState('');
  const [searchCliente, setSearchCliente] = useState('');
  const [searchProducto, setSearchProducto] = useState('');
  const [step, setStep] = useState<Step>('tipo');

  const saveDevolucion = useSaveDevolucion();

  const vendedorId = profile?.vendedor_id || profile?.id;
  const { data: carga } = useCargaActiva(vendedorId);

  const { data: clientes } = useOfflineQuery('clientes', {
    empresa_id: empresa?.id,
    status: 'activo',
  }, { enabled: !!empresa?.id && tipo === 'tienda', orderBy: 'nombre' });

  const productosDisponibles = useMemo(() => {
    if (!carga?.carga_lineas) return [];
    return (carga.carga_lineas as any[]).map(l => {
      const enMano = (l.cantidad_cargada ?? 0) - (l.cantidad_devuelta ?? 0) - (l.cantidad_vendida ?? 0);
      return {
        producto_id: l.producto_id,
        codigo: l.productos?.codigo ?? '',
        nombre: l.productos?.nombre ?? '',
        max: Math.max(0, enMano),
      };
    }).filter(p => p.max > 0);
  }, [carga]);

  const filteredProductos = useMemo(() => {
    if (!searchProducto.trim()) return productosDisponibles;
    const q = searchProducto.toLowerCase();
    return productosDisponibles.filter(p =>
      p.nombre.toLowerCase().includes(q) || p.codigo.toLowerCase().includes(q)
    );
  }, [productosDisponibles, searchProducto]);

  const filteredClientes = clientes?.filter(c =>
    !searchCliente || c.nombre.toLowerCase().includes(searchCliente.toLowerCase()) || (c.codigo?.toLowerCase().includes(searchCliente.toLowerCase()))
  );

  const getItem = (pid: string) => items.find(i => i.producto_id === pid);

  const addItem = (p: { producto_id: string; codigo: string; nombre: string; max: number }) => {
    if (getItem(p.producto_id)) return;
    setItems(prev => [...prev, { ...p, cantidad: 1, motivo: 'no_vendido' }]);
  };

  const removeItem = (pid: string) => setItems(prev => prev.filter(i => i.producto_id !== pid));

  const updateQty = (pid: string, delta: number) => {
    setItems(prev => prev.map(item => {
      if (item.producto_id !== pid) return item;
      const newQty = Math.min(Math.max(1, item.cantidad + delta), item.max);
      return { ...item, cantidad: newQty };
    }));
  };

  const setQty = (pid: string, val: number) => {
    setItems(prev => prev.map(item => {
      if (item.producto_id !== pid) return item;
      return { ...item, cantidad: Math.min(Math.max(1, val), item.max) };
    }));
  };

  const updateMotivo = (pid: string, motivo: DevItem['motivo']) => {
    setItems(prev => prev.map(item => item.producto_id === pid ? { ...item, motivo } : item));
  };

  const totalItems = items.reduce((s, i) => s + i.cantidad, 0);

  const handleSave = async () => {
    if (items.length === 0) { toast.error('Agrega productos'); return; }
    if (tipo === 'tienda' && !clienteId) { toast.error('Selecciona un cliente'); return; }
    setSaving(true);
    try {
      await saveDevolucion.mutateAsync({
        devolucion: {
          vendedor_id: vendedorId,
          cliente_id: tipo === 'tienda' ? clienteId! : undefined,
          carga_id: carga?.id,
          tipo,
          notas: notas || undefined,
          user_id: user!.id,
        },
        lineas: items.map(i => ({
          producto_id: i.producto_id,
          cantidad: i.cantidad,
          motivo: i.motivo,
        })),
      });
      toast.success('Devolución registrada');
      navigate('/ruta');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const goBack = () => {
    if (step === 'tipo') navigate('/ruta');
    else if (step === 'cliente') setStep('tipo');
    else if (step === 'items') setStep(tipo === 'tienda' ? 'cliente' : 'tipo');
    else setStep('items');
  };

  const fmt = (n: number) => n.toLocaleString('es-MX');

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-card/95 backdrop-blur-md border-b border-border pt-[max(0px,env(safe-area-inset-top))]">
        <div className="flex items-center gap-2 px-3 h-12">
          <button onClick={goBack} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-accent">
            <ArrowLeft className="h-[18px] w-[18px] text-foreground" />
          </button>
          <span className="text-[15px] font-semibold text-foreground flex-1 flex items-center gap-2">
            <RotateCcw className="h-4 w-4 text-primary" /> Devolución
          </span>
          {items.length > 0 && (
            <span className="text-[11px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">
              {totalItems} uds
            </span>
          )}
        </div>
      </header>

      {/* ─── STEP: Tipo ─── */}
      {step === 'tipo' && (
        <div className="flex-1 flex flex-col items-center justify-center px-6 gap-6">
          <div className="text-center">
            <h2 className="text-[18px] font-bold text-foreground mb-1">¿Dónde se hace la devolución?</h2>
            <p className="text-[12px] text-muted-foreground">Elige antes de continuar</p>
          </div>
          <div className="w-full max-w-xs space-y-3">
            <button
              onClick={() => { setTipo('almacen'); setStep('items'); }}
              className="w-full rounded-xl border-2 border-primary bg-primary/5 p-4 text-left active:scale-[0.98] transition-all"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <span className="text-xl">🏭</span>
                </div>
                <div>
                  <p className="text-[14px] font-bold text-foreground">Al almacén</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Regreso producto no vendido al final del día</p>
                </div>
              </div>
            </button>
            <button
              onClick={() => { setTipo('tienda'); setStep('cliente'); }}
              className="w-full rounded-xl border-2 border-border bg-card p-4 text-left active:scale-[0.98] transition-all hover:border-primary/40"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-accent flex items-center justify-center shrink-0">
                  <span className="text-xl">🏪</span>
                </div>
                <div>
                  <p className="text-[14px] font-bold text-foreground">En tienda</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Cambio de producto vencido o dañado con cliente</p>
                </div>
              </div>
            </button>
          </div>
        </div>
      )}

      {/* ─── STEP: Cliente (solo tienda) ─── */}
      {step === 'cliente' && (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="px-3 pt-2.5 pb-1.5">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input type="text" placeholder="Buscar cliente por nombre o código..."
                className="w-full bg-accent/60 rounded-lg pl-8 pr-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1.5 focus:ring-primary/40"
                value={searchCliente} onChange={e => setSearchCliente(e.target.value)} autoFocus />
            </div>
          </div>
          <div className="flex-1 overflow-auto px-3 pb-4 space-y-[3px]">
            {filteredClientes?.map(c => (
              <button key={c.id}
                onClick={() => { setClienteId(c.id); setClienteNombre(c.nombre); setStep('items'); }}
                className={`w-full rounded-lg px-3 py-2.5 flex items-center gap-2.5 active:scale-[0.98] transition-all text-left ${
                  clienteId === c.id ? 'bg-primary/[0.08] ring-1.5 ring-primary/40' : 'bg-card hover:bg-accent/30'
                }`}
              >
                <div className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${
                  clienteId === c.id ? 'bg-primary text-primary-foreground' : 'bg-accent text-foreground'
                }`}>
                  <span className="text-[11px] font-bold">{c.nombre.charAt(0)}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[12.5px] font-medium text-foreground truncate">{c.nombre}</p>
                  {c.codigo && <p className="text-[10.5px] text-muted-foreground">{c.codigo}</p>}
                </div>
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ─── STEP: Items (product selection like ventas) ─── */}
      {step === 'items' && (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Context chips */}
          <div className="px-3 pt-2 pb-1 flex items-center gap-1.5">
            <div className="inline-flex items-center gap-1 bg-accent/60 rounded-md px-2 py-0.5">
              <span className="text-[10px] text-muted-foreground">Tipo:</span>
              <span className="text-[10.5px] font-semibold text-foreground">{tipo === 'almacen' ? 'Al almacén' : 'En tienda'}</span>
            </div>
            {tipo === 'tienda' && clienteNombre && (
              <div className="inline-flex items-center gap-1 bg-accent/60 rounded-md px-2 py-0.5">
                <span className="text-[10px] text-muted-foreground">Cliente:</span>
                <span className="text-[10.5px] font-semibold text-foreground">{clienteNombre}</span>
              </div>
            )}
          </div>

          {/* Search */}
          <div className="px-3 pb-1.5">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input type="text" placeholder="Filtrar productos..."
                className="w-full bg-accent/60 rounded-lg pl-8 pr-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1.5 focus:ring-primary/40"
                value={searchProducto} onChange={e => setSearchProducto(e.target.value)} />
            </div>
          </div>

          {/* Product list */}
          <div className="flex-1 overflow-auto px-3 space-y-[3px] pb-20">
            {filteredProductos.length === 0 && (
              <p className="text-muted-foreground text-[12px] p-4 text-center">No hay productos disponibles en la carga</p>
            )}
            {filteredProductos.map(p => {
              const inList = getItem(p.producto_id);
              return (
                <div key={p.producto_id} className={`rounded-lg px-3 py-2 transition-all ${inList ? 'bg-primary/[0.04] ring-1 ring-primary/20' : 'bg-card'}`}>
                  <div className="flex items-center gap-2.5">
                    <div className="flex-1 min-w-0" onClick={() => !inList && addItem(p)}>
                      <p className="text-[12.5px] font-medium text-foreground truncate">{p.nombre}</p>
                      <div className="flex items-center gap-1.5 mt-px">
                        <span className="text-[10px] text-muted-foreground font-mono">{p.codigo}</span>
                        <span className="text-[10px] text-muted-foreground">·</span>
                        <span className="text-[10px] font-medium text-green-600">
                          {p.max} en mano
                        </span>
                      </div>
                    </div>
                    {inList ? (
                      <div className="flex items-center gap-0.5 shrink-0">
                        <button onClick={() => inList.cantidad === 1 ? removeItem(p.producto_id) : updateQty(p.producto_id, -1)}
                          className="w-7 h-7 rounded-md bg-accent flex items-center justify-center active:scale-90 transition-transform">
                          {inList.cantidad === 1 ? <Trash2 className="h-3 w-3 text-destructive" /> : <Minus className="h-3 w-3 text-foreground" />}
                        </button>
                        <input type="number" inputMode="numeric"
                          className="w-9 text-center text-[13px] font-bold bg-transparent focus:outline-none py-0.5 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none text-foreground"
                          value={inList.cantidad}
                          onChange={e => setQty(p.producto_id, parseInt(e.target.value) || 1)}
                        />
                        <button onClick={() => updateQty(p.producto_id, 1)}
                          disabled={inList.cantidad >= p.max}
                          className="w-7 h-7 rounded-md bg-accent flex items-center justify-center active:scale-90 transition-transform disabled:opacity-30">
                          <Plus className="h-3 w-3 text-foreground" />
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => addItem(p)}
                        className="w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center active:scale-90 transition-transform">
                        <Plus className="h-3.5 w-3.5 text-primary" />
                      </button>
                    )}
                  </div>
                  {/* Motivo selector — only visible when selected */}
                  {inList && (
                    <div className="mt-1.5 flex items-center gap-1.5">
                      <span className="text-[10px] text-muted-foreground shrink-0">Motivo:</span>
                      <select
                        className="flex-1 bg-accent/40 rounded-md px-2 py-1 text-[11px] text-foreground border-0 focus:outline-none focus:ring-1.5 focus:ring-primary/40"
                        value={inList.motivo}
                        onChange={e => updateMotivo(p.producto_id, e.target.value as DevItem['motivo'])}
                      >
                        {MOTIVOS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                      </select>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Notes area (collapsible at bottom) */}
          {items.length > 0 && (
            <div className="px-3 pb-1">
              <input
                type="text"
                className="w-full bg-accent/40 rounded-md px-2.5 py-1.5 text-[12px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1.5 focus:ring-primary/40"
                placeholder="Notas / observaciones..."
                value={notas}
                onChange={e => setNotas(e.target.value)}
              />
            </div>
          )}

          {/* Bottom action */}
          {items.length > 0 && (
            <div className="fixed bottom-0 left-0 right-0 z-30 px-3 pb-3 pt-1 bg-gradient-to-t from-background via-background to-transparent safe-area-bottom">
              <button
                onClick={handleSave}
                disabled={saving}
                className="w-full bg-destructive text-destructive-foreground rounded-xl py-3.5 text-[14px] font-bold disabled:opacity-40 active:scale-[0.98] transition-transform shadow-lg flex items-center justify-center gap-1.5"
              >
                <RotateCcw className="h-4 w-4" />
                {saving ? 'Procesando...' : `Registrar devolución (${totalItems} uds)`}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
