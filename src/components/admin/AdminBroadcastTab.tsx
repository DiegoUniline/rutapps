import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Megaphone, Trash2, Send } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const TIPOS = [
  { key: 'info', label: 'Info', color: 'bg-blue-500' },
  { key: 'success', label: 'Éxito', color: 'bg-emerald-500' },
  { key: 'warning', label: 'Aviso', color: 'bg-amber-500' },
  { key: 'error', label: 'Crítico', color: 'bg-red-500' },
] as const;

export default function AdminBroadcastTab() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [mensaje, setMensaje] = useState('');
  const [tipo, setTipo] = useState<'info' | 'success' | 'warning' | 'error'>('info');

  const { data: messages, isLoading } = useQuery({
    queryKey: ['admin-broadcast-messages'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('broadcast_messages')
        .select('id, mensaje, tipo, created_at')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });

  const sendMut = useMutation({
    mutationFn: async () => {
      if (!mensaje.trim()) throw new Error('Escribe un mensaje');
      const { error } = await supabase
        .from('broadcast_messages')
        .insert({ mensaje: mensaje.trim(), tipo, created_by: user?.id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Mensaje enviado a todos los usuarios');
      setMensaje('');
      qc.invalidateQueries({ queryKey: ['admin-broadcast-messages'] });
      qc.invalidateQueries({ queryKey: ['broadcast-messages'] });
    },
    onError: (e: any) => toast.error(e.message ?? 'Error al enviar'),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('broadcast_messages').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Mensaje eliminado');
      qc.invalidateQueries({ queryKey: ['admin-broadcast-messages'] });
      qc.invalidateQueries({ queryKey: ['broadcast-messages'] });
    },
    onError: (e: any) => toast.error(e.message ?? 'Error'),
  });

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center gap-2">
        <Megaphone className="h-5 w-5 text-primary" />
        <h1 className="text-xl font-bold">Mensajes en tiempo real</h1>
      </div>
      <p className="text-sm text-muted-foreground">
        El mensaje aparecerá como notificación a TODOS los usuarios conectados al instante y quedará en su bandeja.
      </p>

      <div className="bg-card border border-border rounded-lg p-4 space-y-3">
        <div>
          <label className="text-xs font-medium text-muted-foreground uppercase">Tipo</label>
          <div className="flex gap-2 mt-1 flex-wrap">
            {TIPOS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTipo(t.key)}
                className={cn(
                  'flex items-center gap-2 px-3 py-1.5 rounded-md border text-xs font-medium transition',
                  tipo === t.key ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/40',
                )}
              >
                <span className={cn('h-2 w-2 rounded-full', t.color)} />
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground uppercase">Mensaje</label>
          <Textarea
            value={mensaje}
            onChange={(e) => setMensaje(e.target.value)}
            placeholder="Escribe el mensaje que verán todos los usuarios..."
            className="mt-1 min-h-[100px]"
            maxLength={500}
          />
          <p className="text-[11px] text-muted-foreground mt-1">{mensaje.length}/500</p>
        </div>

        <Button onClick={() => sendMut.mutate()} disabled={sendMut.isPending || !mensaje.trim()}>
          <Send className="h-4 w-4 mr-1.5" />
          {sendMut.isPending ? 'Enviando…' : 'Enviar a todos'}
        </Button>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="px-3 py-2 border-b border-border">
          <h3 className="text-sm font-semibold">Historial ({messages?.length ?? 0})</h3>
        </div>
        <div className="max-h-[500px] overflow-y-auto">
          {isLoading ? (
            <p className="text-center text-sm text-muted-foreground py-6">Cargando…</p>
          ) : (messages ?? []).length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-6">Sin mensajes enviados</p>
          ) : (
            messages!.map((m: any) => {
              const t = TIPOS.find((x) => x.key === m.tipo) ?? TIPOS[0];
              return (
                <div key={m.id} className="px-3 py-2 border-b border-border/40 last:border-0 flex items-start gap-3">
                  <span className={cn('h-2 w-2 rounded-full mt-2 shrink-0', t.color)} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm whitespace-pre-wrap break-words">{m.mensaje}</p>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      {new Date(m.created_at).toLocaleString('es-MX')}
                    </p>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-destructive hover:text-destructive"
                    onClick={() => {
                      if (confirm('¿Eliminar este mensaje del historial?')) deleteMut.mutate(m.id);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
