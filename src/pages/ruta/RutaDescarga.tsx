import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useDescargaCalculos, DescargaLinea } from '@/hooks/useDescargaRuta';
import { PackageCheck, AlertTriangle, DollarSign, ArrowLeft, Check, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const MOTIVOS = [
  { value: 'error_entrega', label: 'Error de entrega' },
  { value: 'merma', label: 'Merma' },
  { value: 'danado', label: 'Dañado' },
  { value: 'faltante', label: 'Faltante' },
  { value: 'sobrante', label: 'Sobrante' },
  { value: 'otro', label: 'Otro' },
];

export default function RutaDescarga() {
  const nav = useNavigate();
  const { user, empresa } = useAuth();
  const qc = useQueryClient();

  // Get active carga for user
  const { data: cargaActiva } = useQuery({
    queryKey: ['mi-carga-activa-descarga'],
    queryFn: async () => {
      const { data } = await supabase
        .from('cargas')
        .select('*')
        .eq('empresa_id', empresa!.id)
        .in('status', ['en_ruta', 'completada'])
        .order('fecha', { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: !!empresa?.id,
  });

  const { lineas: lineasBase, efectivoEsperado, ventasContado, gastosTotal } = useDescargaCalculos(cargaActiva?.id ?? null);

  const [lineas, setLineas] = useState<DescargaLinea[]>([]);
  const [efectivoEntregado, setEfectivoEntregado] = useState('');
  const [notas, setNotas] = useState('');
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  useEffect(() => {
    if (lineasBase.length > 0 && lineas.length === 0) {
      setLineas(lineasBase);
    }
  }, [lineasBase]);

  const updateLinea = (idx: number, field: keyof DescargaLinea, value: any) => {
    setLineas(prev => prev.map((l, i) => {
      if (i !== idx) return l;
      const updated = { ...l, [field]: value };
      if (field === 'cantidad_real') {
        updated.diferencia = Number(value) - updated.cantidad_esperada;
      }
      return updated;
    }));
  };

  const hayDiferencias = lineas.some(l => l.diferencia !== 0) ||
    (efectivoEntregado !== '' && Number(efectivoEntregado) !== efectivoEsperado);

  const submitMutation = useMutation({
    mutationFn: async () => {
      // Check differences have motivos
      const sinMotivo = lineas.filter(l => l.diferencia !== 0 && !l.motivo);
      if (sinMotivo.length > 0) {
        throw new Error('Todas las diferencias necesitan un motivo');
      }

      const efectivoReal = efectivoEntregado !== '' ? Number(efectivoEntregado) : efectivoEsperado;

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

      // Insert line items
      const lineItems = lineas.map(l => ({
        descarga_id: descarga.id,
        producto_id: l.producto_id,
        cantidad_esperada: l.cantidad_esperada,
        cantidad_real: l.cantidad_real,
        diferencia: l.diferencia,
        motivo: l.diferencia !== 0 ? l.motivo : null,
        notas: l.notas || null,
      }));

      const { error: lErr } = await supabase
        .from('descarga_ruta_lineas')
        .insert(lineItems as any);
      if (lErr) throw lErr;
    },
    onSuccess: () => {
      toast.success(hayDiferencias ? 'Descarga enviada para aprobación' : 'Descarga completada');
      qc.invalidateQueries({ queryKey: ['descargas'] });
      nav('/ruta');
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (!cargaActiva) {
    return (
      <div className="p-4 text-center">
        <PackageCheck className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
        <p className="text-sm text-muted-foreground">No hay carga activa para descargar</p>
        <Button variant="outline" size="sm" className="mt-4" onClick={() => nav('/ruta')}>
          <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Volver
        </Button>
      </div>
    );
  }

  const diferenciaEfectivo = efectivoEntregado !== '' ? Number(efectivoEntregado) - efectivoEsperado : 0;
  const totalDiferencias = lineas.filter(l => l.diferencia !== 0).length;

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => nav('/ruta')} className="p-1.5 rounded-md hover:bg-muted">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-lg font-bold text-foreground">Descarga de ruta</h1>
          <p className="text-xs text-muted-foreground">Fecha: {cargaActiva.fecha}</p>
        </div>
      </div>

      {/* Cash reconciliation card */}
      <div className="bg-card border border-border rounded-lg p-4 space-y-3">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <DollarSign className="h-4 w-4" /> Cuadre de efectivo
        </h3>
        <div className="grid grid-cols-2 gap-2 text-[12px]">
          <div className="bg-muted/50 rounded-md p-2">
            <div className="text-muted-foreground">Ventas contado</div>
            <div className="font-bold text-foreground">${ventasContado.toFixed(2)}</div>
          </div>
          <div className="bg-muted/50 rounded-md p-2">
            <div className="text-muted-foreground">Gastos</div>
            <div className="font-bold text-destructive">-${gastosTotal.toFixed(2)}</div>
          </div>
        </div>
        <div className="flex items-center justify-between bg-primary/5 rounded-md p-2">
          <span className="text-[12px] font-semibold text-foreground">Efectivo esperado</span>
          <span className="font-bold text-primary">${efectivoEsperado.toFixed(2)}</span>
        </div>
        <div>
          <label className="text-[11px] font-medium text-muted-foreground uppercase block mb-1">Efectivo entregado</label>
          <Input
            type="number"
            inputMode="decimal"
            value={efectivoEntregado}
            onChange={e => setEfectivoEntregado(e.target.value)}
            placeholder={efectivoEsperado.toFixed(2)}
            className="text-[14px] font-semibold"
          />
        </div>
        {diferenciaEfectivo !== 0 && (
          <div className={cn(
            "flex items-center gap-2 p-2 rounded-md text-[12px] font-semibold",
            diferenciaEfectivo > 0 ? "bg-green-50 text-green-700" : "bg-destructive/10 text-destructive"
          )}>
            <AlertTriangle className="h-3.5 w-3.5" />
            Diferencia: {diferenciaEfectivo > 0 ? '+' : ''}${diferenciaEfectivo.toFixed(2)}
          </div>
        )}
      </div>

      {/* Product reconciliation */}
      <div className="bg-card border border-border rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <PackageCheck className="h-4 w-4" /> Cuadre de producto
          </h3>
          {totalDiferencias > 0 && (
            <span className="text-[11px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-semibold">
              {totalDiferencias} diferencia{totalDiferencias > 1 ? 's' : ''}
            </span>
          )}
        </div>

        <div className="text-[9px] text-muted-foreground grid grid-cols-[1fr_50px_50px_50px] gap-1 px-1 uppercase font-semibold">
          <span>Producto</span>
          <span className="text-center">Esper.</span>
          <span className="text-center">Real</span>
          <span className="text-center">Dif.</span>
        </div>

        <div className="space-y-1">
          {lineas.map((l, idx) => (
            <div key={l.producto_id}>
              <button
                onClick={() => setExpandedIdx(expandedIdx === idx ? null : idx)}
                className={cn(
                  "w-full grid grid-cols-[1fr_50px_50px_50px] gap-1 items-center px-2 py-2 rounded-md text-[12px] transition-colors",
                  l.diferencia !== 0 ? "bg-amber-50 border border-amber-200" : "bg-muted/30 hover:bg-muted/50"
                )}
              >
                <span className="text-left truncate font-medium text-foreground">{l.producto_nombre}</span>
                <span className="text-center text-muted-foreground">{l.cantidad_esperada}</span>
                <span className={cn("text-center font-semibold", l.diferencia !== 0 ? "text-amber-700" : "text-foreground")}>
                  {l.cantidad_real}
                </span>
                <span className={cn(
                  "text-center font-bold",
                  l.diferencia > 0 ? "text-green-600" : l.diferencia < 0 ? "text-destructive" : "text-muted-foreground"
                )}>
                  {l.diferencia > 0 ? '+' : ''}{l.diferencia}
                </span>
              </button>

              {expandedIdx === idx && (
                <div className="px-3 py-3 bg-muted/20 rounded-b-md border border-t-0 border-border space-y-2">
                  <div className="grid grid-cols-3 gap-1 text-[10px] text-muted-foreground">
                    <div>Cargado: <b className="text-foreground">{l.cantidad_cargada}</b></div>
                    <div>Vendido: <b className="text-foreground">{l.cantidad_vendida}</b></div>
                    <div>Devuelto: <b className="text-foreground">{l.cantidad_devuelta}</b></div>
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground block mb-1">Cantidad real</label>
                    <Input
                      type="number"
                      inputMode="numeric"
                      value={l.cantidad_real}
                      onChange={e => updateLinea(idx, 'cantidad_real', Number(e.target.value) || 0)}
                      className="h-8 text-[13px]"
                    />
                  </div>
                  {l.diferencia !== 0 && (
                    <>
                      <div>
                        <label className="text-[10px] text-muted-foreground block mb-1">Motivo *</label>
                        <select
                          value={l.motivo || ''}
                          onChange={e => updateLinea(idx, 'motivo', e.target.value || null)}
                          className="input-odoo text-[12px] h-8 w-full"
                        >
                          <option value="">Selecciona motivo...</option>
                          {MOTIVOS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] text-muted-foreground block mb-1">Notas</label>
                        <Input
                          value={l.notas || ''}
                          onChange={e => updateLinea(idx, 'notas', e.target.value)}
                          placeholder="Ej: Entregó galleta roja en vez de amarilla"
                          className="h-8 text-[12px]"
                        />
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Notes */}
      <div className="bg-card border border-border rounded-lg p-4">
        <label className="text-[11px] font-medium text-muted-foreground uppercase block mb-1">Notas generales</label>
        <textarea
          value={notas}
          onChange={e => setNotas(e.target.value)}
          placeholder="Observaciones sobre la descarga..."
          className="input-odoo min-h-[60px] text-[13px] w-full"
        />
      </div>

      {/* Submit */}
      <Button
        onClick={() => submitMutation.mutate()}
        disabled={submitMutation.isPending || lineas.length === 0}
        className="w-full h-12 text-[14px] font-semibold"
      >
        <Check className="h-4 w-4 mr-2" />
        {hayDiferencias ? 'Enviar para aprobación' : 'Completar descarga'}
      </Button>
    </div>
  );
}
