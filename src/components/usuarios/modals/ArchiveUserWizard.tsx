import { useState } from 'react';
import { Archive } from 'lucide-react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import type { ProfileUser, Almacen } from '@/hooks/useUsuarios';

interface Props {
  user: ProfileUser;
  emailLabel?: string;
  activeUsers: ProfileUser[];
  almacenes: Almacen[];
  onClose: () => void;
  onArchived: () => void;
}

function withTimeout<T>(promise: PromiseLike<T>, ms: number, message: string): Promise<T> {
  return Promise.race([
    Promise.resolve(promise),
    new Promise<T>((_, reject) => {
      window.setTimeout(() => reject(new Error(message)), ms);
    }),
  ]);
}

export default function ArchiveUserWizard({
  user,
  emailLabel,
  onClose,
  onArchived,
}: Props) {
  const [archiving, setArchiving] = useState(false);

  const verifyArchivedAfterUncertainResult = async () => {
    try {
      const { data } = await withTimeout(
        supabase
          .from('profiles')
          .select('estado, archivado_en')
          .eq('id', user.id)
          .maybeSingle(),
        5000,
        'No fue posible confirmar el estado final.',
      );
      return data?.estado === 'archivado' || !!data?.archivado_en;
    } catch {
      return false;
    }
  };

  const handleArchive = async () => {
    setArchiving(true);
    try {
      const { data, error } = await withTimeout(
        supabase.functions.invoke('user-lifecycle', {
          body: {
            action: 'archive',
            profile_id: user.id,
            // Archivar siempre debe ser una baja de acceso, independientemente
            // de stock, rutas, ventas, entregas u otros pendientes operativos.
            force: true,
          },
        }),
        25000,
        'El archivado tardó demasiado. Se verificará el estado del usuario.',
      );

      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (!data?.archived) throw new Error('El servidor no confirmó el archivado del usuario');

      if (data?.session_warning) {
        toast.warning('Usuario archivado. El acceso queda bloqueado aunque no se haya podido confirmar el cierre de todas sus sesiones.');
      }
      if (data?.billing_synced === false) {
        toast.warning('Usuario archivado. La sincronización de usuarios facturables quedó pendiente de revisión.');
      }

      toast.success(data?.already_archived ? 'El usuario ya estaba archivado.' : 'Usuario archivado correctamente');
      onArchived();
    } catch (e: any) {
      const message = e?.message || 'No se pudo archivar el usuario';
      const uncertain = message.includes('tardó demasiado');

      if (uncertain && await verifyArchivedAfterUncertainResult()) {
        toast.warning('La respuesta tardó demasiado, pero el usuario sí quedó archivado.');
        onArchived();
      } else {
        toast.error(message);
      }
    } finally {
      setArchiving(false);
    }
  };

  return (
    // D-040: modal estándar. Clic fuera no cierra (como antes); mientras archiva tampoco Escape ni cerrar.
    <Dialog open onOpenChange={(o) => { if (!o && !archiving) onClose(); }}>
      <DialogContent
        className="max-w-md gap-5"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => { if (archiving) e.preventDefault(); }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Archive className="h-4 w-4 text-destructive" />
            Archivar usuario
          </DialogTitle>
        </DialogHeader>

        <div>
          <p className="text-sm text-muted-foreground">Vas a archivar a:</p>
          <p className="mt-1 font-semibold text-foreground">{user.nombre || 'Sin nombre'}</p>
          {emailLabel && <p className="text-sm text-muted-foreground">{emailLabel}</p>}
        </div>

        <div className="rounded-lg border border-border bg-muted/30 p-4">
          <p className="text-sm text-foreground">
            El usuario perderá el acceso al sistema y dejará de contar como usuario activo.
            Su historial permanecerá guardado.
          </p>
        </div>

        <p className="text-sm text-muted-foreground">
          Puedes archivarlo aunque tenga ventas, rutas, entregas, inventario o cualquier otro pendiente.
        </p>

        <DialogFooter className="gap-2 sm:space-x-0">
          <Button type="button" variant="cancelar" onClick={onClose} disabled={archiving}>
            Cancelar
          </Button>
          <Button type="button" variant="destructive" onClick={handleArchive} disabled={archiving}>
            {archiving ? 'Archivando…' : 'Archivar usuario'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
