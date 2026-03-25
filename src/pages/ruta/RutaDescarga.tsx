import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Send, CheckCircle, Banknote, Minus, Plus, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { useCurrency } from '@/hooks/useCurrency';

const BILLETES_VALUES = [1000, 500, 200, 100, 50, 20];
const MONEDAS_VALUES = [10, 5, 2, 1, 0.5];

const fmtNum = (n: number) => n.toLocaleString('es-MX', { minimumFractionDigits: 2 });

export default function RutaDescarga() {
  const nav = useNavigate();
  const { user, empresa } = useAuth();
  const { symbol: s } = useCurrency();
  const fmt = fmtNum;
  const BILLETES = BILLETES_VALUES.map(v => ({ label: `${s}${v.toLocaleString()}`, value: v }));
  const MONEDAS = MONEDAS_VALUES.map(v => ({ label: `${s}${v}`, value: v }));
  const qc = useQueryClient();

  const [conteo, setConteo] = useState<Record<number, number>>({});
  const [notas, setNotas] = useState('');

  // Get user's profile to find vendedor_id
  const { data: myProfile } = useQuery({
    queryKey: ['mi-profile-vendedor', user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('vendedor_id')
        .eq('user_id', user!.id)
        .maybeSingle();
      return data;
    },
    enabled: !!user?.id,
  });

  // Get active carga
  const { data: cargaActiva } = useQuery({
    queryKey: ['mi-carga-activa-descarga'],
    queryFn: async () => {
      const { data } = await supabase
        .from('cargas')
        .select('id, fecha, vendedor_id')
        .eq('empresa_id', empresa!.id)
        .in('status', ['en_ruta', 'completada'])
        .order('fecha', { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: !!empresa?.id,
  });

  const vendedorId = cargaActiva?.vendedor_id || myProfile?.vendedor_id || user?.id;

  // Calculate efectivo esperado: (ventas contado + cobros efectivo) - gastos
  const today = useMemo(() => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }, []);

  const { data: financials } = useQuery({
    queryKey: ['descarga-mobile-financials', vendedorId, today],
    enabled: !!vendedorId,
    queryFn: async () => {
      const [ventasRes, cobrosRes, gastosRes, devsRes] = await Promise.all([
        supabase
          .from('ventas')
          .select('total')
          .eq('vendedor_id', vendedorId!)
          .eq('fecha', today)
          .eq('condicion_pago', 'contado')
          .neq('status', 'cancelado'),
        supabase
          .from('cobros')
          .select('monto, metodo_pago')
          .eq('empresa_id', empresa!.id)
          .eq('fecha', today),
        supabase
          .from('gastos')
          .select('monto')
          .eq('vendedor_id', vendedorId!)
          .eq('fecha', today),
        supabase
          .from('devoluciones')
          .select('id, tipo, clientes(nombre), devolucion_lineas(cantidad, motivo, accion, productos(nombre))')
          .eq('empresa_id', empresa!.id)
          .eq('vendedor_id', vendedorId!)
          .eq('fecha', today),
      ]);
      const ventasContado = (ventasRes.data || []).reduce((s, v) => s + (Number(v.total) || 0), 0);
      const cobrosEfectivo = (cobrosRes.data || [])
        .filter(c => c.metodo_pago === 'efectivo')
        .reduce((s, c) => s + (Number(c.monto) || 0), 0);
      const gastosTotal = (gastosRes.data || []).reduce((s, g) => s + (Number(g.monto) || 0), 0);

      // Process devoluciones
      const devItems: { nombre: string; cantidad: number; motivo: string; accion: string; cliente: string }[] = [];
      (devsRes.data || []).forEach((d: any) => {
        (d.devolucion_lineas || []).forEach((l: any) => {
          devItems.push({
            nombre: l.productos?.nombre || '—',
            cantidad: Number(l.cantidad),
            motivo: l.motivo || '—',
            accion: l.accion || 'reposicion',
            cliente: d.clientes?.nombre || '—',
          });
        });
      });

      return { ventasContado, cobrosEfectivo, gastosTotal, devItems };
    },
  });

  const efectivoEsperado = (financials?.ventasContado ?? 0) + (financials?.cobrosEfectivo ?? 0) - (financials?.gastosTotal ?? 0);

  // Check if already submitted for this carga OR for today's date
  const { data: existingDescarga } = useQuery({
    queryKey: ['mi-descarga-hoy', cargaActiva?.id, user?.id],
    queryFn: async () => {
      const d = new Date();
      const today = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      // Check by carga_id
      if (cargaActiva?.id) {
        const { data } = await supabase
          .from('descarga_ruta')
          .select('id, status')
          .eq('carga_id', cargaActiva.id)
          .limit(1)
          .maybeSingle();
        if (data) return data;
      }
      // Check by vendedor + date overlap
      const vendedorId = cargaActiva?.vendedor_id || user?.id;
      if (vendedorId) {
        const { data } = await supabase
          .from('descarga_ruta')
          .select('id, status')
          .eq('vendedor_id', vendedorId)
          .lte('fecha_inicio', today)
          .gte('fecha_fin', today)
          .limit(1)
          .maybeSingle();
        if (data) return data;
      }
      // Also check by fecha field
      const { data } = await supabase
        .from('descarga_ruta')
        .select('id, status')
        .eq('user_id', user!.id)
        .eq('fecha', today)
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: !!user?.id,
  });

  // Calculate effective total from bill/coin counter
  const totalEfectivo = useMemo(() => {
    return Object.entries(conteo).reduce((sum, [denom, qty]) => sum + (Number(denom) * qty), 0);
  }, [conteo]);

  const updateConteo = (denom: number, delta: number) => {
    setConteo(prev => {
      const current = prev[denom] ?? 0;
      const next = Math.max(0, current + delta);
      return { ...prev, [denom]: next };
    });
  };

  const setConteoValue = (denom: number, val: number) => {
    setConteo(prev => ({ ...prev, [denom]: Math.max(0, val) }));
  };

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (totalEfectivo <= 0) throw new Error('Ingresa el efectivo que entregas');

      const diferencia = totalEfectivo - efectivoEsperado;

      const vId = cargaActiva?.vendedor_id || myProfile?.vendedor_id || null;

      const insertData: any = {
        empresa_id: empresa!.id,
        user_id: user!.id,
        vendedor_id: vId,
        efectivo_esperado: efectivoEsperado,
        efectivo_entregado: totalEfectivo,
        diferencia_efectivo: diferencia,
        notas: notas || null,
        fecha_inicio: today,
        fecha_fin: today,
      };

      if (cargaActiva) {
        insertData.carga_id = cargaActiva.id;
      }

      const { data: descarga, error } = await supabase
        .from('descarga_ruta')
        .insert(insertData)
        .select()
        .single();
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Liquidación enviada ✓');
      qc.invalidateQueries({ queryKey: ['mi-descarga-hoy'] });
      qc.invalidateQueries({ queryKey: ['descargas'] });
      nav('/ruta');
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Already submitted
  if (existingDescarga) {
    return (
      <div className="flex flex-col h-screen bg-background">
        <header className="sticky top-0 z-20 bg-card/95 backdrop-blur-md border-b border-border pt-[max(0px,env(safe-area-inset-top))]">
          <div className="flex items-center gap-2 px-3 h-12">
            <button onClick={() => nav('/ruta')} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-accent">
              <ArrowLeft className="h-[18px] w-[18px] text-foreground" />
            </button>
            <span className="text-[15px] font-semibold text-foreground">Liquidación</span>
          </div>
        </header>
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
          <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mb-4">
            <CheckCircle className="h-8 w-8 text-green-600" />
          </div>
          <h2 className="text-lg font-bold text-foreground mb-1">Liquidación enviada ✓</h2>
          <p className="text-sm text-muted-foreground mb-6">El administrador la revisará y aprobará.</p>
          <button onClick={() => nav('/ruta')} className="text-sm text-primary font-medium">
            Volver al inicio
          </button>
        </div>
      </div>
    );
  }

  const hasConteo = Object.values(conteo).some(v => v > 0);

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-card/95 backdrop-blur-md border-b border-border pt-[max(0px,env(safe-area-inset-top))]">
        <div className="flex items-center gap-2 px-3 h-12">
          <button onClick={() => nav('/ruta')} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-accent">
            <ArrowLeft className="h-[18px] w-[18px] text-foreground" />
          </button>
          <span className="text-[15px] font-semibold text-foreground flex-1 flex items-center gap-2">
            <Banknote className="h-4 w-4 text-primary" /> Liquidación
          </span>
        </div>
      </header>

      <div className="flex-1 overflow-auto px-3 py-3 space-y-3 pb-24">
        {/* Instructions */}
        <div className="bg-primary/5 rounded-xl p-3 border border-primary/10">
          <p className="text-[12px] font-semibold text-foreground mb-0.5">Conteo de efectivo</p>
          <p className="text-[11px] text-muted-foreground">
            Cuenta los billetes y monedas que tienes. Solo ingresa las cantidades reales.
          </p>
        </div>

        {/* Running total + expected + difference */}
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Total contado</p>
          <p className="text-3xl font-bold text-foreground tabular-nums">
            {s}{fmt(totalEfectivo)}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="bg-card border border-border rounded-xl p-3 text-center">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-0.5">Esperado</p>
            <p className="text-lg font-bold text-foreground tabular-nums">{s}{fmt(efectivoEsperado)}</p>
          </div>
          <div className={`bg-card border rounded-xl p-3 text-center ${
            totalEfectivo - efectivoEsperado < 0 ? 'border-destructive/40' : 'border-border'
          }`}>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-0.5">Diferencia</p>
            <p className={`text-lg font-bold tabular-nums ${
              totalEfectivo - efectivoEsperado < 0 ? 'text-destructive' : totalEfectivo - efectivoEsperado > 0 ? 'text-primary' : 'text-foreground'
            }`}>
              {totalEfectivo - efectivoEsperado >= 0 ? '+' : ''}{s}{fmt(totalEfectivo - efectivoEsperado)}
            </p>
          </div>
        </div>

        {/* Bills */}
        <div className="bg-card border border-border rounded-xl p-3">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Billetes</p>
          <div className="space-y-1.5">
            {BILLETES.map(b => {
              const qty = conteo[b.value] ?? 0;
              const subtotal = qty * b.value;
              return (
                <div key={b.value} className="flex items-center gap-2">
                  <span className="text-[13px] font-semibold text-foreground w-16">{b.label}</span>
                  <div className="flex items-center gap-0.5 flex-1">
                    <button
                      onClick={() => updateConteo(b.value, -1)}
                      disabled={qty === 0}
                      className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center active:scale-90 transition-transform disabled:opacity-30"
                    >
                      <Minus className="h-3.5 w-3.5 text-foreground" />
                    </button>
                    <input
                      type="number"
                      inputMode="numeric"
                      className="w-12 text-center text-[14px] font-bold bg-transparent focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none text-foreground"
                      value={qty || ''}
                      onChange={e => setConteoValue(b.value, parseInt(e.target.value) || 0)}
                      placeholder="0"
                    />
                    <button
                      onClick={() => updateConteo(b.value, 1)}
                      className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center active:scale-90 transition-transform"
                    >
                      <Plus className="h-3.5 w-3.5 text-foreground" />
                    </button>
                  </div>
                  <span className="text-[12px] text-muted-foreground w-20 text-right tabular-nums">
                    {subtotal > 0 ? `${s}${fmt(subtotal)}` : '—'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Coins */}
        <div className="bg-card border border-border rounded-xl p-3">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Monedas</p>
          <div className="space-y-1.5">
            {MONEDAS.map(m => {
              const qty = conteo[m.value] ?? 0;
              const subtotal = qty * m.value;
              return (
                <div key={m.value} className="flex items-center gap-2">
                  <span className="text-[13px] font-semibold text-foreground w-16">{m.label}</span>
                  <div className="flex items-center gap-0.5 flex-1">
                    <button
                      onClick={() => updateConteo(m.value, -1)}
                      disabled={qty === 0}
                      className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center active:scale-90 transition-transform disabled:opacity-30"
                    >
                      <Minus className="h-3.5 w-3.5 text-foreground" />
                    </button>
                    <input
                      type="number"
                      inputMode="numeric"
                      className="w-12 text-center text-[14px] font-bold bg-transparent focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none text-foreground"
                      value={qty || ''}
                      onChange={e => setConteoValue(m.value, parseInt(e.target.value) || 0)}
                      placeholder="0"
                    />
                    <button
                      onClick={() => updateConteo(m.value, 1)}
                      className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center active:scale-90 transition-transform"
                    >
                      <Plus className="h-3.5 w-3.5 text-foreground" />
                    </button>
                  </div>
                  <span className="text-[12px] text-muted-foreground w-20 text-right tabular-nums">
                    {subtotal > 0 ? `${s}${fmt(subtotal)}` : '—'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Devoluciones del día */}
        {(financials?.devItems || []).length > 0 && (
          <div className="bg-card border border-border rounded-xl p-3">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1">
              <RotateCcw className="h-3 w-3" /> Devoluciones del día ({financials!.devItems.reduce((s, d) => s + d.cantidad, 0)} uds)
            </p>
            <div className="space-y-1">
              {financials!.devItems.map((d, i) => (
                <div key={i} className="flex items-center gap-2 text-[11px]">
                  <span className="flex-1 truncate text-foreground">{d.cantidad}x {d.nombre}</span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-accent text-muted-foreground capitalize shrink-0">{d.motivo.replace(/_/g, ' ')}</span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium shrink-0">
                    {d.accion === 'reposicion' ? 'Repos.' : d.accion === 'nota_credito' ? 'N. crédito' : d.accion === 'descuento_venta' ? 'Desc.' : d.accion === 'devolucion_dinero' ? 'Dev. $' : d.accion}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Notes */}
        <div className="bg-card border border-border rounded-xl p-3">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Observaciones</p>
          <textarea
            className="w-full bg-accent/40 rounded-md px-2.5 py-2 text-[12px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1.5 focus:ring-primary/40 resize-none"
            rows={2}
            placeholder="Algún comentario..."
            value={notas}
            onChange={e => setNotas(e.target.value)}
          />
        </div>
      </div>

      {/* Submit */}
      <div className="fixed bottom-0 left-0 right-0 z-30 px-3 pb-3 pt-1 bg-gradient-to-t from-background via-background to-transparent safe-area-bottom">
        <button
          onClick={() => submitMutation.mutate()}
          disabled={!hasConteo || submitMutation.isPending}
          className="w-full bg-primary text-primary-foreground rounded-xl py-3.5 text-[14px] font-bold disabled:opacity-40 active:scale-[0.98] transition-transform shadow-lg shadow-primary/20 flex items-center justify-center gap-1.5"
        >
          <Send className="h-4 w-4" />
          {submitMutation.isPending ? 'Enviando...' : `Enviar liquidación — ${s}${fmt(totalEfectivo)}`}
        </button>
      </div>
    </div>
  );
}
