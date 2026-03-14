import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Search, Plus, Minus, Trash2, Check, RotateCcw, Package } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useCargaActiva } from '@/hooks/useCargas';
import { useSaveDevolucion } from '@/hooks/useDevoluciones';
import { supabase } from '@/lib/supabase';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';

interface DevItem {
  producto_id: string;
  codigo: string;
  nombre: string;
  cantidad: number;
  motivo: 'no_vendido' | 'vencido' | 'danado' | 'cambio' | 'otro';
  max: number; // max quantity available
}

const MOTIVOS = [
  { value: 'no_vendido', label: 'No vendido' },
  { value: 'vencido', label: 'Vencido' },
  { value: 'danado', label: 'Dañado' },
  { value: 'cambio', label: 'Cambio' },
  { value: 'otro', label: 'Otro' },
];

type Tipo = 'almacen' | 'tienda';

export default function RutaDevolucion() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [tipo, setTipo] = useState<Tipo>('almacen');
  const [items, setItems] = useState<DevItem[]>([]);
  const [notas, setNotas] = useState('');
  const [saving, setSaving] = useState(false);
  const [clienteId, setClienteId] = useState<string | null>(null);
  const [clienteNombre, setClienteNombre] = useState('');
  const [searchCliente, setSearchCliente] = useState('');
  const [step, setStep] = useState<'tipo' | 'items' | 'confirm'>('tipo');

  const saveDevolucion = useSaveDevolucion();

  const { data: profile } = useQuery({
    queryKey: ['my-profile-dev', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('empresa_id, nombre').eq('user_id', user!.id).single();
      return data;
    },
  });

  const { data: vendedor } = useQuery({
    queryKey: ['my-vendedor-dev', profile?.empresa_id],
    enabled: !!profile?.empresa_id,
    queryFn: async () => {
      const { data } = await supabase.from('vendedores').select('id, nombre').eq('empresa_id', profile!.empresa_id).limit(10);
      const match = data?.find(v => v.nombre.toLowerCase() === profile?.nombre?.toLowerCase());
      return match ?? data?.[0] ?? null;
    },
  });

  const { data: carga } = useCargaActiva(vendedor?.id);

  const { data: clientes } = useQuery({
    queryKey: ['ruta-clientes-dev', profile?.empresa_id],
    enabled: !!profile?.empresa_id && tipo === 'tienda',
    queryFn: async () => {
      const { data } = await supabase.from('clientes').select('id, codigo, nombre').eq('empresa_id', profile!.empresa_id).eq('status', 'activo').order('nombre');
      return data ?? [];
    },
  });

  // Products from active carga
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

  const addItem = (p: { producto_id: string; codigo: string; nombre: string; max: number }) => {
    if (items.find(i => i.producto_id === p.producto_id)) return;
    setItems([...items, { ...p, cantidad: 1, motivo: 'no_vendido' }]);
  };

  const updateItem = (idx: number, updates: Partial<DevItem>) => {
    setItems(prev => prev.map((item, i) => {
      if (i !== idx) return item;
      const updated = { ...item, ...updates };
      if (updates.cantidad !== undefined) updated.cantidad = Math.min(Math.max(1, updates.cantidad), item.max);
      return updated;
    }));
  };

  const removeItem = (idx: number) => setItems(prev => prev.filter((_, i) => i !== idx));

  const totalItems = items.reduce((s, i) => s + i.cantidad, 0);

  const handleSave = async () => {
    if (items.length === 0) { toast.error('Agrega productos'); return; }
    if (tipo === 'tienda' && !clienteId) { toast.error('Selecciona un cliente'); return; }
    setSaving(true);
    try {
      await saveDevolucion.mutateAsync({
        devolucion: {
          vendedor_id: vendedor?.id,
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

  const filteredClientes = clientes?.filter(c =>
    !searchCliente || c.nombre.toLowerCase().includes(searchCliente.toLowerCase())
  );

  const fmt = (n: number) => n.toLocaleString('es-MX');

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-card/95 backdrop-blur-md border-b border-border">
        <div className="flex items-center gap-2 px-3 h-12">
          <button onClick={() => step === 'tipo' ? navigate('/ruta') : setStep(step === 'confirm' ? 'items' : 'tipo')} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-accent">
            <ArrowLeft className="h-[18px] w-[18px] text-foreground" />
          </button>
          <span className="text-[15px] font-semibold text-foreground flex-1 flex items-center gap-2">
            <RotateCcw className="h-4 w-4 text-primary" /> Devolución
          </span>
          {items.length > 0 && step === 'items' && (
            <span className="text-[11px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">
              {totalItems} uds
            </span>
          )}
        </div>
      </header>

      {/* STEP 1: Type */}
      {step === 'tipo' && (
        <div className="flex-1 p-4 space-y-3">
          <p className="text-[13px] text-muted-foreground">¿Dónde se hace la devolución?</p>

          <button
            onClick={() => { setTipo('almacen'); setStep('items'); }}
            className="w-full bg-card border border-border rounded-xl p-4 text-left active:scale-[0.98] transition-transform"
          >
            <p className="text-[14px] font-semibold text-foreground">🏭 Al almacén</p>
            <p className="text-[12px] text-muted-foreground mt-1">Regreso producto no vendido al final del día</p>
          </button>

          <button
            onClick={() => { setTipo('tienda'); setStep('items'); }}
            className="w-full bg-card border border-border rounded-xl p-4 text-left active:scale-[0.98] transition-transform"
          >
            <p className="text-[14px] font-semibold text-foreground">🏪 En tienda</p>
            <p className="text-[12px] text-muted-foreground mt-1">Cambio de producto vencido o dañado con cliente</p>
          </button>
        </div>
      )}

      {/* STEP 2: Items */}
      {step === 'items' && (
        <div className="flex-1 overflow-auto px-3 py-3 space-y-3 pb-24">
          {/* Client selection for store returns */}
          {tipo === 'tienda' && (
            <div className="bg-card border border-border rounded-xl p-3">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Cliente</p>
              {clienteId ? (
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-medium text-foreground">{clienteNombre}</span>
                  <button onClick={() => { setClienteId(null); setClienteNombre(''); }} className="text-[11px] text-primary">Cambiar</button>
                </div>
              ) : (
                <>
                  <div className="relative mb-2">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <input
                      className="w-full bg-accent/60 rounded-lg pl-8 pr-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1.5 focus:ring-primary/40"
                      placeholder="Buscar cliente..."
                      value={searchCliente}
                      onChange={e => setSearchCliente(e.target.value)}
                    />
                  </div>
                  <div className="max-h-40 overflow-auto space-y-0.5">
                    {filteredClientes?.slice(0, 15).map(c => (
                      <button
                        key={c.id}
                        onClick={() => { setClienteId(c.id); setClienteNombre(c.nombre); setSearchCliente(''); }}
                        className="w-full text-left px-3 py-2 rounded-md hover:bg-accent text-[12px]"
                      >
                        {c.nombre}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Available products */}
          <div>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Productos en carga ({productosDisponibles.length})
            </p>
            <div className="space-y-1">
              {productosDisponibles.length === 0 && (
                <p className="text-muted-foreground text-[12px] p-3 text-center bg-card rounded-xl border border-border">No hay productos disponibles</p>
              )}
              {productosDisponibles.map(p => {
                const inList = items.find(i => i.producto_id === p.producto_id);
                return (
                  <button
                    key={p.producto_id}
                    onClick={() => !inList && addItem(p)}
                    disabled={!!inList}
                    className={`w-full bg-card border border-border rounded-lg px-3 py-2.5 text-left flex items-center justify-between active:scale-[0.98] transition-transform ${inList ? 'opacity-40' : ''}`}
                  >
                    <div>
                      <p className="text-[12px] font-medium text-foreground">{p.nombre}</p>
                      <p className="text-[10px] text-muted-foreground">{p.codigo} · En mano: {p.max}</p>
                    </div>
                    {!inList && <Plus className="h-4 w-4 text-primary" />}
                    {inList && <Check className="h-4 w-4 text-green-600" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Selected items */}
          {items.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">A devolver</p>
              <div className="bg-card border border-border rounded-xl divide-y divide-border">
                {items.map((item, idx) => (
                  <div key={item.producto_id} className="p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-[12px] font-medium text-foreground flex-1 truncate">{item.nombre}</p>
                      <button onClick={() => removeItem(idx)}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      {/* Quantity */}
                      <div className="flex items-center gap-1 bg-accent/50 rounded-lg px-1">
                        <button onClick={() => updateItem(idx, { cantidad: item.cantidad - 1 })} className="p-1.5">
                          <Minus className="h-3 w-3" />
                        </button>
                        <span className="text-[13px] font-bold w-8 text-center">{item.cantidad}</span>
                        <button onClick={() => updateItem(idx, { cantidad: item.cantidad + 1 })} className="p-1.5">
                          <Plus className="h-3 w-3" />
                        </button>
                      </div>
                      <span className="text-[10px] text-muted-foreground">/ {item.max}</span>
                      {/* Motivo */}
                      <select
                        className="flex-1 bg-accent/40 rounded-md px-2 py-1.5 text-[11px] text-foreground border-0 focus:outline-none focus:ring-1.5 focus:ring-primary/40"
                        value={item.motivo}
                        onChange={e => updateItem(idx, { motivo: e.target.value as any })}
                      >
                        {MOTIVOS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Notes */}
          <div className="bg-card border border-border rounded-xl p-3">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Notas</p>
            <textarea
              className="w-full bg-accent/40 rounded-md px-2.5 py-2 text-[12px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1.5 focus:ring-primary/40 resize-none"
              rows={2}
              placeholder="Observaciones..."
              value={notas}
              onChange={e => setNotas(e.target.value)}
            />
          </div>
        </div>
      )}

      {/* Bottom action */}
      {step === 'items' && items.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-30 px-3 pb-3 pt-1 bg-gradient-to-t from-background via-background to-transparent">
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
  );
}
