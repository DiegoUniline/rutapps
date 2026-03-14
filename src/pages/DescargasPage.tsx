import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useDescargasListDesktop, useDescargaLineas, useDescargaCalculos, DescargaLinea } from '@/hooks/useDescargaRuta';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PackageCheck, CheckCircle2, XCircle, Clock, Eye, AlertTriangle, DollarSign, Plus, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const STATUS_MAP: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  pendiente: { label: 'Pendiente', icon: Clock, color: 'bg-amber-100 text-amber-700' },
  aprobada: { label: 'Aprobada', icon: CheckCircle2, color: 'bg-green-100 text-green-700' },
  rechazada: { label: 'Rechazada', icon: XCircle, color: 'bg-destructive/10 text-destructive' },
};

const MOTIVO_LABELS: Record<string, string> = {
  error_entrega: 'Error de entrega',
  merma: 'Merma',
  danado: 'Dañado',
  faltante: 'Faltante',
  sobrante: 'Sobrante',
  otro: 'Otro',
};

const MOTIVOS = [
  { value: 'error_entrega', label: 'Error de entrega' },
  { value: 'merma', label: 'Merma' },
  { value: 'danado', label: 'Dañado' },
  { value: 'faltante', label: 'Faltante' },
  { value: 'sobrante', label: 'Sobrante' },
  { value: 'otro', label: 'Otro' },
];

/* ─── Detail / Approve modal ─── */

