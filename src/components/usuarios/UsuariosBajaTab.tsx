import { UserX, RotateCcw } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import type { ProfileUser, AuthUser } from '@/hooks/useUsuarios';

interface Props {
  profiles: ProfileUser[];
  authUsers: AuthUser[];
  ownerUserId?: string;
  onReactivate: (p: ProfileUser) => void;
}

export default function UsuariosBajaTab({ profiles, authUsers, ownerUserId, onReactivate }: Props) {
  const bajas = profiles
    .filter(p => p.estado === 'baja' || p.estado === 'archivado')
    .sort((a, b) => {
      const ta = a.archivado_en ? new Date(a.archivado_en).getTime() : 0;
      const tb = b.archivado_en ? new Date(b.archivado_en).getTime() : 0;
      return tb - ta;
    });

  const nombreDe = (userId?: string | null) => {
    if (!userId) return '—';
    const prof = profiles.find(p => p.user_id === userId);
    if (prof?.nombre) return prof.nombre;
    const au = authUsers.find(a => a.id === userId);
    return au?.email || userId.slice(0, 8);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground flex items-center gap-1.5">
          <UserX className="h-3.5 w-3.5" />
          {bajas.length} usuario{bajas.length !== 1 ? 's' : ''} dado{bajas.length !== 1 ? 's' : ''} de baja
        </span>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-accent/50 border-b border-border">
              <th className="text-left px-4 py-2.5 font-semibold text-foreground">Nombre</th>
              <th className="text-left px-4 py-2.5 font-semibold text-foreground">Email</th>
              <th className="text-left px-4 py-2.5 font-semibold text-foreground">Fecha de baja</th>
              <th className="text-left px-4 py-2.5 font-semibold text-foreground">Dado de baja por</th>
              <th className="text-left px-4 py-2.5 font-semibold text-foreground">Motivo</th>
              <th className="w-20"></th>
            </tr>
          </thead>
          <tbody>
            {bajas.map(p => {
              const authUser = authUsers.find(au => au.id === p.user_id);
              const isOwnerUser = ownerUserId === p.user_id;
              return (
                <tr key={p.id} className="border-b border-border last:border-0 hover:bg-accent/30">
                  <td className="px-4 py-2.5">
                    <span className="font-medium text-foreground">{p.nombre || 'Sin nombre'}</span>
                    {p.telefono && <span className="block text-[11px] text-muted-foreground">{p.telefono}</span>}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="text-xs text-muted-foreground">{authUser?.email || '—'}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="text-xs text-foreground">
                      {p.archivado_en
                        ? format(new Date(p.archivado_en), "dd 'de' MMM yyyy, HH:mm", { locale: es })
                        : <span className="text-muted-foreground italic">sin registro</span>}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="text-xs text-foreground">{nombreDe(p.archivado_por)}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="text-xs text-muted-foreground">
                      {p.archivado_motivo || <span className="italic">sin motivo</span>}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    {!isOwnerUser && (
                      <button
                        onClick={() => onReactivate(p)}
                        className="p-1 rounded hover:bg-accent text-success"
                        title="Reactivar usuario"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {bajas.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground text-sm">No hay usuarios dados de baja</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
