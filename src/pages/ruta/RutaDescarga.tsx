import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useDescargaCalculos, DescargaLinea } from '@/hooks/useDescargaRuta';
import { PackageCheck, DollarSign, ArrowLeft, Check, Send, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

/**
 * BLIND VENDOR LIQUIDATION FORM
 * The vendor declares what they physically have — no system expectations shown.
 * After submit: locked with success message.
 */
export default function RutaDescarga() {
  const nav = useNavigate();
  const { user, empresa } = useAuth();
  const qc = useQueryClient();

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

  // Check if already submitted today
  const { data: existingDescarga } = useQuery({
    queryKey: ['mi-descarga-hoy', cargaActiva?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('descarga_ruta')
        .select('id, status')
        .eq('carga_id', cargaActiva!.id)
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: !!cargaActiva?.id,
  });

  // We still need the calc data to build product list & save expected values (hidden from vendor)
  const { lineas: lineasBase, efectivoEsperado } = useDescargaCalculos(cargaActiva?.id ?? null);

  const [lineas, setLineas] = useState<DescargaLinea[]>([]);
  const [efectivoEntregado, setEfectivoEntregado] = useState('');
  const [notas, setNotas] = useState('');

  useEffect(() => {
    if (lineasBase.length > 0 && lineas.length === 0) {
      // Set real = 0 (vendor must fill in)
      setLineas(lineasBase.map(l => ({ ...l, cantidad_real: 0, diferencia: -l.cantidad_esperada })));
    }
  }, [lineasBase]);

  const updateCantidadReal = (idx: number, value: number) => {
    setLineas(prev => prev.map((l, i) => {
      if (i !== idx) return l;
      return { ...l, cantidad_real: value, diferencia: value - l.cantidad_esperada };
    }));
  };

  const submitMutation = useMutation({
    mutationFn: async () => {
      const efectivoReal = efectivoEntregado !== '' ? Number(efectivoEntregado) : 0;

      const { data: descarga, error } = await supabase
        .from('descarga_ruta')
        .insert({
          empresa_id: empresa!.id,
          carga_id: cargaActiva!.id,
          vendedor_id: cargaActiva!.vendedor_id,
          user_id: user!.id,
          efectivo_esperado: efectivoEsperado,
          efectivo_entregado: efectivoReal,
          diferencia_efectivo: efectivoReal - efectivoEsperado,
          notas: notas || null,
        } as any)
        .select()
        .single();
      if (error) throw error;

      const lineItems = lineas.map(l => ({
        descarga_id: descarga.id,
        producto_id: l.producto_id,
        cantidad_esperada: l.cantidad_esperada,
        cantidad_real: l.cantidad_real,
        diferencia: l.diferencia,
        motivo: null,
        notas: null,
      }));

      const { error: lErr } = await supabase
        .from('descarga_ruta_lineas')
        .insert(lineItems as any);
      if (lErr) throw lErr;
    },
    onSuccess: () => {
      toast.success('Liquidación enviada');
      qc.invalidateQueries({ queryKey: ['mi-descarga-hoy'] });
      qc.invalidateQueries({ queryKey: ['descargas'] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  // ─── Already submitted ───
  if (existingDescarga) {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-[60vh] text-center">
        <div className="bg-green-50 rounded-full p-4 mb-4">
          <CheckCircle className="h-12 w-12 text-green-600" />
        </div>
        <h2 className="text-lg font-bold text-foreground mb-1">Liquidación del día enviada ✓</h2>
        <p className="text-sm text-muted-foreground mb-6">El administrador la revisará.</p>
        <Button variant="outline" size="sm" onClick={() => nav('/ruta')}>
          <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Volver a ruta
        </Button>
      </div>
    );
  }

  // ─── No active carga ───
  if (!cargaActiva) {
    return (
      <div className="p-4 text-center">
        <PackageCheck className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
        <p className="text-sm text-muted-foreground">No hay carga activa para liquidar</p>
        <Button variant="outline" size="sm" className="mt-4" onClick={() => nav('/ruta')}>
          <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Volver
        </Button>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4 pb-24">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => nav('/ruta')} className="p-1.5 rounded-md hover:bg-muted">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-lg font-bold text-foreground">Liquidación</h1>
          <p className="text-xs text-muted-foreground">Declara lo que traes físicamente</p>
        </div>
      </div>

      {/* Cash section — BLIND: no system amount shown */}
      <div className="bg-card border border-border rounded-lg p-4 space-y-3">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <DollarSign className="h-4 w-4" /> Efectivo entregado
        </h3>
        <p className="text-xs text-muted-foreground">¿Cuánto efectivo entregas?</p>
        <Input
          type="number"
          inputMode="decimal"
          value={efectivoEntregado}
          onChange={e => setEfectivoEntregado(e.target.value)}
          placeholder="0.00"
          className="text-lg font-semibold h-12"
        />
      </div>

      {/* Products — BLIND: only product name + input for quantity */}
      <div className="bg-card border border-border rounded-lg p-4 space-y-3">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <PackageCheck className="h-4 w-4" /> Productos devueltos
        </h3>
        <p className="text-xs text-muted-foreground">¿Cuántas unidades regresas de cada producto?</p>

        <div className="space-y-2">
          {lineas.map((l, idx) => (
            <div key={l.producto_id} className="flex items-center gap-3 bg-muted/30 rounded-lg px-3 py-2.5">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-foreground truncate">{l.producto_nombre}</div>
                <div className="text-[10px] text-muted-foreground font-mono">{l.producto_codigo}</div>
              </div>
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                value={l.cantidad_real || ''}
                onChange={e => updateCantidadReal(idx, Number(e.target.value) || 0)}
                placeholder="0"
                className="w-20 h-10 text-center text-sm font-semibold"
              />
            </div>
          ))}

          {lineas.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">Cargando productos...</p>
          )}
        </div>
      </div>

      {/* Notes */}
      <div className="bg-card border border-border rounded-lg p-4">
        <label className="text-[11px] font-medium text-muted-foreground uppercase block mb-1">Observaciones</label>
        <textarea
          value={notas}
          onChange={e => setNotas(e.target.value)}
          placeholder="Cualquier comentario sobre la liquidación..."
          className="w-full border border-input bg-background rounded-md px-3 py-2 text-sm min-h-[60px] focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      {/* Submit — neutral message */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-background border-t border-border">
        <Button
          onClick={() => submitMutation.mutate()}
          disabled={submitMutation.isPending || lineas.length === 0 || efectivoEntregado === ''}
          className="w-full h-12 text-sm font-semibold"
        >
          <Send className="h-4 w-4 mr-2" />
          Enviar liquidación
        </Button>
      </div>
    </div>
  );
}