function DescargaDetalle({ descarga, onClose }: { descarga: any; onClose: () => void }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: lineas } = useDescargaLineas(descarga.id);
  const [notasSupervisor, setNotasSupervisor] = useState('');

  const conDiferencias = (lineas || []).filter((l: any) => Number(l.diferencia) !== 0);
  const isPendiente = descarga.status === 'pendiente';

  const aprobarMutation = useMutation({
    mutationFn: async (accion: 'aprobada' | 'rechazada') => {
      const { error } = await supabase
        .from('descarga_ruta')
        .update({
          status: accion,
          aprobado_por: user!.id,
          fecha_aprobacion: new Date().toISOString(),
          notas_supervisor: notasSupervisor || null,
        } as any)
        .eq('id', descarga.id);
      if (error) throw error;
    },
    onSuccess: (_, accion) => {
      toast.success(accion === 'aprobada' ? 'Descarga aprobada' : 'Descarga rechazada');
      qc.invalidateQueries({ queryKey: ['descargas-list'] });
      onClose();
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-lg max-w-2xl w-full max-h-[85vh] overflow-auto">
        <div className="p-5 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-foreground flex items-center gap-2">
              <PackageCheck className="h-5 w-5" /> Descarga de ruta
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {(descarga as any).vendedores?.nombre ?? 'Vendedor'} — {descarga.fecha}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {(() => {
              const s = STATUS_MAP[descarga.status] || STATUS_MAP.pendiente;
              return (
                <span className={cn("inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold", s.color)}>
                  <s.icon className="h-3 w-3" /> {s.label}
                </span>
              );
            })()}
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-lg px-2">✕</button>
          </div>
        </div>

        {/* Cash */}
        <div className="p-5 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <DollarSign className="h-4 w-4" /> Cuadre de efectivo
          </h3>
          <div className="grid grid-cols-3 gap-3 text-[12px]">
            <div className="bg-muted/50 rounded-md p-3 text-center">
              <div className="text-muted-foreground">Esperado</div>
              <div className="font-bold text-foreground text-[14px]">${Number(descarga.efectivo_esperado).toFixed(2)}</div>
            </div>
            <div className="bg-muted/50 rounded-md p-3 text-center">
              <div className="text-muted-foreground">Entregado</div>
              <div className="font-bold text-foreground text-[14px]">${Number(descarga.efectivo_entregado).toFixed(2)}</div>
            </div>
            <div className={cn(
              "rounded-md p-3 text-center",
              Number(descarga.diferencia_efectivo) !== 0
                ? Number(descarga.diferencia_efectivo) > 0 ? "bg-green-50" : "bg-destructive/10"
                : "bg-muted/50"
            )}>
              <div className="text-muted-foreground">Diferencia</div>
              <div className={cn(
                "font-bold text-[14px]",
                Number(descarga.diferencia_efectivo) > 0 ? "text-green-600" : Number(descarga.diferencia_efectivo) < 0 ? "text-destructive" : "text-foreground"
              )}>
                {Number(descarga.diferencia_efectivo) > 0 ? '+' : ''}${Number(descarga.diferencia_efectivo).toFixed(2)}
              </div>
            </div>
          </div>
        </div>

        {/* Product lines */}
        <div className="p-5 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <PackageCheck className="h-4 w-4" /> Cuadre de productos
            {conDiferencias.length > 0 && (
              <span className="text-[11px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-semibold">
                {conDiferencias.length} diferencia{conDiferencias.length > 1 ? 's' : ''}
              </span>
            )}
          </h3>
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-[10px] text-muted-foreground uppercase border-b border-border">
                <th className="text-left py-2 px-1">Producto</th>
                <th className="text-center py-2 px-1">Esperado</th>
                <th className="text-center py-2 px-1">Real</th>
                <th className="text-center py-2 px-1">Dif.</th>
                <th className="text-left py-2 px-1">Motivo</th>
                <th className="text-left py-2 px-1">Notas</th>
              </tr>
            </thead>
            <tbody>
              {(lineas || []).map((l: any) => (
                <tr key={l.id} className={cn("border-b border-border/50", Number(l.diferencia) !== 0 && "bg-amber-50/50")}>
                  <td className="py-2 px-1 font-medium text-foreground">
                    <div>{(l as any).productos?.nombre}</div>
                    <div className="text-[10px] text-muted-foreground font-mono">{(l as any).productos?.codigo}</div>
                  </td>
                  <td className="py-2 px-1 text-center">{Number(l.cantidad_esperada)}</td>
                  <td className="py-2 px-1 text-center font-semibold">{Number(l.cantidad_real)}</td>
                  <td className={cn(
                    "py-2 px-1 text-center font-bold",
                    Number(l.diferencia) > 0 ? "text-green-600" : Number(l.diferencia) < 0 ? "text-destructive" : ""
                  )}>
                    {Number(l.diferencia) > 0 ? '+' : ''}{Number(l.diferencia)}
                  </td>
                  <td className="py-2 px-1 text-muted-foreground">{l.motivo ? MOTIVO_LABELS[l.motivo] || l.motivo : '—'}</td>
                  <td className="py-2 px-1 text-muted-foreground max-w-[120px] truncate">{l.notas || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {descarga.notas && (
          <div className="px-5 py-3 border-b border-border">
            <div className="text-[11px] text-muted-foreground uppercase font-semibold mb-1">Notas del vendedor</div>
            <p className="text-[13px] text-foreground">{descarga.notas}</p>
          </div>
        )}

        {isPendiente && (
          <div className="p-5 space-y-3">
            <div>
              <label className="text-[11px] font-medium text-muted-foreground uppercase block mb-1">Notas del supervisor</label>
              <textarea
                value={notasSupervisor}
                onChange={e => setNotasSupervisor(e.target.value)}
                placeholder="Observaciones..."
                className="input-odoo min-h-[60px] text-[13px] w-full"
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={() => aprobarMutation.mutate('aprobada')} disabled={aprobarMutation.isPending} className="flex-1">
                <CheckCircle2 className="h-4 w-4 mr-1" /> Aprobar
              </Button>
              <Button variant="outline" onClick={() => aprobarMutation.mutate('rechazada')} disabled={aprobarMutation.isPending}
                className="flex-1 border-destructive text-destructive hover:bg-destructive/10">
                <XCircle className="h-4 w-4 mr-1" /> Rechazar
              </Button>
            </div>
          </div>
        )}

        {descarga.notas_supervisor && !isPendiente && (
          <div className="px-5 py-3">
            <div className="text-[11px] text-muted-foreground uppercase font-semibold mb-1">Notas del supervisor</div>
            <p className="text-[13px] text-foreground">{descarga.notas_supervisor}</p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── New Descarga Form (Desktop) ─── */

function NuevaDescargaForm({ onClose }: { onClose: () => void }) {
  const { user, empresa } = useAuth();
  const qc = useQueryClient();
  const [selectedCargaId, setSelectedCargaId] = useState<string | null>(null);
  const [lineas, setLineas] = useState<DescargaLinea[]>([]);
  const [efectivoEntregado, setEfectivoEntregado] = useState('');
  const [notas, setNotas] = useState('');

  // Fetch cargas en_ruta / completada
  const { data: cargas } = useQuery({
    queryKey: ['cargas-para-descarga', empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cargas')
        .select('*, vendedores(nombre)')
        .eq('empresa_id', empresa!.id)
        .in('status', ['en_ruta', 'completada'])
        .order('fecha', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { lineas: lineasBase, efectivoEsperado, ventasContado, gastosTotal } = useDescargaCalculos(selectedCargaId);

  useEffect(() => {
    if (lineasBase.length > 0) {
      setLineas(lineasBase);
    } else {
      setLineas([]);
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

  const selectedCarga = cargas?.find((c: any) => c.id === selectedCargaId);

  const submitMutation = useMutation({
    mutationFn: async () => {
      const sinMotivo = lineas.filter(l => l.diferencia !== 0 && !l.motivo);
      if (sinMotivo.length > 0) throw new Error('Todas las diferencias necesitan un motivo');

      const efectivoReal = efectivoEntregado !== '' ? Number(efectivoEntregado) : efectivoEsperado;

      const { data: descarga, error } = await supabase
        .from('descarga_ruta')
        .insert({
          empresa_id: empresa!.id,
          carga_id: selectedCargaId!,
          vendedor_id: (selectedCarga as any)?.vendedor_id ?? null,
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
        motivo: l.diferencia !== 0 ? l.motivo : null,
        notas: l.notas || null,
      }));

      const { error: lErr } = await supabase.from('descarga_ruta_lineas').insert(lineItems as any);
      if (lErr) throw lErr;
    },
    onSuccess: () => {
      toast.success(hayDiferencias ? 'Descarga enviada para aprobación' : 'Descarga completada');
      qc.invalidateQueries({ queryKey: ['descargas-list'] });
      onClose();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const diferenciaEfectivo = efectivoEntregado !== '' ? Number(efectivoEntregado) - efectivoEsperado : 0;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onClose}><ArrowLeft className="h-4 w-4" /></Button>
        <h2 className="text-lg font-bold text-foreground">Nueva descarga de ruta</h2>
      </div>

      {/* Step 1: Select carga */}
      <div className="bg-card border border-border rounded-lg p-5">
        <h3 className="text-sm font-semibold text-foreground mb-3">1. Selecciona la carga</h3>
        {!cargas || cargas.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay cargas activas (en ruta o completadas)</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {cargas.map((c: any) => (
              <button
                key={c.id}
                onClick={() => { setSelectedCargaId(c.id); setLineas([]); setEfectivoEntregado(''); }}
                className={cn(
                  "border rounded-lg p-3 text-left transition-colors",
                  selectedCargaId === c.id
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50"
                )}
              >
                <div className="text-[13px] font-semibold text-foreground">{(c as any).vendedores?.nombre ?? 'Sin vendedor'}</div>
                <div className="text-[11px] text-muted-foreground">Fecha: {c.fecha} — {c.status}</div>
              </button>
            ))}
          </div>
        )}
      </div>

      {selectedCargaId && lineas.length > 0 && (
        <>
          {/* Cash reconciliation */}
          <div className="bg-card border border-border rounded-lg p-5 space-y-3">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <DollarSign className="h-4 w-4" /> 2. Cuadre de efectivo
            </h3>
            <div className="grid grid-cols-3 gap-3 text-[12px]">
              <div className="bg-muted/50 rounded-md p-3 text-center">
                <div className="text-muted-foreground">Ventas contado</div>
                <div className="font-bold text-foreground">${ventasContado.toFixed(2)}</div>
              </div>
              <div className="bg-muted/50 rounded-md p-3 text-center">
                <div className="text-muted-foreground">Gastos</div>
                <div className="font-bold text-destructive">-${gastosTotal.toFixed(2)}</div>
              </div>
              <div className="bg-primary/5 rounded-md p-3 text-center">
                <div className="text-muted-foreground">Esperado</div>
                <div className="font-bold text-primary">${efectivoEsperado.toFixed(2)}</div>
              </div>
            </div>
            <div className="max-w-xs">
              <label className="text-[11px] font-medium text-muted-foreground uppercase block mb-1">Efectivo entregado</label>
              <Input
                type="number"
                value={efectivoEntregado}
                onChange={e => setEfectivoEntregado(e.target.value)}
                placeholder={efectivoEsperado.toFixed(2)}
              />
            </div>
            {diferenciaEfectivo !== 0 && (
              <div className={cn(
                "flex items-center gap-2 p-2 rounded-md text-[12px] font-semibold max-w-xs",
                diferenciaEfectivo > 0 ? "bg-green-50 text-green-700" : "bg-destructive/10 text-destructive"
              )}>
                <AlertTriangle className="h-3.5 w-3.5" />
                Diferencia: {diferenciaEfectivo > 0 ? '+' : ''}${diferenciaEfectivo.toFixed(2)}
              </div>
            )}
          </div>

          {/* Product reconciliation */}
          <div className="bg-card border border-border rounded-lg p-5">
            <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <PackageCheck className="h-4 w-4" /> 3. Cuadre de productos
            </h3>
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-[10px] text-muted-foreground uppercase border-b border-border">
                  <th className="text-left py-2 px-2">Producto</th>
                  <th className="text-center py-2 px-1 w-16">Cargado</th>
                  <th className="text-center py-2 px-1 w-16">Vendido</th>
                  <th className="text-center py-2 px-1 w-16">Devuelto</th>
                  <th className="text-center py-2 px-1 w-16">Esperado</th>
                  <th className="text-center py-2 px-1 w-20">Real</th>
                  <th className="text-center py-2 px-1 w-14">Dif.</th>
                  <th className="text-left py-2 px-1 w-32">Motivo</th>
                  <th className="text-left py-2 px-1">Notas</th>
                </tr>
              </thead>
              <tbody>
                {lineas.map((l, idx) => (
                  <tr key={l.producto_id} className={cn("border-b border-border/50", l.diferencia !== 0 && "bg-amber-50/50")}>
                    <td className="py-2 px-2">
                      <div className="font-medium text-foreground">{l.producto_nombre}</div>
                      <div className="text-[10px] text-muted-foreground font-mono">{l.producto_codigo}</div>
                    </td>
                    <td className="py-2 px-1 text-center text-muted-foreground">{l.cantidad_cargada}</td>
                    <td className="py-2 px-1 text-center text-muted-foreground">{l.cantidad_vendida}</td>
                    <td className="py-2 px-1 text-center text-muted-foreground">{l.cantidad_devuelta}</td>
                    <td className="py-2 px-1 text-center font-semibold">{l.cantidad_esperada}</td>
                    <td className="py-2 px-1">
                      <Input
                        type="number"
                        value={l.cantidad_real}
                        onChange={e => updateLinea(idx, 'cantidad_real', Number(e.target.value) || 0)}
                        className="h-7 text-[12px] text-center w-16 mx-auto"
                      />
                    </td>
                    <td className={cn(
                      "py-2 px-1 text-center font-bold",
                      l.diferencia > 0 ? "text-green-600" : l.diferencia < 0 ? "text-destructive" : ""
                    )}>
                      {l.diferencia > 0 ? '+' : ''}{l.diferencia}
                    </td>
                    <td className="py-2 px-1">
                      {l.diferencia !== 0 ? (
                        <select
                          value={l.motivo || ''}
                          onChange={e => updateLinea(idx, 'motivo', e.target.value || null)}
                          className="input-odoo text-[11px] h-7 w-full"
                        >
                          <option value="">Motivo...</option>
                          {MOTIVOS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                        </select>
                      ) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="py-2 px-1">
                      {l.diferencia !== 0 ? (
                        <Input
                          value={l.notas || ''}
                          onChange={e => updateLinea(idx, 'notas', e.target.value)}
                          placeholder="Detalle..."
                          className="h-7 text-[11px]"
                        />
                      ) : <span className="text-muted-foreground">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Notes & submit */}
          <div className="bg-card border border-border rounded-lg p-5">
            <label className="text-[11px] font-medium text-muted-foreground uppercase block mb-1">Notas generales</label>
            <textarea
              value={notas}
              onChange={e => setNotas(e.target.value)}
              placeholder="Observaciones sobre la descarga..."
              className="input-odoo min-h-[60px] text-[13px] w-full"
            />
          </div>

          <Button
            onClick={() => submitMutation.mutate()}
            disabled={submitMutation.isPending}
            className="w-full sm:w-auto"
          >
            <PackageCheck className="h-4 w-4 mr-2" />
            {hayDiferencias ? 'Enviar para aprobación' : 'Completar descarga'}
          </Button>
        </>
      )}
    </div>
  );
}

/* ─── Main Page ─── */

export default function DescargasPage() {
  const { data: descargas, isLoading } = useDescargasListDesktop();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [showNew, setShowNew] = useState(false);

  const filtered = (descargas || []).filter((d: any) =>
    filterStatus === 'all' || d.status === filterStatus
  );

  const selectedDescarga = descargas?.find((d: any) => d.id === selectedId);

  if (showNew) {
    return (
      <div className="p-4">
        <NuevaDescargaForm onClose={() => setShowNew(false)} />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
          <PackageCheck className="h-5 w-5" /> Descargas de ruta
        </h1>
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            {['all', 'pendiente', 'aprobada', 'rechazada'].map(s => (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                className={cn(
                  "px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors",
                  filterStatus === s ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
                )}
              >
                {s === 'all' ? 'Todas' : STATUS_MAP[s]?.label || s}
              </button>
            ))}
          </div>
          <Button size="sm" onClick={() => setShowNew(true)}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Nueva descarga
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Cargando...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12">
          <PackageCheck className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground">No hay descargas</p>
          <Button size="sm" variant="outline" className="mt-3" onClick={() => setShowNew(true)}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Crear primera descarga
          </Button>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="bg-muted/50 text-[11px] text-muted-foreground uppercase border-b border-border">
                <th className="text-left py-2.5 px-4">Fecha</th>
                <th className="text-left py-2.5 px-4">Vendedor</th>
                <th className="text-right py-2.5 px-4">Efectivo esperado</th>
                <th className="text-right py-2.5 px-4">Entregado</th>
                <th className="text-right py-2.5 px-4">Diferencia</th>
                <th className="text-center py-2.5 px-4">Status</th>
                <th className="text-center py-2.5 px-4"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((d: any) => {
                const s = STATUS_MAP[d.status] || STATUS_MAP.pendiente;
                const dif = Number(d.diferencia_efectivo);
                return (
                  <tr key={d.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                    <td className="py-2.5 px-4">{d.fecha}</td>
                    <td className="py-2.5 px-4 font-medium">{(d as any).vendedores?.nombre ?? '—'}</td>
                    <td className="py-2.5 px-4 text-right">${Number(d.efectivo_esperado).toFixed(2)}</td>
                    <td className="py-2.5 px-4 text-right font-semibold">${Number(d.efectivo_entregado).toFixed(2)}</td>
                    <td className={cn(
                      "py-2.5 px-4 text-right font-bold",
                      dif > 0 ? "text-green-600" : dif < 0 ? "text-destructive" : ""
                    )}>
                      {dif > 0 ? '+' : ''}${dif.toFixed(2)}
                    </td>
                    <td className="py-2.5 px-4 text-center">
                      <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold", s.color)}>
                        <s.icon className="h-3 w-3" /> {s.label}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-center">
                      <Button variant="ghost" size="sm" onClick={() => setSelectedId(d.id)}>
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {selectedDescarga && (
        <DescargaDetalle descarga={selectedDescarga} onClose={() => setSelectedId(null)} />
      )}
    </div>
  );
}
