import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { useState } from 'react';

export default function AdminWaBotTab() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');

  const empresasQ = useQuery({
    queryKey: ['admin_wa_bot_empresas'],
    queryFn: async () => {
      const { data: empresas } = await supabase.from('empresas')
        .select('id, nombre, razon_social')
        .order('nombre');
      const { data: addons } = await supabase.from('empresa_addons').select('*');
      const map = new Map((addons || []).map(a => [a.empresa_id, a]));
      return (empresas || []).map(e => ({ ...e, addon: map.get(e.id) }));
    },
  });

  const toggleBot = useMutation({
    mutationFn: async ({ empresaId, enabled }: { empresaId: string; enabled: boolean }) => {
      const { error } = await supabase.from('empresa_addons').upsert({
        empresa_id: empresaId,
        wa_bot_enabled: enabled,
        wa_bot_activated_at: enabled ? new Date().toISOString() : null,
        wa_bot_activated_by: enabled ? user?.id : null,
      }, { onConflict: 'empresa_id' });
      if (error) throw error;
    },
    onSuccess: () => { toast.success('Actualizado'); qc.invalidateQueries({ queryKey: ['admin_wa_bot_empresas'] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const updatePrice = useMutation({
    mutationFn: async ({ empresaId, price }: { empresaId: string; price: number }) => {
      const { error } = await supabase.from('empresa_addons')
        .upsert({ empresa_id: empresaId, wa_bot_monthly_price: price }, { onConflict: 'empresa_id' });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin_wa_bot_empresas'] }),
  });

  const rows = (empresasQ.data || []).filter(e => {
    if (!search) return true;
    return (e.nombre || '').toLowerCase().includes(search.toLowerCase());
  });

  const pendingRequests = (empresasQ.data || []).filter(e => e.addon?.wa_bot_requested_at && !e.addon?.wa_bot_enabled);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Bot WhatsApp — Add-on</h1>
        <p className="text-sm text-muted-foreground">Activación manual por empresa. Precio sugerido: referencia interna.</p>
      </div>

      {pendingRequests.length > 0 && (
        <Card className="p-4 border-amber-500/40 bg-amber-50 dark:bg-amber-950/20">
          <h2 className="font-semibold mb-2 text-amber-700 dark:text-amber-300">Solicitudes pendientes ({pendingRequests.length})</h2>
          <div className="space-y-1">
            {pendingRequests.map(e => (
              <div key={e.id} className="flex items-center justify-between text-sm">
                <span>{e.nombre}</span>
                <span className="text-xs text-muted-foreground">solicitado {new Date(e.addon.wa_bot_requested_at).toLocaleDateString('es-MX')}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Input placeholder="Buscar empresa..." value={search} onChange={e => setSearch(e.target.value)} className="max-w-md" />

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Empresa</TableHead>
              <TableHead className="text-center">Bot activo</TableHead>
              <TableHead>Precio mensual</TableHead>
              <TableHead>Activado</TableHead>
              <TableHead>Solicitado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(e => {
              const a = e.addon;
              return (
                <TableRow key={e.id}>
                  <TableCell>
                    <div className="font-medium">{e.nombre}</div>
                    {e.razon_social && <div className="text-xs text-muted-foreground">{e.razon_social}</div>}
                  </TableCell>
                  <TableCell className="text-center">
                    <Switch
                      checked={!!a?.wa_bot_enabled}
                      onCheckedChange={(v) => toggleBot.mutate({ empresaId: e.id, enabled: v })}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      defaultValue={a?.wa_bot_monthly_price || 0}
                      className="w-28"
                      onBlur={(ev) => {
                        const v = parseFloat(ev.target.value || '0');
                        if (v !== (a?.wa_bot_monthly_price || 0)) updatePrice.mutate({ empresaId: e.id, price: v });
                      }}
                    />
                  </TableCell>
                  <TableCell className="text-xs">
                    {a?.wa_bot_activated_at ? new Date(a.wa_bot_activated_at).toLocaleDateString('es-MX') : '—'}
                  </TableCell>
                  <TableCell className="text-xs">
                    {a?.wa_bot_requested_at
                      ? <Badge variant="outline">{new Date(a.wa_bot_requested_at).toLocaleDateString('es-MX')}</Badge>
                      : '—'}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      <Card className="p-4 text-sm space-y-2 bg-muted/30">
        <div className="font-semibold">Configuración del webhook</div>
        <div>URL: <code className="bg-background px-2 py-1 rounded">{`${import.meta.env.VITE_SUPABASE_URL || ''}/functions/v1/wa-bot-webhook`}</code></div>
        <div className="text-muted-foreground">Configurar en el panel de WhatsAPI con el token global de RutApp.</div>
      </Card>
    </div>
  );
}
