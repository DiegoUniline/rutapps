import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { fmtMoney } from '@/lib/currency';
import { Calculator, Receipt, ArrowDownCircle, ArrowUpCircle, Banknote, ShoppingCart, Clock, CheckCircle2 } from 'lucide-react';

interface Empresa { id: string; nombre: string }

export default function AdminPosTab() {
  const [empresaId, setEmpresaId] = useState<string>('');

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
        <div className="flex items-center gap-3">
          <Calculator className="h-5 w-5 text-primary" />
          <div className="flex-1">
            <h3 className="text-sm font-bold">Punto de Venta — Vista Maestra</h3>
            <p className="text-xs text-muted-foreground">Turnos de caja, movimientos y ventas POS por empresa.</p>
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
        <Tabs defaultValue="turnos">
          <TabsList>
            <TabsTrigger value="turnos" className="gap-1.5"><Clock className="h-4 w-4" /> Turnos</TabsTrigger>
            <TabsTrigger value="movimientos" className="gap-1.5"><Banknote className="h-4 w-4" /> Movimientos</TabsTrigger>
            <TabsTrigger value="ventas" className="gap-1.5"><ShoppingCart className="h-4 w-4" /> Ventas POS</TabsTrigger>
          </TabsList>
          <TabsContent value="turnos" className="mt-4"><TurnosPanel empresaId={empresaId} /></TabsContent>
          <TabsContent value="movimientos" className="mt-4"><MovimientosPanel empresaId={empresaId} /></TabsContent>
          <TabsContent value="ventas" className="mt-4"><VentasPosPanel empresaId={empresaId} /></TabsContent>
        </Tabs>
      ) : (
        <Card className="p-8 text-center text-sm text-muted-foreground">Selecciona una empresa para ver su actividad POS.</Card>
      )}
    </div>
  );
}

function TurnosPanel({ empresaId }: { empresaId: string }) {
  const q = useQuery({
    queryKey: ['admin-pos-turnos', empresaId],
    queryFn: async () => {
      const { data: turnos } = await supabase
        .from('caja_turnos')
        .select('*')
        .eq('empresa_id', empresaId)
        .order('abierto_at', { ascending: false })
        .limit(100);
      const cajeroIds = Array.from(new Set((turnos ?? []).map((t: any) => t.cajero_id).filter(Boolean)));
      const { data: profiles } = cajeroIds.length
        ? await supabase.from('profiles').select('user_id, nombre').in('user_id', cajeroIds)
        : { data: [] as any[] };
      const nameMap = new Map((profiles ?? []).map((p: any) => [p.user_id, p.nombre]));
      return (turnos ?? []).map((t: any) => ({ ...t, cajero_nombre: nameMap.get(t.cajero_id) ?? '—' }));
    },
  });

  const turnos = q.data ?? [];
  if (q.isLoading) return <Card className="p-6 text-center text-sm text-muted-foreground">Cargando...</Card>;
  if (!turnos.length) return <Card className="p-6 text-center text-sm text-muted-foreground">Sin turnos registrados.</Card>;

  return (
    <Card className="overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-xs">
          <tr>
            <th className="text-left px-3 py-2">Caja</th>
            <th className="text-left px-3 py-2">Cajero</th>
            <th className="text-left px-3 py-2">Apertura</th>
            <th className="text-left px-3 py-2">Cierre</th>
            <th className="text-right px-3 py-2">Fondo inicial</th>
            <th className="text-right px-3 py-2">Efectivo esperado</th>
            <th className="text-right px-3 py-2">Diferencia</th>
            <th className="text-center px-3 py-2">Estado</th>
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
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function MovimientosPanel({ empresaId }: { empresaId: string }) {
  const q = useQuery({
    queryKey: ['admin-pos-movs', empresaId],
    queryFn: async () => {
      const { data } = await supabase
        .from('caja_movimientos')
        .select('id, tipo, monto, motivo, created_at, turno_id, user_id, caja_turnos(caja_nombre)')
        .eq('empresa_id', empresaId)
        .order('created_at', { ascending: false })
        .limit(200);
      return data ?? [];
    },
  });

  const rows = (q.data ?? []) as any[];
  if (q.isLoading) return <Card className="p-6 text-center text-sm text-muted-foreground">Cargando...</Card>;
  if (!rows.length) return <Card className="p-6 text-center text-sm text-muted-foreground">Sin movimientos de caja.</Card>;

  const totals = rows.reduce((acc, r) => {
    const m = Number(r.monto) || 0;
    if (r.tipo === 'deposito') acc.dep += m;
    else if (r.tipo === 'retiro') acc.ret += m;
    else if (r.tipo === 'gasto') acc.gas += m;
    return acc;
  }, { dep: 0, ret: 0, gas: 0 });

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <SumCard icon={<ArrowDownCircle className="h-4 w-4" />} label="Depósitos" value={totals.dep} tone="success" />
        <SumCard icon={<ArrowUpCircle className="h-4 w-4" />} label="Retiros" value={totals.ret} tone="warning" />
        <SumCard icon={<Receipt className="h-4 w-4" />} label="Gastos" value={totals.gas} tone="destructive" />
      </div>
      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs">
            <tr>
              <th className="text-left px-3 py-2">Fecha</th>
              <th className="text-left px-3 py-2">Caja</th>
              <th className="text-left px-3 py-2">Tipo</th>
              <th className="text-left px-3 py-2">Motivo</th>
              <th className="text-right px-3 py-2">Monto</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} className="border-t border-border/50 hover:bg-muted/30">
                <td className="px-3 py-2 text-xs tabular-nums">{fmtDate(r.created_at)}</td>
                <td className="px-3 py-2">{r.caja_turnos?.caja_nombre ?? '—'}</td>
                <td className="px-3 py-2 capitalize">{r.tipo}</td>
                <td className="px-3 py-2 text-muted-foreground">{r.motivo || '—'}</td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums">{fmtMoney(r.monto)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
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
        .limit(200);
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
      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs">
            <tr>
              <th className="text-left px-3 py-2">Folio</th>
              <th className="text-left px-3 py-2">Fecha</th>
              <th className="text-left px-3 py-2">Cliente</th>
              <th className="text-left px-3 py-2">Caja / Turno</th>
              <th className="text-left px-3 py-2">Pago</th>
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
                <td className="px-3 py-2 text-right font-semibold tabular-nums">{fmtMoney(r.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
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
