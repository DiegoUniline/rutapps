import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { ArrowLeft, RefreshCw, ShieldCheck, ShieldAlert, CheckCircle2, AlertTriangle, Copy } from 'lucide-react';

type Health = {
  cobros_duplicados: number;
  cobros_huerfanos: number;
  aplicaciones_duplicadas: number;
  ventas_posibles_dup: number;
  generado_en: string;
};

type Dup = {
  empresa_id: string; cliente_id: string; folio: string | null; monto: number;
  fecha: string; cobro_huerfano: string; cobro_aplicado: string; seg_diferencia: number;
};

type Reciente = {
  id: string; empresa_id: string; cliente_id: string; monto: number;
  metodo_pago: string; fecha: string; created_at: string; aplicado: boolean;
};

const money = (n: number) => `$${(Number(n) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const shortId = (id: string) => `${id.slice(0, 8)}…${id.slice(-4)}`;

export default function SyncHealthPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [health, setHealth] = useState<Health | null>(null);
  const [dups, setDups] = useState<Dup[]>([]);
  const [recientes, setRecientes] = useState<Reciente[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [h, d, r] = await Promise.all([
        supabase.rpc('admin_sync_health' as any),
        supabase.rpc('admin_sync_duplicados' as any),
        supabase.rpc('admin_sync_recientes' as any),
      ]);
      if (h.error) throw h.error;
      setHealth(h.data as Health);
      setDups((d.data as Dup[]) ?? []);
      setRecientes((r.data as Reciente[]) ?? []);
    } catch (e: any) {
      setError(e?.message ?? 'Error cargando salud de sincronización');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const hardIssues = (health?.cobros_duplicados ?? 0) + (health?.aplicaciones_duplicadas ?? 0);
  const allGood = health != null && hardIssues === 0;

  const copyId = (id: string) => {
    navigator.clipboard?.writeText(id).then(() => toast.success('Id copiado')).catch(() => {});
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Button variant="ghost" size="icon" onClick={() => navigate('/super-admin')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="min-w-0">
              <h1 className="text-xl font-bold flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-primary" /> Salud de Sincronización
              </h1>
              <p className="text-xs text-muted-foreground">
                Detección de duplicados en vivo · todas las empresas
              </p>
            </div>
          </div>
          <Button onClick={load} disabled={loading} variant="outline" size="sm">
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Actualizar
          </Button>
        </div>

        {error && (
          <Card className="border-destructive/40 bg-destructive/5">
            <CardContent className="py-4 text-sm text-destructive">{error}</CardContent>
          </Card>
        )}

        {/* Semáforo grande */}
        {health && (
          <Card className={allGood ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-destructive/40 bg-destructive/5'}>
            <CardContent className="py-6 flex items-center gap-4">
              {allGood ? (
                <CheckCircle2 className="h-12 w-12 text-emerald-500 shrink-0" />
              ) : (
                <ShieldAlert className="h-12 w-12 text-destructive shrink-0" />
              )}
              <div className="min-w-0">
                <p className={`text-2xl font-bold ${allGood ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'}`}>
                  {allGood ? '✓ TODO EN ORDEN' : `⚠ ${hardIssues} duplicado${hardIssues === 1 ? '' : 's'} detectado${hardIssues === 1 ? '' : 's'}`}
                </p>
                <p className="text-sm text-muted-foreground">
                  {allGood
                    ? 'Cero cobros duplicados y cero aplicaciones dobles. El blindaje de idempotencia está funcionando.'
                    : 'Hay duplicación real — revisa el detalle abajo (probablemente un cliente con build viejo).'}
                </p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Última revisión: {new Date(health.generado_en).toLocaleString('es-MX')}
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Métricas */}
        {health && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Metric label="Cobros duplicados" value={health.cobros_duplicados} hard />
            <Metric label="Aplicaciones dobles" value={health.aplicaciones_duplicadas} hard />
            <Metric label="Cobros sin aplicar" value={health.cobros_huerfanos} hint="Incluye anticipos legítimos" />
            <Metric label="Ventas mismo monto/día" value={health.ventas_posibles_dup} hint="Informativo, no siempre es bug" />
          </div>
        )}

        {/* Detalle de duplicados */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              {dups.length === 0
                ? <><CheckCircle2 className="h-4 w-4 text-emerald-500" /> Sin cobros duplicados</>
                : <><AlertTriangle className="h-4 w-4 text-destructive" /> Cobros duplicados ({dups.length})</>}
            </CardTitle>
            <CardDescription>Huérfanos con un gemelo ya aplicado a un folio. Debe estar vacío.</CardDescription>
          </CardHeader>
          {dups.length > 0 && (
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Folio</TableHead>
                    <TableHead className="text-right">Monto</TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Cobro huérfano</TableHead>
                    <TableHead>Gemelo aplicado</TableHead>
                    <TableHead className="text-right">Δ seg</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dups.map((d) => (
                    <TableRow key={d.cobro_huerfano}>
                      <TableCell className="font-medium">{d.folio ?? '—'}</TableCell>
                      <TableCell className="text-right tabular-nums">{money(d.monto)}</TableCell>
                      <TableCell>{d.fecha}</TableCell>
                      <TableCell className="font-mono text-xs">{shortId(d.cobro_huerfano)}</TableCell>
                      <TableCell className="font-mono text-xs">{shortId(d.cobro_aplicado)}</TableCell>
                      <TableCell className="text-right tabular-nums">{d.seg_diferencia}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          )}
        </Card>

        {/* Últimos cobros con su id */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Últimos cobros y sus ids</CardTitle>
            <CardDescription>
              Cada id es único y estable. Un reintento del mismo cobro reusa el mismo id → no se duplica.
            </CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Id (estable)</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                  <TableHead>Método</TableHead>
                  <TableHead>Creado</TableHead>
                  <TableHead>Aplicado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recientes.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <button onClick={() => copyId(c.id)} className="font-mono text-xs inline-flex items-center gap-1 hover:text-primary">
                        {shortId(c.id)} <Copy className="h-3 w-3 opacity-50" />
                      </button>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{money(c.monto)}</TableCell>
                    <TableCell className="capitalize">{c.metodo_pago}</TableCell>
                    <TableCell className="text-xs">{new Date(c.created_at).toLocaleString('es-MX')}</TableCell>
                    <TableCell>
                      {c.aplicado
                        ? <Badge variant="secondary" className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">Sí</Badge>
                        : <Badge variant="outline" className="text-muted-foreground">No</Badge>}
                    </TableCell>
                  </TableRow>
                ))}
                {recientes.length === 0 && !loading && (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground text-sm py-6">Sin cobros aún</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Cómo probar */}
        <Card className="border-primary/30 bg-primary/[0.03]">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" /> Cómo probar que NO se duplica
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-2 text-muted-foreground">
            <ol className="list-decimal ml-5 space-y-1.5">
              <li>En un teléfono con el build nuevo (Ruta → Sincronizar → paso 5 "Sincronizar app"), pon el <b>modo avión</b>.</li>
              <li>Haz una <b>venta de contado</b> y, al confirmar, <b>toca el botón dos o tres veces rápido</b>.</li>
              <li>Registra también un <b>cobro</b> a un cliente con deuda, doble-tocando igual.</li>
              <li>Quita el modo avión y deja que <b>sincronice</b> (la nubecita se pone ✓).</li>
              <li>Vuelve aquí y dale <b>Actualizar</b>: los contadores duros deben seguir en <b>0</b> y la venta/cobro aparecen <b>una sola vez</b>.</li>
            </ol>
            <p className="pt-1">
              Si <b>“Cobros duplicados”</b> y <b>“Aplicaciones dobles”</b> quedan en <b>0</b> después de intentar duplicar a propósito → el blindaje funciona al 100%.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Metric({ label, value, hard, hint }: { label: string; value: number; hard?: boolean; hint?: string }) {
  const bad = value > 0;
  const color = hard && bad ? 'text-destructive' : bad ? 'text-amber-500' : 'text-emerald-500';
  return (
    <Card>
      <CardContent className="py-4">
        <p className={`text-3xl font-bold tabular-nums ${color}`}>{value}</p>
        <p className="text-xs font-medium text-foreground mt-1">{label}</p>
        {hint && <p className="text-[10px] text-muted-foreground mt-0.5">{hint}</p>}
      </CardContent>
    </Card>
  );
}
