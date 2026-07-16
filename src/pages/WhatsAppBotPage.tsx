import { useState, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';

import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { MessageCircle, Plus, Trash2, Sparkles, Send } from 'lucide-react';
import { DateRangePicker } from '@/components/shared/DateRangePicker';
import { fetchAllPages } from '@/lib/supabasePaginate';


const COMMANDS = ['reportes', 'stock', 'clientes', 'cobros'] as const;
type Cmd = typeof COMMANDS[number];

function normPhone(s: string) {
  return (s || '').replace(/[^\d]/g, '');
}

export default function WhatsAppBotPage() {
  const { user, empresa } = useAuth();
  const empresaId = empresa?.id || null;
  const qc = useQueryClient();
  const [newPhone, setNewPhone] = useState('');
  const [newName, setNewName] = useState('');
  const [logsDesde, setLogsDesde] = useState('');
  const [logsHasta, setLogsHasta] = useState('');


  const addonQ = useQuery({
    queryKey: ['empresa_addons', empresaId],
    enabled: !!empresaId,
    queryFn: async () => {
      const { data } = await supabase.from('empresa_addons').select('*').eq('empresa_id', empresaId!).maybeSingle();
      return data;
    },
  });

  const numbersQ = useQuery({
    queryKey: ['wa_bot_authorized_numbers', empresaId],
    enabled: !!empresaId,
    queryFn: async () => {
      const { data } = await supabase.from('wa_bot_authorized_numbers')
        .select('*').eq('empresa_id', empresaId!).order('created_at', { ascending: false });
      return data || [];
    },
  });

  const logsQ = useQuery({
    queryKey: ['wa_bot_logs', empresaId, logsDesde, logsHasta],
    enabled: !!empresaId,
    queryFn: async () => {
      return await fetchAllPages<any>((from, to) => {
        let q = supabase.from('wa_bot_logs')
          .select('*').eq('empresa_id', empresaId!).order('created_at', { ascending: false });
        if (logsDesde) q = q.gte('created_at', logsDesde);
        if (logsHasta) q = q.lte('created_at', logsHasta + 'T23:59:59');
        return q.range(from, to);
      });
    },
  });


  const profilesQ = useQuery({
    queryKey: ['profiles_with_phone', empresaId],
    enabled: !!empresaId,
    queryFn: async () => {
      const { data } = await supabase.from('profiles')
        .select('id, nombre, telefono')
        .eq('empresa_id', empresaId!)
        .eq('estado', 'activo')
        .not('telefono', 'is', null);
      return data || [];
    },
  });

  const enabled = !!addonQ.data?.wa_bot_enabled;
  const requested = !!addonQ.data?.wa_bot_requested_at;

  const requestActivation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('empresa_addons')
        .upsert({ empresa_id: empresaId!, wa_bot_requested_at: new Date().toISOString() }, { onConflict: 'empresa_id' });
      if (error) throw error;
    },
    onSuccess: () => { toast.success('Solicitud enviada al equipo de RutApp'); qc.invalidateQueries({ queryKey: ['empresa_addons', empresaId] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const addNumber = useMutation({
    mutationFn: async (payload: { phone: string; nombre: string; profile_id?: string | null }) => {
      const { data, error } = await supabase.from('wa_bot_authorized_numbers').insert({
        empresa_id: empresaId!,
        phone_e164: normPhone(payload.phone),
        nombre: payload.nombre || null,
        profile_id: payload.profile_id || null,
        created_by: user?.id,
      }).select('id').single();
      if (error) throw error;
      // Mensaje de bienvenida (Jarvis) — no bloquea si falla
      try {
        await supabase.functions.invoke('wa-bot-welcome', { body: { authorized_id: data.id } });
      } catch { /* ignore */ }
    },
    onSuccess: () => { toast.success('Número agregado · Jarvis envió la bienvenida'); setNewPhone(''); setNewName(''); qc.invalidateQueries({ queryKey: ['wa_bot_authorized_numbers', empresaId] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const toggleActive = useMutation({
    mutationFn: async (row: any) => {
      const { error } = await supabase.from('wa_bot_authorized_numbers').update({ activo: !row.activo }).eq('id', row.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['wa_bot_authorized_numbers', empresaId] }),
  });

  const togglePermiso = useMutation({
    mutationFn: async ({ row, cmd }: { row: any; cmd: Cmd }) => {
      const p = { ...(row.permisos || {}) };
      p[cmd] = !p[cmd];
      const { error } = await supabase.from('wa_bot_authorized_numbers').update({ permisos: p }).eq('id', row.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['wa_bot_authorized_numbers', empresaId] }),
  });

  const removeNumber = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('wa_bot_authorized_numbers').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success('Número eliminado'); qc.invalidateQueries({ queryKey: ['wa_bot_authorized_numbers', empresaId] }); },
  });

  const updatePref = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Record<string, any> }) => {
      const { error } = await supabase.from('wa_bot_authorized_numbers').update(patch).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['wa_bot_authorized_numbers', empresaId] }),
    onError: (e: any) => toast.error(e.message),
  });

  const profilesAvailables = useMemo(() => {
    const usedPhones = new Set((numbersQ.data || []).map((n: any) => n.phone_e164));
    return (profilesQ.data || []).filter(p => p.telefono && !usedPhones.has(normPhone(p.telefono!)));
  }, [profilesQ.data, numbersQ.data]);

  if (!enabled) {
    return (
      <div className="max-w-3xl mx-auto p-6 space-y-6">
        <Card className="p-8 text-center space-y-4 border-primary/40 bg-gradient-to-br from-primary/5 to-background">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
            <MessageCircle className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold flex items-center justify-center gap-2">
            Bot de WhatsApp <Sparkles className="h-5 w-5 text-amber-500" />
          </h1>
          <p className="text-muted-foreground">
            Módulo premium: Jarvis interpreta preguntas por WhatsApp y responde solo con datos reales del sistema de la empresa: ventas, pedidos, clientes, saldos, productos, cobros y reportes PDF.
          </p>
          <ul className="text-sm text-left max-w-md mx-auto space-y-2">
            <li>📊 <b>Mándame el reporte de hoy en PDF</b></li>
            <li>📦 <b>¿Qué productos tengo en stock?</b></li>
            <li>👤 <b>Saldo de Juan Pérez</b></li>
            <li>🧾 <b>¿Quién vendió la última venta?</b></li>
          </ul>
          <Button
            size="lg"
            onClick={() => requestActivation.mutate()}
            disabled={requested || requestActivation.isPending}
          >
            {requested ? 'Solicitud enviada ✓' : 'Solicitar activación'}
          </Button>
          {requested && (
            <p className="text-xs text-muted-foreground">
              Te contactaremos para activar el servicio y coordinar el cobro mensual.
            </p>
          )}
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <MessageCircle className="h-6 w-6 text-primary" /> Bot de WhatsApp
          </h1>
          <p className="text-sm text-muted-foreground">Servicio activo. Da de alta los números autorizados para usar el bot.</p>
        </div>
        <Badge className="bg-green-600">Contratado</Badge>
      </div>

        {/* Ejemplos */}
      <Card className="p-4 space-y-2">
          <h2 className="font-semibold">Ejemplos para Jarvis</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
            <code className="bg-muted px-2 py-1 rounded">Mándame el reporte de hoy en PDF</code>
            <code className="bg-muted px-2 py-1 rounded">¿Qué productos tengo en stock?</code>
            <code className="bg-muted px-2 py-1 rounded">¿Qué pedidos tengo hoy?</code>
            <code className="bg-muted px-2 py-1 rounded">¿Quién vendió la última venta?</code>
            <code className="bg-muted px-2 py-1 rounded">Saldo de Juan Pérez</code>
            <code className="bg-muted px-2 py-1 rounded">¿Quién me debe más?</code>
        </div>
      </Card>

      {/* Agregar número */}
      <Card className="p-4 space-y-3">
        <h2 className="font-semibold">Agregar número autorizado</h2>
        {profilesAvailables.length > 0 && (
          <div>
            <Label className="text-xs text-muted-foreground">Desde un usuario del sistema</Label>
            <div className="flex flex-wrap gap-2 mt-1">
              {profilesAvailables.map(p => (
                <Button key={p.id} variant="outline" size="sm"
                  onClick={() => addNumber.mutate({ phone: p.telefono!, nombre: p.nombre || '', profile_id: p.id })}
                  disabled={addNumber.isPending}>
                  <Plus className="h-3 w-3 mr-1" /> {p.nombre || p.telefono}
                </Button>
              ))}
            </div>
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 items-end">
          <div>
            <Label>Teléfono (con LADA, sin +)</Label>
            <Input value={newPhone} onChange={e => setNewPhone(e.target.value)} placeholder="5215512345678" />
          </div>
          <div>
            <Label>Nombre</Label>
            <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Juan Pérez" />
          </div>
          <Button onClick={() => addNumber.mutate({ phone: newPhone, nombre: newName })}
            disabled={!newPhone || addNumber.isPending}>
            <Plus className="h-4 w-4 mr-1" /> Agregar
          </Button>
        </div>
      </Card>

      {/* Tabla números */}
      <Card className="p-4">
        <h2 className="font-semibold mb-3">Números autorizados</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Activo</TableHead>
              <TableHead>Teléfono</TableHead>
              <TableHead>Nombre</TableHead>
              {COMMANDS.map(c => <TableHead key={c} className="capitalize text-center">{c}</TableHead>)}
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(numbersQ.data || []).map((row: any) => (
              <TableRow key={row.id} className={!row.activo ? 'opacity-50' : ''}>
                <TableCell><Switch checked={row.activo} onCheckedChange={() => toggleActive.mutate(row)} /></TableCell>
                <TableCell className="font-mono">{row.phone_e164}</TableCell>
                <TableCell>{row.nombre || '—'}</TableCell>
                {COMMANDS.map(c => (
                  <TableCell key={c} className="text-center">
                    <Switch checked={!!row.permisos?.[c]} onCheckedChange={() => togglePermiso.mutate({ row, cmd: c })} />
                  </TableCell>
                ))}
                <TableCell>
                  <Button variant="ghost" size="icon" onClick={() => removeNumber.mutate(row.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {!numbersQ.data?.length && (
              <TableRow><TableCell colSpan={4 + COMMANDS.length} className="text-center text-muted-foreground py-6">Aún no hay números autorizados.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Envíos automáticos por usuario */}
      <Card className="p-4">
        <h2 className="font-semibold mb-1">Envíos automáticos</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Elige qué reportes recibe cada número por WhatsApp. Llegan en la zona horaria de tu empresa, con segundos de retraso entre envíos para que no nos bloqueen.
        </p>
        <div className="space-y-3">
          {(numbersQ.data || []).map((row: any) => (
            <div key={row.id} className="border border-border rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium">{row.nombre || '—'}</div>
                  <div className="text-xs font-mono text-muted-foreground">{row.phone_e164}</div>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm flex flex-wrap items-center gap-1">
                    📊 Reporte de ventas
                    {row.pref_reporte_diario && (
                      <>
                        <select
                          className="text-xs bg-background border border-border rounded px-1 py-0.5"
                          value={row.pref_reporte_diario_frecuencia || 'diario'}
                          onChange={(e) => updatePref.mutate({ id: row.id, patch: { pref_reporte_diario_frecuencia: e.target.value } })}
                        >
                          <option value="diario">Diario</option>
                          <option value="semanal">Semanal (Sáb · últ. 7 días)</option>
                        </select>
                        <select
                          className="text-xs bg-background border border-border rounded px-1 py-0.5"
                          value={row.pref_hora_reporte_diario || 9}
                          onChange={(e) => updatePref.mutate({ id: row.id, patch: { pref_hora_reporte_diario: Number(e.target.value) } })}
                        >
                          {Array.from({ length: 12 }, (_, i) => i + 9).map((h) => (
                            <option key={h} value={h}>{h}:00</option>
                          ))}
                        </select>
                        <select
                          className="text-xs bg-background border border-border rounded px-1 py-0.5"
                          value={row.pref_reporte_diario_formato || 'pdf'}
                          onChange={(e) => updatePref.mutate({ id: row.id, patch: { pref_reporte_diario_formato: e.target.value } })}
                        >
                          <option value="pdf">PDF</option>
                          <option value="excel">Excel</option>
                          <option value="ambos">PDF + Excel</option>
                        </select>
                      </>
                    )}
                  </div>
                  <Switch
                    checked={!!row.pref_reporte_diario}
                    onCheckedChange={(v) => updatePref.mutate({ id: row.id, patch: { pref_reporte_diario: v } })}
                  />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm">💰 Cobranza diaria <span className="text-xs text-muted-foreground">(1pm)</span></div>
                  <Switch
                    checked={!!row.pref_cobranza_diaria}
                    onCheckedChange={(v) => updatePref.mutate({ id: row.id, patch: { pref_cobranza_diaria: v } })}
                  />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm">🔔 Alertas semanales <span className="text-xs text-muted-foreground">(lun 9am)</span></div>
                  <Switch
                    checked={!!row.pref_alertas_semanal}
                    onCheckedChange={(v) => updatePref.mutate({ id: row.id, patch: { pref_alertas_semanal: v } })}
                  />
                </div>
              </div>
            </div>
          ))}
          {!numbersQ.data?.length && (
            <div className="text-center text-muted-foreground py-4 text-sm">Agrega números autorizados arriba para configurar sus envíos.</div>
          )}
        </div>
      </Card>

      {/* Historial */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h2 className="font-semibold flex items-center gap-2"><Send className="h-4 w-4" /> Historial reciente</h2>
          <DateRangePicker from={logsDesde} to={logsHasta} onChange={(f, t) => { setLogsDesde(f); setLogsHasta(t); }} />
        </div>
        <div className="space-y-2 max-h-96 overflow-y-auto text-sm">

          {(logsQ.data || []).map((l: any) => (
            <div key={l.id} className="border-b border-border pb-2">
              <div className="flex justify-between items-center">
                <span className="font-mono text-xs">{l.phone}</span>
                <span className="text-xs text-muted-foreground">{new Date(l.created_at).toLocaleString('es-MX')}</span>
              </div>
              <div className="text-xs"><b>{l.intent}</b> · {l.outcome} · <i>"{l.inbound_text}"</i></div>
              {l.response_summary && <div className="text-xs text-muted-foreground truncate">{l.response_summary}</div>}
            </div>
          ))}
          {!logsQ.data?.length && <div className="text-center text-muted-foreground py-4">Sin mensajes aún.</div>}
        </div>
      </Card>
    </div>
  );
}
