import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { fmtMoney } from '@/lib/currency';
import {
  Calculator, Receipt, ArrowDownCircle, ArrowUpCircle, Banknote, ShoppingCart,
  Clock, CheckCircle2, ClipboardList, Eye, Wallet, CreditCard, Smartphone, MoreHorizontal,
} from 'lucide-react';

interface Empresa { id: string; nombre: string }

export default function AdminPosTab() {
  const [empresaId, setEmpresaId] = useState<string>('');
  const [openTurno, setOpenTurno] = useState<string | null>(null);

  const empresasQuery = useQuery({
    queryKey: ['admin-pos-empresas'],
    queryFn: async (): Promise<Empresa[]> => {
      const { data } = await supabase.from('empresas').select('id, nombre').order('nombre');
      return (data ?? []) as Empresa[];
    },
  });

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex items-center gap-3 flex-wrap">
          <Calculator className="h-5 w-5 text-primary" />
          <div className="flex-1 min-w-[220px]">
            <h3 className="text-sm font-bold">Punto de Venta — Vista Maestra</h3>
            <p className="text-xs text-muted-foreground">Turnos, cortes, depósitos, retiros, gastos y ventas POS por empresa.</p>
          </div>
          <Select value={empresaId} onValueChange={setEmpresaId}>
            <SelectTrigger className="w-72"><SelectValue placeholder="Selecciona una empresa" /></SelectTrigger>
            <SelectContent>
              {(empresasQuery.data ?? []).map(e => (
                <SelectItem key={e.id} value={e.id}>{e.nombre}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Card>

      {empresaId ? (
        <>
          <KpisRow empresaId={empresaId} />
          <Tabs defaultValue="turnos">
            <TabsList className="flex-wrap h-auto">
              <TabsTrigger value="turnos" className="gap-1.5"><Clock className="h-4 w-4" /> Turnos</TabsTrigger>
              <TabsTrigger value="cortes" className="gap-1.5"><ClipboardList className="h-4 w-4" /> Cortes / Arqueos</TabsTrigger>
              <TabsTrigger value="depositos" className="gap-1.5"><ArrowDownCircle className="h-4 w-4" /> Depósitos</TabsTrigger>
              <TabsTrigger value="retiros" className="gap-1.5"><ArrowUpCircle className="h-4 w-4" /> Retiros</TabsTrigger>
              <TabsTrigger value="gastos" className="gap-1.5"><Receipt className="h-4 w-4" /> Gastos</TabsTrigger>
              <TabsTrigger value="ventas" className="gap-1.5"><ShoppingCart className="h-4 w-4" /> Ventas POS</TabsTrigger>
            </TabsList>
            <TabsContent value="turnos" className="mt-4"><TurnosPanel empresaId={empresaId} onView={setOpenTurno} /></TabsContent>
            <TabsContent value="cortes" className="mt-4"><CortesPanel empresaId={empresaId} onView={setOpenTurno} /></TabsContent>
            <TabsContent value="depositos" className="mt-4"><MovimientosPanel empresaId={empresaId} tipo="deposito" /></TabsContent>
            <TabsContent value="retiros" className="mt-4"><MovimientosPanel empresaId={empresaId} tipo="retiro" /></TabsContent>
            <TabsContent value="gastos" className="mt-4"><MovimientosPanel empresaId={empresaId} tipo="gasto" /></TabsContent>
            <TabsContent value="ventas" className="mt-4"><VentasPosPanel empresaId={empresaId} /></TabsContent>
          </Tabs>
          <TurnoDetalleModal turnoId={openTurno} onClose={() => setOpenTurno(null)} />
        </>
      ) : (
        <Card className="p-8 text-center text-sm text-muted-foreground">Selecciona una empresa para ver su actividad POS.</Card>
      )}
    </div>
  );
}

function KpisRow({ empresaId }: { empresaId: string }) {
  const q = useQuery({
    queryKey: ['admin-pos-kpis', empresaId],
    queryFn: async () => {
      const [turnos, movs, ventas] = await Promise.all([
        supabase.from('caja_turnos').select('id, status, diferencia').eq('empresa_id', empresaId),
        supabase.from('caja_movimientos').select('tipo, monto').eq('empresa_id', empresaId),
        supabase.from('ventas').select('total').eq('empresa_id', empresaId).eq('origen', 'pos').neq('status', 'cancelado'),
      ]);
      const abiertos = (turnos.data ?? []).filter((t: any) => t.status === 'abierto').length;
      const cerrados = (turnos.data ?? []).filter((t: any) => t.status === 'cerrado').length;
      const totalDif = (turnos.data ?? []).reduce((s: number, t: any) => s + (Number(t.diferencia) || 0), 0);
      const m = (movs.data ?? []).reduce((acc: any, r: any) => {
        const v = Number(r.monto) || 0;
        if (r.tipo === 'deposito') acc.dep += v;
        else if (r.tipo === 'retiro') acc.ret += v;
        else if (r.tipo === 'gasto') acc.gas += v;
        return acc;
      }, { dep: 0, ret: 0, gas: 0 });
      const totalVentas = (ventas.data ?? []).reduce((s: number, r: any) => s + (Number(r.total) || 0), 0);
      return { abiertos, cerrados, totalDif, ...m, totalVentas, nVentas: ventas.data?.length ?? 0 };
    },
  });
  const d = q.data;
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
      <Kpi icon={<Clock className="h-3.5 w-3.5" />} label="Abiertos" value={d?.abiertos ?? 0} tone="success" raw />
      <Kpi icon={<CheckCircle2 className="h-3.5 w-3.5" />} label="Cerrados" value={d?.cerrados ?? 0} tone="primary" raw />
      <Kpi icon={<ShoppingCart className="h-3.5 w-3.5" />} label={`Ventas POS (${d?.nVentas ?? 0})`} value={d?.totalVentas ?? 0} tone="primary" />
      <Kpi icon={<ArrowDownCircle className="h-3.5 w-3.5" />} label="Depósitos" value={d?.dep ?? 0} tone="success" />
      <Kpi icon={<ArrowUpCircle className="h-3.5 w-3.5" />} label="Retiros" value={d?.ret ?? 0} tone="warning" />
      <Kpi icon={<Receipt className="h-3.5 w-3.5" />} label="Gastos" value={d?.gas ?? 0} tone="destructive" />
      <Kpi icon={<Banknote className="h-3.5 w-3.5" />} label="Diferencia total" value={d?.totalDif ?? 0} tone={Number(d?.totalDif ?? 0) === 0 ? 'primary' : 'destructive'} />
    </div>
  );
}

function Kpi({ icon, label, value, tone, raw }: { icon: React.ReactNode; label: string; value: number; tone: 'primary'|'success'|'warning'|'destructive'; raw?: boolean }) {
  const cls = {
    primary: 'bg-primary/10 text-primary border-primary/30',
    success: 'bg-success/10 text-success border-success/30',
    warning: 'bg-warning/10 text-warning border-warning/30',
    destructive: 'bg-destructive/10 text-destructive border-destructive/30',
  }[tone];
  return (
    <div className={`rounded-lg border p-2.5 ${cls}`}>
      <div className="flex items-center gap-1 text-[11px] font-semibold opacity-90">{icon}{label}</div>
      <div className="text-base font-bold tabular-nums mt-0.5">{raw ? value : fmtMoney(value)}</div>
    </div>
  );
}

async function fetchTurnos(empresaId: string, soloCerrados = false) {
  let qb = supabase
    .from('caja_turnos')
    .select('*')
    .eq('empresa_id', empresaId)
    .order('abierto_at', { ascending: false })
    .limit(200);
  if (soloCerrados) qb = qb.eq('status', 'cerrado');
  const { data: turnos } = await qb;
  const cajeroIds = Array.from(new Set((turnos ?? []).map((t: any) => t.cajero_id).filter(Boolean)));
  const { data: profiles } = cajeroIds.length
    ? await supabase.from('profiles').select('user_id, nombre').in('user_id', cajeroIds)
    : { data: [] as any[] };
  const nameMap = new Map((profiles ?? []).map((p: any) => [p.user_id, p.nombre]));
  return (turnos ?? []).map((t: any) => ({ ...t, cajero_nombre: nameMap.get(t.cajero_id) ?? '—' }));
}

function TurnosPanel({ empresaId, onView }: { empresaId: string; onView: (id: string) => void }) {
  const q = useQuery({ queryKey: ['admin-pos-turnos', empresaId], queryFn: () => fetchTurnos(empresaId) });
  const turnos = q.data ?? [];
  if (q.isLoading) return <Card className="p-6 text-center text-sm text-muted-foreground">Cargando...</Card>;
  if (!turnos.length) return <Card className="p-6 text-center text-sm text-muted-foreground">Sin turnos registrados.</Card>;

  return (
    <Card className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-xs">
          <tr>
            <th className="text-left px-3 py-2">Caja</th>
            <th className="text-left px-3 py-2">Cajero</th>
            <th className="text-left px-3 py-2">Apertura</th>
            <th className="text-left px-3 py-2">Cierre</th>
            <th className="text-right px-3 py-2">Fondo</th>
            <th className="text-right px-3 py-2">Esperado</th>
            <th className="text-right px-3 py-2">Diferencia</th>
            <th className="text-center px-3 py-2">Estado</th>
            <th className="text-center px-3 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {turnos.map((t: any) => (
            <tr key={t.id} className="border-t border-border/50 hover:bg-muted/30">
              <td className="px-3 py-2 font-medium">{t.caja_nombre}</td>
              <td className="px-3 py-2">{t.cajero_nombre}</td>
              <td className="px-3 py-2 text-xs tabular-nums">{fmtDate(t.abierto_at)}</td>
              <td className="px-3 py-2 text-xs tabular-nums">{t.cerrado_at ? fmtDate(t.cerrado_at) : '—'}</td>
              <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(t.fondo_inicial)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{t.total_efectivo_esperado != null ? fmtMoney(t.total_efectivo_esperado) : '—'}</td>
              <td className={`px-3 py-2 text-right tabular-nums font-semibold ${t.diferencia == null ? '' : Number(t.diferencia) === 0 ? 'text-success' : Number(t.diferencia) < 0 ? 'text-destructive' : 'text-warning'}`}>
                {t.diferencia != null ? fmtMoney(t.diferencia) : '—'}
              </td>
              <td className="px-3 py-2 text-center">
                {t.status === 'abierto'
                  ? <Badge variant="outline" className="bg-success/10 text-success border-success/30 gap-1"><Clock className="h-3 w-3" /> Abierto</Badge>
                  : <Badge variant="outline" className="gap-1"><CheckCircle2 className="h-3 w-3" /> Cerrado</Badge>}
              </td>
              <td className="px-3 py-2 text-center">
                <Button size="sm" variant="ghost" onClick={() => onView(t.id)} className="h-7 px-2"><Eye className="h-3.5 w-3.5" /></Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function CortesPanel({ empresaId, onView }: { empresaId: string; onView: (id: string) => void }) {
  const q = useQuery({ queryKey: ['admin-pos-cortes', empresaId], queryFn: () => fetchTurnos(empresaId, true) });
  const turnos = q.data ?? [];
  if (q.isLoading) return <Card className="p-6 text-center text-sm text-muted-foreground">Cargando...</Card>;
  if (!turnos.length) return <Card className="p-6 text-center text-sm text-muted-foreground">Aún no hay cortes (turnos cerrados).</Card>;

  return (
    <Card className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-xs">
          <tr>
            <th className="text-left px-3 py-2">Caja</th>
            <th className="text-left px-3 py-2">Cajero</th>
            <th className="text-left px-3 py-2">Cierre</th>
            <th className="text-right px-3 py-2">Efectivo esp.</th>
            <th className="text-right px-3 py-2">Efectivo contado</th>
            <th className="text-right px-3 py-2">Tarjeta</th>
            <th className="text-right px-3 py-2">Transferencia</th>
            <th className="text-right px-3 py-2">Otros</th>
            <th className="text-right px-3 py-2">Diferencia</th>
            <th className="text-center px-3 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {turnos.map((t: any) => (
            <tr key={t.id} className="border-t border-border/50 hover:bg-muted/30">
              <td className="px-3 py-2 font-medium">{t.caja_nombre}</td>
              <td className="px-3 py-2">{t.cajero_nombre}</td>
              <td className="px-3 py-2 text-xs tabular-nums">{fmtDate(t.cerrado_at)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(t.total_efectivo_esperado ?? 0)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(t.total_efectivo_contado ?? 0)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(t.total_tarjeta_contado ?? 0)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(t.total_transferencia_contado ?? 0)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(t.total_otros_contado ?? 0)}</td>
              <td className={`px-3 py-2 text-right tabular-nums font-semibold ${Number(t.diferencia ?? 0) === 0 ? 'text-success' : Number(t.diferencia) < 0 ? 'text-destructive' : 'text-warning'}`}>
                {fmtMoney(t.diferencia ?? 0)}
              </td>
              <td className="px-3 py-2 text-center">
                <Button size="sm" variant="ghost" onClick={() => onView(t.id)} className="h-7 px-2"><Eye className="h-3.5 w-3.5" /></Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function MovimientosPanel({ empresaId, tipo }: { empresaId: string; tipo: 'deposito' | 'retiro' | 'gasto' }) {
  const q = useQuery({
    queryKey: ['admin-pos-movs', empresaId, tipo],
    queryFn: async () => {
      const { data } = await supabase
        .from('caja_movimientos')
        .select('id, tipo, monto, motivo, created_at, turno_id, user_id, caja_turnos(caja_nombre)')
        .eq('empresa_id', empresaId)
        .eq('tipo', tipo)
        .order('created_at', { ascending: false })
        .limit(300);
      const userIds = Array.from(new Set((data ?? []).map((r: any) => r.user_id).filter(Boolean)));
      const { data: profiles } = userIds.length
        ? await supabase.from('profiles').select('user_id, nombre').in('user_id', userIds)
        : { data: [] as any[] };
      const nameMap = new Map((profiles ?? []).map((p: any) => [p.user_id, p.nombre]));
      return (data ?? []).map((r: any) => ({ ...r, user_nombre: nameMap.get(r.user_id) ?? '—' }));
    },
  });

  const rows = (q.data ?? []) as any[];
  if (q.isLoading) return <Card className="p-6 text-center text-sm text-muted-foreground">Cargando...</Card>;
  const total = rows.reduce((s, r) => s + (Number(r.monto) || 0), 0);
  const tone = tipo === 'deposito' ? 'success' : tipo === 'retiro' ? 'warning' : 'destructive';
  const icon = tipo === 'deposito' ? <ArrowDownCircle className="h-4 w-4" /> : tipo === 'retiro' ? <ArrowUpCircle className="h-4 w-4" /> : <Receipt className="h-4 w-4" />;
  const labelTipo = tipo === 'deposito' ? 'Depósitos' : tipo === 'retiro' ? 'Retiros' : 'Gastos';

  return (
    <div className="space-y-3">
      <SumCard icon={icon} label={`Total ${labelTipo} (${rows.length})`} value={total} tone={tone} />
      {!rows.length ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">Sin {labelTipo.toLowerCase()} registrados.</Card>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs">
              <tr>
                <th className="text-left px-3 py-2">Fecha</th>
                <th className="text-left px-3 py-2">Caja</th>
                <th className="text-left px-3 py-2">Usuario</th>
                <th className="text-left px-3 py-2">Motivo</th>
                <th className="text-right px-3 py-2">Monto</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} className="border-t border-border/50 hover:bg-muted/30">
                  <td className="px-3 py-2 text-xs tabular-nums">{fmtDate(r.created_at)}</td>
                  <td className="px-3 py-2">{r.caja_turnos?.caja_nombre ?? '—'}</td>
                  <td className="px-3 py-2">{r.user_nombre}</td>
                  <td className="px-3 py-2 text-muted-foreground">{r.motivo || '—'}</td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">{fmtMoney(r.monto)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

function VentasPosPanel({ empresaId }: { empresaId: string }) {
  const q = useQuery({
    queryKey: ['admin-pos-ventas', empresaId],
    queryFn: async () => {
      const { data } = await supabase
        .from('ventas')
        .select('id, folio, fecha, total, status, condicion_pago, turno_id, cliente:clientes(nombre), caja_turnos(caja_nombre)')
        .eq('empresa_id', empresaId)
        .eq('origen', 'pos')
        .order('fecha', { ascending: false })
        .limit(300);
      return data ?? [];
    },
  });

  const rows = (q.data ?? []) as any[];
  if (q.isLoading) return <Card className="p-6 text-center text-sm text-muted-foreground">Cargando...</Card>;
  if (!rows.length) return <Card className="p-6 text-center text-sm text-muted-foreground">Sin ventas POS registradas.</Card>;

  const total = rows.reduce((s, r) => s + (Number(r.total) || 0), 0);

  return (
    <div className="space-y-3">
      <SumCard icon={<ShoppingCart className="h-4 w-4" />} label={`Total ventas POS (${rows.length})`} value={total} tone="primary" />
      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs">
            <tr>
              <th className="text-left px-3 py-2">Folio</th>
              <th className="text-left px-3 py-2">Fecha</th>
              <th className="text-left px-3 py-2">Cliente</th>
              <th className="text-left px-3 py-2">Caja</th>
              <th className="text-left px-3 py-2">Pago</th>
              <th className="text-left px-3 py-2">Estado</th>
              <th className="text-right px-3 py-2">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} className="border-t border-border/50 hover:bg-muted/30">
                <td className="px-3 py-2 font-mono text-xs">{r.folio}</td>
                <td className="px-3 py-2 text-xs tabular-nums">{r.fecha}</td>
                <td className="px-3 py-2">{r.cliente?.nombre ?? '—'}</td>
                <td className="px-3 py-2 text-xs">{r.caja_turnos?.caja_nombre ?? '—'}</td>
                <td className="px-3 py-2 capitalize text-xs">{r.condicion_pago}</td>
                <td className="px-3 py-2"><Badge variant="outline" className="text-xs capitalize">{r.status}</Badge></td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums">{fmtMoney(r.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function TurnoDetalleModal({ turnoId, onClose }: { turnoId: string | null; onClose: () => void }) {
  const q = useQuery({
    queryKey: ['admin-pos-turno-detalle', turnoId],
    queryFn: async () => {
      if (!turnoId) return null;
      const { data: turno } = await supabase.from('caja_turnos').select('*').eq('id', turnoId).maybeSingle();
      const { data: movs } = await supabase
        .from('caja_movimientos')
        .select('*')
        .eq('turno_id', turnoId)
        .order('created_at', { ascending: false });
      const { data: ventas } = await supabase
        .from('ventas')
        .select('id, folio, fecha, total, condicion_pago, status, cliente:clientes(nombre)')
        .eq('turno_id', turnoId)
        .order('fecha', { ascending: false });
      return { turno, movs: movs ?? [], ventas: ventas ?? [] };
    },
    enabled: !!turnoId,
  });

  const open = !!turnoId;
  const t = q.data?.turno as any;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5 text-primary" />
            Detalle de turno {t?.caja_nombre ? `· ${t.caja_nombre}` : ''}
          </DialogTitle>
        </DialogHeader>

        {q.isLoading || !t ? (
          <div className="p-6 text-center text-sm text-muted-foreground">Cargando...</div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <Kpi icon={<Wallet className="h-3.5 w-3.5" />} label="Fondo inicial" value={Number(t.fondo_inicial) || 0} tone="primary" />
              <Kpi icon={<Banknote className="h-3.5 w-3.5" />} label="Efectivo esperado" value={Number(t.total_efectivo_esperado) || 0} tone="primary" />
              <Kpi icon={<Banknote className="h-3.5 w-3.5" />} label="Efectivo contado" value={Number(t.total_efectivo_contado) || 0} tone="success" />
              <Kpi
                icon={<Banknote className="h-3.5 w-3.5" />}
                label="Diferencia"
                value={Number(t.diferencia) || 0}
                tone={Number(t.diferencia ?? 0) === 0 ? 'success' : Number(t.diferencia) < 0 ? 'destructive' : 'warning'}
              />
              <Kpi icon={<CreditCard className="h-3.5 w-3.5" />} label="Tarjeta" value={Number(t.total_tarjeta_contado) || 0} tone="primary" />
              <Kpi icon={<Smartphone className="h-3.5 w-3.5" />} label="Transferencia" value={Number(t.total_transferencia_contado) || 0} tone="primary" />
              <Kpi icon={<MoreHorizontal className="h-3.5 w-3.5" />} label="Otros" value={Number(t.total_otros_contado) || 0} tone="primary" />
              <Kpi icon={<Clock className="h-3.5 w-3.5" />} label={t.status === 'abierto' ? 'Abierto desde' : 'Cerrado'} value={0} tone="primary" raw />
            </div>

            <div className="text-xs text-muted-foreground grid grid-cols-2 gap-2">
              <div><b>Apertura:</b> {fmtDate(t.abierto_at)}</div>
              <div><b>Cierre:</b> {t.cerrado_at ? fmtDate(t.cerrado_at) : '—'}</div>
              {t.notas_apertura && <div className="col-span-2"><b>Notas apertura:</b> {t.notas_apertura}</div>}
              {t.notas_cierre && <div className="col-span-2"><b>Notas cierre:</b> {t.notas_cierre}</div>}
            </div>

            <div>
              <h4 className="text-sm font-semibold mb-2 flex items-center gap-1.5"><Banknote className="h-4 w-4" /> Movimientos de caja ({q.data?.movs.length ?? 0})</h4>
              <Card className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left px-2 py-1.5">Fecha</th>
                      <th className="text-left px-2 py-1.5">Tipo</th>
                      <th className="text-left px-2 py-1.5">Motivo</th>
                      <th className="text-right px-2 py-1.5">Monto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(q.data?.movs ?? []).map((m: any) => (
                      <tr key={m.id} className="border-t border-border/50">
                        <td className="px-2 py-1.5 tabular-nums">{fmtDate(m.created_at)}</td>
                        <td className="px-2 py-1.5 capitalize">{m.tipo}</td>
                        <td className="px-2 py-1.5 text-muted-foreground">{m.motivo || '—'}</td>
                        <td className="px-2 py-1.5 text-right font-semibold tabular-nums">{fmtMoney(m.monto)}</td>
                      </tr>
                    ))}
                    {!q.data?.movs.length && (
                      <tr><td colSpan={4} className="px-2 py-3 text-center text-muted-foreground">Sin movimientos.</td></tr>
                    )}
                  </tbody>
                </table>
              </Card>
            </div>

            <div>
              <h4 className="text-sm font-semibold mb-2 flex items-center gap-1.5"><ShoppingCart className="h-4 w-4" /> Ventas del turno ({q.data?.ventas.length ?? 0})</h4>
              <Card className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left px-2 py-1.5">Folio</th>
                      <th className="text-left px-2 py-1.5">Fecha</th>
                      <th className="text-left px-2 py-1.5">Cliente</th>
                      <th className="text-left px-2 py-1.5">Pago</th>
                      <th className="text-left px-2 py-1.5">Estado</th>
                      <th className="text-right px-2 py-1.5">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(q.data?.ventas ?? []).map((v: any) => (
                      <tr key={v.id} className="border-t border-border/50">
                        <td className="px-2 py-1.5 font-mono">{v.folio}</td>
                        <td className="px-2 py-1.5 tabular-nums">{v.fecha}</td>
                        <td className="px-2 py-1.5">{v.cliente?.nombre ?? '—'}</td>
                        <td className="px-2 py-1.5 capitalize">{v.condicion_pago}</td>
                        <td className="px-2 py-1.5 capitalize">{v.status}</td>
                        <td className="px-2 py-1.5 text-right font-semibold tabular-nums">{fmtMoney(v.total)}</td>
                      </tr>
                    ))}
                    {!q.data?.ventas.length && (
                      <tr><td colSpan={6} className="px-2 py-3 text-center text-muted-foreground">Sin ventas en este turno.</td></tr>
                    )}
                  </tbody>
                </table>
              </Card>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function SumCard({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone: 'primary' | 'success' | 'warning' | 'destructive' }) {
  const cls = {
    primary: 'bg-primary/10 text-primary border-primary/30',
    success: 'bg-success/10 text-success border-success/30',
    warning: 'bg-warning/10 text-warning border-warning/30',
    destructive: 'bg-destructive/10 text-destructive border-destructive/30',
  }[tone];
  return (
    <div className={`rounded-lg border p-3 ${cls}`}>
      <div className="flex items-center gap-1.5 text-xs font-semibold opacity-90">{icon}{label}</div>
      <div className="text-xl font-bold tabular-nums mt-1">{fmtMoney(value)}</div>
    </div>
  );
}

function fmtDate(iso: string) {
  try { return new Date(iso).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }); }
  catch { return iso; }
}
