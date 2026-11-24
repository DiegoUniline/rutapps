import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { Activity, AlertTriangle, CheckCircle2, Loader2, Mail, RefreshCw, Smartphone, Timer } from 'lucide-react';
import {
  estadoDispositivo,
  parsearDestinatarios,
  type ConfigAlertasPanel,
  type DispositivoPanel,
  type ErrorAgrupado,
  type SaludCrons,
} from '@/lib/saludPanel';

/**
 * D-064 · Pestaña «Salud» del Panel Master: errores de la app, celulares con la cola atorada,
 * estado de los crons y destinatarios de las alertas por correo. Solo super admin (las RPC lo
 * validan en la BD).
 */

type RpcLibre = (fn: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
const rpc: RpcLibre = (fn, args) => (supabase.rpc as unknown as RpcLibre)(fn, args);
type ConsultaConfig = {
  select: (c: string) => { eq: (k: string, v: number) => { maybeSingle: () => PromiseLike<{ data: unknown; error: { message: string } | null }> } };
};

const fecha = (s: string | null) => (s ? new Date(s).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' }) : '—');

const CONFIG_VACIA: ConfigAlertasPanel = { destinatarios: [], activo: true, umbral_errores_hora: 20, horas_pendientes: 6 };

export default function AdminSaludTab() {
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [horas, setHoras] = useState(24);
  const [errores, setErrores] = useState<ErrorAgrupado[]>([]);
  const [dispositivos, setDispositivos] = useState<DispositivoPanel[]>([]);
  const [crons, setCrons] = useState<SaludCrons | null>(null);
  const [config, setConfig] = useState<ConfigAlertasPanel>(CONFIG_VACIA);
  const [destinatariosTexto, setDestinatariosTexto] = useState('');
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const [e, d, c, cfg] = await Promise.all([
        rpc('admin_salud_errores', { p_horas: horas }),
        rpc('admin_salud_dispositivos'),
        rpc('admin_salud_crons', { p_horas: horas }),
        // Tabla nueva (D-064): aún no está en types.ts (se regenera tras aplicar la migración).
        (supabase.from as unknown as (t: string) => ConsultaConfig)('alertas_config')
          .select('destinatarios, activo, umbral_errores_hora, horas_pendientes').eq('id', 1).maybeSingle(),
      ]);
      const primero = e.error ?? d.error ?? c.error ?? cfg.error;
      if (primero) throw new Error(primero.message);
      setErrores((e.data as ErrorAgrupado[]) ?? []);
      setDispositivos((d.data as DispositivoPanel[]) ?? []);
      setCrons(c.data as SaludCrons);
      const conf = (cfg.data as ConfigAlertasPanel | null) ?? CONFIG_VACIA;
      setConfig(conf);
      setDestinatariosTexto(conf.destinatarios.join(', '));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar la salud del sistema');
    } finally {
      setCargando(false);
    }
  }, [horas]);

  useEffect(() => { void cargar(); }, [cargar]);

  const guardarConfig = async () => {
    const { validos, invalidos } = parsearDestinatarios(destinatariosTexto);
    if (invalidos.length > 0) {
      toast.error(`Correo no válido: ${invalidos[0]}`);
      return;
    }
    setGuardando(true);
    const { data, error: err } = await rpc('admin_guardar_alertas_config', {
      p_destinatarios: validos,
      p_activo: config.activo,
      p_umbral_errores_hora: config.umbral_errores_hora,
      p_horas_pendientes: config.horas_pendientes,
    });
    setGuardando(false);
    if (err) {
      toast.error('No se guardó la configuración', { description: err.message });
      return;
    }
    const conf = data as ConfigAlertasPanel;
    setConfig(conf);
    setDestinatariosTexto(conf.destinatarios.join(', '));
    toast.success('Configuración de alertas guardada');
  };

  const fallasCron = crons?.fallas ?? [];
  const jobsConFalla = (crons?.jobs ?? []).filter((j) => j.fallas > 0 || j.ultimo_status === 'failed');
  const atorados = dispositivos.filter((x) => estadoDispositivo(x, config.horas_pendientes) !== 'pendientes');

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2"><Activity className="h-5 w-5 text-primary" /> Salud</h2>
          <p className="text-xs text-muted-foreground">Errores de la app, celulares y crons · todas las empresas</p>
        </div>
        <div className="flex items-center gap-2">
          {[24, 168].map((h) => (
            <Button key={h} size="sm" variant={horas === h ? 'default' : 'outline'} onClick={() => setHoras(h)}>
              {h === 24 ? '24 h' : '7 días'}
            </Button>
          ))}
          <Button size="sm" variant="outline" onClick={() => void cargar()} disabled={cargando}>
            <RefreshCw className={`h-4 w-4 mr-2 ${cargando ? 'animate-spin' : ''}`} /> Actualizar
          </Button>
        </div>
      </div>

      {error && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="py-4 text-sm text-destructive">{error}</CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Resumen etiqueta="Grupos de errores" valor={errores.length} malo={errores.length > 0} />
        <Resumen etiqueta="Celulares con fallidas o atorados" valor={atorados.length} malo={atorados.length > 0} />
        <Resumen etiqueta="Celulares con pendientes" valor={dispositivos.length} malo={false} />
        <Resumen etiqueta="Corridas de cron fallidas" valor={fallasCron.length} malo={fallasCron.length > 0} />
      </div>

      {/* Celulares */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Smartphone className="h-4 w-4" /> Celulares con pendientes o fallidas</CardTitle>
          <CardDescription>Atorado = pendientes sin subir hace {config.horas_pendientes} h o más. Fallidas = operaciones que agotaron reintentos (revisar en el teléfono: Ruta › Pendientes).</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Estado</TableHead>
                <TableHead>Usuario</TableHead>
                <TableHead>Empresa</TableHead>
                <TableHead className="text-right">Pendientes</TableHead>
                <TableHead className="text-right">Fallidas</TableHead>
                <TableHead className="text-right">Horas sin sync</TableHead>
                <TableHead>Versión</TableHead>
                <TableHead>Último error</TableHead>
                <TableHead>Reportó</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dispositivos.map((x) => {
                const estado = estadoDispositivo(x, config.horas_pendientes);
                return (
                  <TableRow key={`${x.user_id}-${x.dispositivo_id}`}>
                    <TableCell>
                      {estado === 'fallidas' && <Badge variant="destructive">Fallidas</Badge>}
                      {estado === 'atorado' && <Badge variant="destructive">Atorado</Badge>}
                      {estado === 'pendientes' && <Badge variant="secondary">Pendientes</Badge>}
                    </TableCell>
                    <TableCell className="font-medium">{x.usuario ?? '—'}<div className="text-[10px] text-muted-foreground font-mono">{x.plataforma ?? ''} · {x.dispositivo_id}</div></TableCell>
                    <TableCell>{x.empresa_nombre ?? '—'}</TableCell>
                    <TableCell className="text-right tabular-nums">{x.pendientes}</TableCell>
                    <TableCell className={`text-right tabular-nums ${x.fallidas > 0 ? 'text-destructive font-semibold' : ''}`}>{x.fallidas}</TableCell>
                    <TableCell className="text-right tabular-nums">{x.horas_sin_sync ?? '—'}</TableCell>
                    <TableCell className="text-xs">{x.version ?? '—'}</TableCell>
                    <TableCell className="text-xs max-w-[260px] truncate" title={x.ultimo_error ?? ''}>{x.ultimo_error ?? '—'}</TableCell>
                    <TableCell className="text-xs">{fecha(x.updated_at)}</TableCell>
                  </TableRow>
                );
              })}
              {dispositivos.length === 0 && !cargando && (
                <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground text-sm py-6">Ningún celular con pendientes</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Errores */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> Errores recientes de la app</CardTitle>
          <CardDescription>Agrupados por origen, mensaje y empresa. Sin datos personales; se guardan 30 días.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Origen</TableHead>
                <TableHead>Mensaje</TableHead>
                <TableHead>Empresa</TableHead>
                <TableHead className="text-right">Veces</TableHead>
                <TableHead className="text-right">Usuarios</TableHead>
                <TableHead>Última vez</TableHead>
                <TableHead>Versión</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {errores.map((e) => (
                <TableRow key={`${e.origen}-${e.mensaje}-${e.empresa_id ?? 'sin'}`}>
                  <TableCell className="font-mono text-xs">{e.origen}</TableCell>
                  <TableCell className="text-xs max-w-[360px] break-words">{e.mensaje}</TableCell>
                  <TableCell className="text-xs">{e.empresa_nombre ?? '—'}</TableCell>
                  <TableCell className="text-right tabular-nums">{e.conteo}</TableCell>
                  <TableCell className="text-right tabular-nums">{e.usuarios}</TableCell>
                  <TableCell className="text-xs">{fecha(e.ultima)}</TableCell>
                  <TableCell className="text-xs">{e.version ?? '—'}</TableCell>
                </TableRow>
              ))}
              {errores.length === 0 && !cargando && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground text-sm py-6">Sin errores en el periodo</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Crons */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Timer className="h-4 w-4" /> Crons</CardTitle>
          <CardDescription>
            {crons && !crons.cron_disponible
              ? 'pg_cron no está disponible en esta base.'
              : `${(crons?.jobs ?? []).length} programados · ${jobsConFalla.length} con fallas en el periodo · ${crons?.http_timeouts ?? 0} llamadas HTTP que pasaron de 5 s (normal en pg_net, no son fallas)`}
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto space-y-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cron</TableHead>
                <TableHead>Horario (UTC)</TableHead>
                <TableHead>Activo</TableHead>
                <TableHead>Última corrida</TableHead>
                <TableHead className="text-right">Fallas</TableHead>
                <TableHead>Último error</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(crons?.jobs ?? []).map((j) => (
                <TableRow key={j.jobid}>
                  <TableCell className="font-mono text-xs">{j.jobname ?? j.jobid}</TableCell>
                  <TableCell className="font-mono text-xs">{j.schedule}</TableCell>
                  <TableCell>{j.active ? <Badge variant="secondary">Sí</Badge> : <Badge variant="outline">No</Badge>}</TableCell>
                  <TableCell className="text-xs">
                    {j.ultimo_status === 'failed'
                      ? <span className="text-destructive font-medium">Falló · {fecha(j.ultima_corrida)}</span>
                      : j.ultima_corrida ? <span className="inline-flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-primary" /> {fecha(j.ultima_corrida)}</span> : '—'}
                  </TableCell>
                  <TableCell className={`text-right tabular-nums ${j.fallas > 0 ? 'text-destructive font-semibold' : ''}`}>{j.fallas}</TableCell>
                  <TableCell className="text-xs max-w-[320px] break-words">{j.ultimo_error ?? '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {(crons?.http_errores ?? []).length > 0 && (
            <div>
              <p className="text-sm font-medium mb-1">Llamadas HTTP con error (pg_net)</p>
              <ul className="text-xs space-y-1">
                {crons!.http_errores.map((h) => (
                  <li key={h.id} className="break-words">
                    <span className="text-destructive font-medium">{h.status_code ?? 'sin respuesta'}</span> · {fecha(h.created)} · {h.mensaje ?? ''}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Configuración de alertas */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Mail className="h-4 w-4" /> Alertas por correo</CardTitle>
          <CardDescription>Cada hora (minuto 17) se revisa todo lo anterior y se manda UN correo resumen solo si hay algo nuevo.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="alertas-destinatarios">Destinatarios (separados por coma, máx. 10)</Label>
            <Textarea id="alertas-destinatarios" rows={2} value={destinatariosTexto} onChange={(e) => setDestinatariosTexto(e.target.value)} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="flex items-center gap-2">
              <Switch id="alertas-activo" checked={config.activo} onCheckedChange={(v) => setConfig((c) => ({ ...c, activo: v }))} />
              <Label htmlFor="alertas-activo">Alertas activas</Label>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="alertas-umbral">Errores por hora para avisar</Label>
              <Input id="alertas-umbral" type="number" min={1} max={100000} value={config.umbral_errores_hora}
                onChange={(e) => setConfig((c) => ({ ...c, umbral_errores_hora: Number(e.target.value) }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="alertas-horas">Horas con pendientes para avisar</Label>
              <Input id="alertas-horas" type="number" min={1} max={168} value={config.horas_pendientes}
                onChange={(e) => setConfig((c) => ({ ...c, horas_pendientes: Number(e.target.value) }))} />
            </div>
          </div>
          <Button onClick={() => void guardarConfig()} disabled={guardando}>
            {guardando && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Guardar
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function Resumen({ etiqueta, valor, malo }: { etiqueta: string; valor: number; malo: boolean }) {
  return (
    <Card>
      <CardContent className="py-4">
        <p className={`text-3xl font-bold tabular-nums ${malo ? 'text-destructive' : 'text-foreground'}`}>{valor}</p>
        <p className="text-xs text-muted-foreground mt-1">{etiqueta}</p>
      </CardContent>
    </Card>
  );
}
