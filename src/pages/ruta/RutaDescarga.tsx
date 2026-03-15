import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useDescargaCalculos, DescargaLinea } from '@/hooks/useDescargaRuta';
import { PackageCheck, DollarSign, ArrowLeft, Send, CheckCircle, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

type TipoLiquidacion = 'carga' | 'solo_efectivo' | 'rango_fechas';

export default function RutaDescarga() {
  const nav = useNavigate();
  const { user, empresa } = useAuth();
  const qc = useQueryClient();

  const [tipo, setTipo] = useState<TipoLiquidacion | null>(null);
  const [fechaInicio, setFechaInicio] = useState(() => new Date().toISOString().slice(0, 10));
  const [fechaFin, setFechaFin] = useState(() => new Date().toISOString().slice(0, 10));

  // Get active carga (optional)
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

  // Check if already submitted for this carga
  const { data: existingDescarga } = useQuery({
    queryKey: ['mi-descarga-hoy', cargaActiva?.id],
    queryFn: async () => {
      if (!cargaActiva?.id) return null;
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

  // Calc data only when using carga type
  const useCarga = tipo === 'carga' && !!cargaActiva?.id;
  const { lineas: lineasBase, efectivoEsperado } = useDescargaCalculos(useCarga ? cargaActiva?.id ?? null : null);

  // For date range, get ventas in range
  const { data: ventasRango } = useQuery({
    queryKey: ['ventas-rango-liq', empresa?.id, fechaInicio, fechaFin],
    enabled: tipo === 'rango_fechas' && !!empresa?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ventas')
        .select('total, condicion_pago')
        .eq('empresa_id', empresa!.id)
        .gte('fecha', fechaInicio)
        .lte('fecha', fechaFin)
        .neq('status', 'cancelado');
      if (error) throw error;
      return data || [];
    },
  });

  const efectivoEsperadoRango = (ventasRango || [])
    .filter(v => v.condicion_pago === 'contado')
    .reduce((sum, v) => sum + (Number(v.total) || 0), 0);

  const [lineas, setLineas] = useState<DescargaLinea[]>([]);
  const [efectivoEntregado, setEfectivoEntregado] = useState('');
  const [notas, setNotas] = useState('');

  useEffect(() => {
    if (useCarga && lineasBase.length > 0 && lineas.length === 0) {
      setLineas(lineasBase.map(l => ({ ...l, cantidad_real: 0, diferencia: -l.cantidad_esperada })));
    }
  }, [lineasBase, useCarga]);

  const updateCantidadReal = (idx: number, value: number) => {
    setLineas(prev => prev.map((l, i) => {
      if (i !== idx) return l;
      return { ...l, cantidad_real: value, diferencia: value - l.cantidad_esperada };
    }));
  };

  const getEfectivoEsp = () => {
    if (tipo === 'rango_fechas') return efectivoEsperadoRango;
    if (tipo === 'carga') return efectivoEsperado;
    return 0;
  };

  const submitMutation = useMutation({
    mutationFn: async () => {
      const efectivoReal = efectivoEntregado !== '' ? Number(efectivoEntregado) : 0;
      const esp = getEfectivoEsp();

      const insertData: any = {
        empresa_id: empresa!.id,
        user_id: user!.id,
        efectivo_esperado: esp,
        efectivo_entregado: efectivoReal,
        diferencia_efectivo: efectivoReal - esp,
        notas: notas || null,
      };

      if (tipo === 'carga' && cargaActiva) {
        insertData.carga_id = cargaActiva.id;
        insertData.vendedor_id = cargaActiva.vendedor_id;
      }

      if (tipo === 'rango_fechas') {
        insertData.fecha_inicio = fechaInicio;
        insertData.fecha_fin = fechaFin;
      }

      const { data: descarga, error } = await supabase
        .from('descarga_ruta')
        .insert(insertData)
        .select()
        .single();
      if (error) throw error;

      // Only save product lines if there are any
      if (lineas.length > 0) {
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
      }
    },
    onSuccess: () => {
      toast.success('Liquidación enviada');
      qc.invalidateQueries({ queryKey: ['mi-descarga-hoy'] });
      qc.invalidateQueries({ queryKey: ['descargas'] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Already submitted for this carga
  if (tipo === 'carga' && existingDescarga) {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-[60vh] text-center">
        <div className="bg-green-50 rounded-full p-4 mb-4">
          <CheckCircle className="h-12 w-12 text-green-600" />
        </div>
        <h2 className="text-lg font-bold text-foreground mb-1">Liquidación de esta carga ya enviada ✓</h2>
        <p className="text-sm text-muted-foreground mb-6">El administrador la revisará.</p>
        <Button variant="outline" size="sm" onClick={() => setTipo(null)}>
          Hacer otra liquidación
        </Button>
      </div>
    );
  }

  // Step 0: Choose type
  if (!tipo) {
    return (
      <div className="p-4 space-y-4 pb-24">
        <div className="flex items-center gap-3">
          <button onClick={() => nav('/ruta')} className="p-1.5 rounded-md hover:bg-muted">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-lg font-bold text-foreground">Liquidación</h1>
            <p className="text-xs text-muted-foreground">¿Qué tipo de liquidación harás?</p>
          </div>
        </div>

        <div className="space-y-3">
          {cargaActiva && (
            <button
              onClick={() => setTipo('carga')}
              className="w-full bg-card border border-border rounded-lg p-4 text-left hover:border-primary/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <PackageCheck className="h-6 w-6 text-primary shrink-0" />
                <div>
                  <div className="text-sm font-semibold text-foreground">Descarga de carga</div>
                  <div className="text-xs text-muted-foreground">Liquidar efectivo + devolver productos de la carga activa</div>
                </div>
              </div>
            </button>
          )}

          <button
            onClick={() => setTipo('solo_efectivo')}
            className="w-full bg-card border border-border rounded-lg p-4 text-left hover:border-primary/50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <DollarSign className="h-6 w-6 text-primary shrink-0" />
              <div>
                <div className="text-sm font-semibold text-foreground">Solo efectivo</div>
                <div className="text-xs text-muted-foreground">Liquidar solo el efectivo del día, sin devolución de productos</div>
              </div>
            </div>
          </button>

          <button
            onClick={() => setTipo('rango_fechas')}
            className="w-full bg-card border border-border rounded-lg p-4 text-left hover:border-primary/50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <Calendar className="h-6 w-6 text-primary shrink-0" />
              <div>
                <div className="text-sm font-semibold text-foreground">Por rango de fechas</div>
                <div className="text-xs text-muted-foreground">Liquidar un periodo (semanal, varios días, etc.)</div>
              </div>
            </div>
          </button>
        </div>
      </div>
    );
  }

  const canSubmit = efectivoEntregado !== '' && !submitMutation.isPending;

  return (
    <div className="p-4 space-y-4 pb-24">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => setTipo(null)} className="p-1.5 rounded-md hover:bg-muted">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-lg font-bold text-foreground">Liquidación</h1>
          <p className="text-xs text-muted-foreground">
            {tipo === 'carga' && 'Descarga de carga — Declara lo que traes'}
            {tipo === 'solo_efectivo' && 'Solo efectivo — Declara cuánto entregas'}
            {tipo === 'rango_fechas' && 'Por periodo — Selecciona fechas'}
          </p>
        </div>
      </div>

      {/* Date range selector */}
      {tipo === 'rango_fechas' && (
        <div className="bg-card border border-border rounded-lg p-4 space-y-3">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Calendar className="h-4 w-4" /> Periodo a liquidar
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-medium text-muted-foreground uppercase block mb-1">Desde</label>
              <Input type="date" value={fechaInicio} onChange={e => setFechaInicio(e.target.value)} className="h-10" />
            </div>
            <div>
              <label className="text-[11px] font-medium text-muted-foreground uppercase block mb-1">Hasta</label>
              <Input type="date" value={fechaFin} onChange={e => setFechaFin(e.target.value)} className="h-10" />
            </div>
          </div>
        </div>
      )}

      {/* Cash section */}
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

      {/* Products — only for carga type */}
      {tipo === 'carga' && (
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
              <p className="text-xs text-muted-foreground text-center py-4">
                {cargaActiva ? 'Cargando productos...' : 'No hay carga activa'}
              </p>
            )}
          </div>
        </div>
      )}

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

      {/* Submit */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-background border-t border-border">
        <Button
          onClick={() => submitMutation.mutate()}
          disabled={!canSubmit}
          className="w-full h-12 text-sm font-semibold"
        >
          <Send className="h-4 w-4 mr-2" />
          Enviar liquidación
        </Button>
      </div>
    </div>
  );
}
