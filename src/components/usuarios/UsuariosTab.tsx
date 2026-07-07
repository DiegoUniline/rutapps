import { useState, useMemo } from 'react';
import { Users, UserPlus, Edit2, KeyRound, Archive, RotateCcw, AlertTriangle, LogOut, Search, X } from 'lucide-react';
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
  showArchived: boolean;
  setShowArchived: (v: boolean) => void;
  onNewUser: () => void;
  onEditUser: (p: ProfileUser) => void;
  onSetPassword: (userId: string, nombre: string) => void;
  onArchive: (p: ProfileUser, email?: string) => void;
  onReactivate: (p: ProfileUser) => void;
  onForceSignOut: (p: ProfileUser) => void;
}

const estadoBadge = (estado: string) => {
  switch (estado) {
    case 'activo': return 'bg-success/10 text-success';
    case 'archivado': return 'bg-muted text-muted-foreground';
    case 'baja': return 'bg-destructive/10 text-destructive';
    default: return 'bg-card/50 text-muted-foreground';
  }
};

export default function UsuariosTab({
  profiles, userRoles, authUsers, roles, almacenes,
  activeUsers, maxUsuarios, availableSlots, ownerUserId,
  showArchived, setShowArchived,
  onNewUser, onEditUser, onSetPassword, onArchive, onReactivate, onForceSignOut,
}: Props) {
  const [search, setSearch] = useState('');
  const visibleProfiles = useMemo(() => {
    const base = showArchived ? profiles : profiles.filter(p => p.estado === 'activo');
    const q = search.trim().toLowerCase();
    if (!q) return base;
    return base.filter(p => {
      const email = authUsers.find(au => au.id === p.user_id)?.email || '';
      const userRole = userRoles.find(ur => ur.user_id === p.user_id);
      const rolName = userRole ? (roles.find(r => r.id === userRole.role_id)?.nombre || '') : '';
      const alm = almacenes.find(a => a.id === p.almacen_id)?.nombre || '';
      return (
        (p.nombre || '').toLowerCase().includes(q) ||
        (p.telefono || '').toLowerCase().includes(q) ||
        email.toLowerCase().includes(q) ||
        rolName.toLowerCase().includes(q) ||
        alm.toLowerCase().includes(q)
      );
    });
  }, [profiles, showArchived, search, authUsers, userRoles, roles, almacenes]);
  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="h-3.5 w-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por nombre, email, teléfono, rol o almacén..."
          className="input-odoo w-full pl-8 pr-8 text-sm"
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch('')}
            className="absolute right-2 top-2 p-0.5 rounded hover:bg-accent text-muted-foreground"
            title="Limpiar"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            <Users className="h-3.5 w-3.5 inline mr-1" />
            {activeUsers} / {maxUsuarios} usuarios activos
          </span>
          {availableSlots <= 0 && (
            <span className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
              <AlertTriangle className="h-3.5 w-3.5" />
              Al límite — usuarios extra se cobrarán en el próximo ciclo
            </span>
          )}
          {availableSlots > 0 && availableSlots <= 2 && (
            <span className="text-xs text-amber-600 dark:text-amber-400">
              {availableSlots} lugar{availableSlots !== 1 ? 'es' : ''} disponible{availableSlots !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} className="h-3.5 w-3.5" />
            Mostrar archivados
          </label>
          <button
            onClick={onNewUser}
            className="btn-odoo-primary text-xs"
          >
            <UserPlus className="h-3.5 w-3.5 mr-1" /> Nuevo usuario
          </button>
        </div>
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
            {visibleProfiles.map(p => {
              const userRole = userRoles.find(ur => ur.user_id === p.user_id);
              const authUser = authUsers.find(au => au.id === p.user_id);
              const isOwnerUser = ownerUserId === p.user_id;
              const isArchived = p.estado === 'archivado' || p.estado === 'baja';
              return (
                <tr key={p.id} className={cn("border-b border-border last:border-0 hover:bg-accent/30 cursor-pointer", isArchived && "opacity-60")} onClick={() => onEditUser(p)}>
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
                      {!isOwnerUser && p.estado === 'activo' && (
                        <button
                          onClick={() => onForceSignOut(p)}
                          className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-amber-600"
                          title="Cerrar sesión del usuario (lo expulsa de todos sus dispositivos)"
                        >
                          <LogOut className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {!isOwnerUser && p.estado === 'activo' && (
                        <button
                          onClick={() => onArchive(p, authUser?.email)}
                          className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-destructive"
                          title="Archivar usuario"
                        >
                          <Archive className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {!isOwnerUser && isArchived && (
                        <button
                          onClick={() => onReactivate(p)}
                          className="p-1 rounded hover:bg-accent text-success"
                          title="Reactivar usuario"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {visibleProfiles.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground text-sm">No hay usuarios para mostrar</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
