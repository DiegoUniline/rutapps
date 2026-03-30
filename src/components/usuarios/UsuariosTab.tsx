import { Users, UserPlus, Edit2, KeyRound, ToggleLeft, ToggleRight, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ProfileUser, AuthUser, UserRole, Almacen } from '@/hooks/useUsuarios';
import type { Role } from '@/hooks/useRoles';

interface Props {
  profiles: ProfileUser[];
  userRoles: UserRole[];
  authUsers: AuthUser[];
  roles: Role[];
  almacenes: Almacen[];
  activeUsers: number;
  maxUsuarios: number;
  availableSlots: number;
  ownerUserId?: string;
  onNewUser: () => void;
  onEditUser: (p: ProfileUser) => void;
  onSetPassword: (userId: string, nombre: string) => void;
  onToggleEstado: (p: ProfileUser, email?: string) => void;
}

const estadoBadge = (estado: string) => {
  switch (estado) {
    case 'activo': return 'bg-success/10 text-success';
    case 'baja': return 'bg-destructive/10 text-destructive';
    default: return 'bg-card/50 text-muted-foreground';
  }
};

export default function UsuariosTab({
  profiles, userRoles, authUsers, roles, almacenes,
  activeUsers, maxUsuarios, availableSlots, ownerUserId,
  onNewUser, onEditUser, onSetPassword, onToggleEstado,
}: Props) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            <Users className="h-3.5 w-3.5 inline mr-1" />
            {activeUsers} / {maxUsuarios} usuarios activos
          </span>
          {availableSlots <= 0 && (
            <span className="text-xs text-destructive flex items-center gap-1">
              <AlertTriangle className="h-3.5 w-3.5" />
              Límite alcanzado
            </span>
          )}
          {availableSlots > 0 && availableSlots <= 2 && (
            <span className="text-xs text-amber-600 dark:text-amber-400">
              {availableSlots} lugar{availableSlots !== 1 ? 'es' : ''} disponible{availableSlots !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <button
          onClick={onNewUser}
          disabled={availableSlots <= 0}
          className={cn("btn-odoo-primary text-xs", availableSlots <= 0 && "opacity-50 cursor-not-allowed")}
        >
          <UserPlus className="h-3.5 w-3.5 mr-1" /> Nuevo usuario
        </button>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-accent/50 border-b border-border">
              <th className="text-left px-4 py-2.5 font-semibold text-foreground">Nombre</th>
              <th className="text-left px-4 py-2.5 font-semibold text-foreground">Email</th>
              <th className="text-left px-4 py-2.5 font-semibold text-foreground">Rol</th>
              <th className="text-left px-4 py-2.5 font-semibold text-foreground">Almacén</th>
              <th className="text-left px-4 py-2.5 font-semibold text-foreground">Estado</th>
              <th className="w-28"></th>
            </tr>
          </thead>
          <tbody>
            {profiles.map(p => {
              const userRole = userRoles.find(ur => ur.user_id === p.user_id);
              const authUser = authUsers.find(au => au.id === p.user_id);
              const isOwnerUser = ownerUserId === p.user_id;
              return (
                <tr key={p.id} className="border-b border-border last:border-0 hover:bg-accent/30 cursor-pointer" onClick={() => onEditUser(p)}>
                  <td className="px-4 py-2.5">
                    <span className="font-medium text-foreground">{p.nombre || 'Sin nombre'}</span>
                    {isOwnerUser && <span className="ml-1.5 text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-semibold">Dueño</span>}
                    {p.telefono && <span className="block text-[11px] text-muted-foreground">{p.telefono}</span>}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="text-xs text-muted-foreground">{authUser?.email || '—'}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", userRole ? "bg-primary/10 text-primary" : "bg-card/50 text-muted-foreground")}>
                      {userRole ? roles.find(r => r.id === userRole.role_id)?.nombre : 'Sin rol'}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="text-xs text-muted-foreground">{almacenes.find(a => a.id === p.almacen_id)?.nombre || '—'}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={cn("text-[11px] px-2 py-0.5 rounded-full font-medium capitalize", estadoBadge(p.estado))}>{p.estado}</span>
                  </td>
                  <td className="px-4 py-2.5" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center gap-1">
                      <button onClick={() => onEditUser(p)} className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground" title="Editar"><Edit2 className="h-3.5 w-3.5" /></button>
                      <button onClick={() => onSetPassword(p.user_id, p.nombre || authUser?.email || '')} className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground" title="Cambiar contraseña"><KeyRound className="h-3.5 w-3.5" /></button>
                      {!isOwnerUser && (
                        <button
                          onClick={() => onToggleEstado(p, authUser?.email)}
                          className={cn("p-1 rounded hover:bg-accent", p.estado === 'activo' ? "text-muted-foreground hover:text-destructive" : "text-success hover:text-success")}
                          title={p.estado === 'activo' ? 'Dar de baja' : 'Reactivar'}
                        >
                          {p.estado === 'activo' ? <ToggleRight className="h-3.5 w-3.5" /> : <ToggleLeft className="h-3.5 w-3.5" />}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {profiles.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground text-sm">No hay usuarios registrados</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
