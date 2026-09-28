import { useState } from 'react';
import { Archive, X } from 'lucide-react';
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
    <div className="fixed inset-0 z-[80] bg-foreground/40 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Archive className="h-4 w-4 text-destructive" />
            <h2 className="text-base font-semibold text-foreground">Archivar usuario</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={archiving}
            className="p-1.5 rounded-md hover:bg-accent disabled:opacity-50"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-5">
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

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={archiving}
              className="px-4 py-2 text-sm rounded-md border border-border hover:bg-accent disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleArchive}
              disabled={archiving}
              className="px-4 py-2 text-sm font-semibold rounded-md bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
            >
              {archiving ? 'Archivando…' : 'Archivar usuario'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
