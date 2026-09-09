import { useEffect, useState } from 'react';
import { Check, Copy, KeyRound, Loader2, Mail, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

interface TeamAccessMember {
  id: string;
  name: string;
  email: string;
}

interface DirectCredentials {
  email: string;
  password: string;
}

interface TeamAccessDialogProps {
  member: TeamAccessMember | null;
  onClose: () => void;
  onCompleted: () => Promise<void> | void;
}

const functionErrorMessage = async (error: unknown) => {
  const fallback = error instanceof Error ? error.message : 'No se pudo contactar al servicio de accesos';
  const response = (error as { context?: Response } | null)?.context;
  if (!response || typeof response.text !== 'function') return fallback;
  try {
    const body = await response.clone().text();
    const parsed = body ? JSON.parse(body) : null;
    return parsed?.error || body || fallback;
  } catch {
    return fallback;
  }
};

export default function TeamAccessDialog({ member, onClose, onCompleted }: TeamAccessDialogProps) {
  const [mode, setMode] = useState<'invite' | 'direct'>('invite');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [credentials, setCredentials] = useState<DirectCredentials | null>(null);

  useEffect(() => {
    if (!member) return;
    setMode('invite');
    setPassword('');
    setCredentials(null);
  }, [member?.id]);

  const close = () => {
    if (saving) return;
    setCredentials(null);
    setPassword('');
    onClose();
  };

  const copyCredentials = async () => {
    if (!credentials) return;
    await navigator.clipboard.writeText(`Usuario: ${credentials.email}\nContraseña temporal: ${credentials.password}`);
    toast.success('Credenciales copiadas');
  };

  const createAccess = async () => {
    if (!member) return;
    if (mode === 'direct' && password && password.length < 8) {
      toast.error('La contraseña debe tener al menos 8 caracteres');
      return;
    }

    setSaving(true);
    try {
      const { data: result, error } = await supabase.functions.invoke('admin-team-account', {
        body: {
          person_id: member.id,
          access_mode: mode,
          ...(mode === 'direct' && password ? { temporary_password: password } : {}),
        },
      });
      if (error) throw new Error(await functionErrorMessage(error));
      if (result?.error) throw new Error(result.error);

      if (mode === 'invite') {
        toast.success(result?.existing_account ? 'Cuenta existente vinculada correctamente' : 'Invitación enviada por correo');
        await onCompleted();
        close();
        return;
      }

      if (result?.existing_account) {
        toast.success('Cuenta existente vinculada correctamente');
        await onCompleted();
        close();
        return;
      }

      const temporaryPassword = String(result?.temporary_password || '');
      if (!temporaryPassword) throw new Error('La cuenta se creó, pero no se recibió la contraseña temporal');
      setCredentials({ email: String(result?.email || member.email), password: temporaryPassword });
      toast.success('Acceso directo creado');
      await onCompleted();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo crear el acceso');
    } finally {
      setSaving(false);
    }
  };

  return <Dialog open={!!member} onOpenChange={open => { if (!open) close(); }}>
    <DialogContent className="max-w-xl">
      <DialogHeader>
        <DialogTitle>Dar acceso a {member?.name}</DialogTitle>
        <DialogDescription>{member?.email}</DialogDescription>
      </DialogHeader>

      {credentials ? <div className="space-y-4">
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
          <div className="mb-3 flex items-center gap-2 font-bold text-emerald-700"><Check className="h-4 w-4" />Cuenta creada y activa</div>
          <p className="text-xs text-muted-foreground">Estas credenciales se muestran una sola vez. La contraseña no se guarda en las tablas de RutApp.</p>
          <div className="mt-4 grid gap-3">
            <div><Label>Usuario</Label><Input readOnly value={credentials.email} /></div>
            <div><Label>Contraseña temporal</Label><Input readOnly value={credentials.password} className="font-mono font-bold" /></div>
          </div>
        </div>
        <Button className="w-full" variant="outline" onClick={copyCredentials}><Copy className="mr-2 h-4 w-4" />Copiar usuario y contraseña</Button>
      </div> : <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <button type="button" onClick={() => setMode('invite')} className={cn('rounded-xl border p-4 text-left transition', mode === 'invite' ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:bg-muted/50')}>
            <Mail className="mb-3 h-5 w-5" />
            <p className="font-bold">Invitación por correo</p>
            <p className="mt-1 text-xs text-muted-foreground">Para un correo real. Supabase envía el enlace para aceptar la invitación.</p>
          </button>
          <button type="button" onClick={() => setMode('direct')} className={cn('rounded-xl border p-4 text-left transition', mode === 'direct' ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:bg-muted/50')}>
            <KeyRound className="mb-3 h-5 w-5" />
            <p className="font-bold">Acceso directo</p>
            <p className="mt-1 text-xs text-muted-foreground">No envía correo. Sirve también para direcciones inventadas con formato válido.</p>
          </button>
        </div>

        {mode === 'direct' && <div className="space-y-2 rounded-xl border p-4">
          <Label>Contraseña temporal (opcional)</Label>
          <Input type="text" value={password} onChange={event => setPassword(event.target.value)} placeholder="Déjala vacía para generar una segura" autoComplete="off" />
          <p className="text-[11px] text-muted-foreground">Si la dejas vacía, el servidor genera una contraseña segura y te la muestra una sola vez.</p>
        </div>}

        <div className="rounded-lg border border-amber-500/25 bg-amber-500/5 p-3 text-xs text-muted-foreground">
          <ShieldCheck className="mr-1 inline h-4 w-4 text-amber-600" />El correo se usa como nombre de usuario. En acceso directo no necesita existir un buzón real, pero sí debe conservar un formato de email válido.
        </div>
      </div>}

      <DialogFooter>
        <Button variant="outline" onClick={close} disabled={saving}>{credentials ? 'Cerrar' : 'Cancelar'}</Button>
        {!credentials && <Button onClick={createAccess} disabled={saving}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {mode === 'invite' ? 'Enviar invitación' : 'Crear acceso directo'}
        </Button>}
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
