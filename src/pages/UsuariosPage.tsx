import { useState, useEffect, useCallback } from 'react';
import { Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useSubscription } from '@/hooks/useSubscription';
import { useUsuarios } from '@/hooks/useUsuarios';
import { useRoles } from '@/hooks/useRoles';
import HelpButton from '@/components/HelpButton';
import { HELP } from '@/lib/helpContent';
import UsuariosTab from '@/components/usuarios/UsuariosTab';
import RolesTab from '@/components/usuarios/RolesTab';
import EditUserModal from '@/components/usuarios/modals/EditUserModal';
import NewUserModal from '@/components/usuarios/modals/NewUserModal';
import PasswordModal from '@/components/usuarios/modals/PasswordModal';

export default function UsuariosPage() {
  const { empresa } = useAuth();
  const subscription = useSubscription();
  const [tab, setTab] = useState<'usuarios' | 'roles'>('usuarios');
  const usuarios = useUsuarios();
  const rolesHook = useRoles();

  const reload = useCallback(async () => {
    if (!empresa?.id) return;
    await Promise.all([
      usuarios.loadUsuarios(),
      rolesHook.loadRoles(empresa.id),
    ]);
  }, [empresa?.id, usuarios.loadUsuarios, rolesHook.loadRoles]);

  useEffect(() => { reload(); }, [reload]);

  const activeUsers = usuarios.profiles.filter(p => p.estado === 'activo').length;
  const availableSlots = subscription.maxUsuarios - activeUsers;
  const activeRoles = rolesHook.roles.filter(r => r.activo !== false);

  if (usuarios.loading) return <div className="p-6 text-muted-foreground text-sm">Cargando...</div>;

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-foreground flex items-center gap-2">
          <Users className="h-5 w-5" /> Usuarios y Permisos
          <HelpButton title={HELP.usuarios.title} sections={HELP.usuarios.sections} />
        </h1>
      </div>

      <div className="flex gap-1 border-b border-border">
        <button onClick={() => setTab('usuarios')} className={cn("px-4 py-2 text-sm font-medium border-b-2 transition-colors", tab === 'usuarios' ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}>Usuarios</button>
        <button onClick={() => setTab('roles')} className={cn("px-4 py-2 text-sm font-medium border-b-2 transition-colors", tab === 'roles' ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}>Roles y Permisos</button>
      </div>

      {tab === 'usuarios' && (
        <UsuariosTab
          profiles={usuarios.profiles} userRoles={usuarios.userRoles} authUsers={usuarios.authUsers}
          roles={rolesHook.roles} almacenes={usuarios.almacenes}
          activeUsers={activeUsers} maxUsuarios={subscription.maxUsuarios} availableSlots={availableSlots}
          ownerUserId={empresa?.owner_user_id}
          onNewUser={() => usuarios.setShowNewUser(true)}
          onEditUser={usuarios.startEdit}
          onSetPassword={(uid, name) => { usuarios.setPasswordModal({ userId: uid, nombre: name }); usuarios.setNewPassword(''); }}
          onToggleEstado={usuarios.toggleEstado}
        />
      )}

      {tab === 'roles' && (
        <RolesTab
          roles={rolesHook.roles} permisos={rolesHook.permisos} savingPermisos={rolesHook.savingPermisos}
          rolesTab={rolesHook.rolesTab} setRolesTab={rolesHook.setRolesTab}
          showRoleForm={rolesHook.showRoleForm} editingRole={rolesHook.editingRole}
          roleName={rolesHook.roleName} setRoleName={rolesHook.setRoleName}
          roleDesc={rolesHook.roleDesc} setRoleDesc={rolesHook.setRoleDesc}
          roleMovil={rolesHook.roleMovil} setRoleMovil={rolesHook.setRoleMovil}
          roleSoloMovil={rolesHook.roleSoloMovil} setRoleSoloMovil={rolesHook.setRoleSoloMovil}
          onNewRole={rolesHook.openNewRole}
          onCloseRoleForm={rolesHook.resetRoleForm}
          onSaveRole={() => rolesHook.saveRoleWithSoloMovil(reload)}
          onEditRole={rolesHook.openEditRole}
          onToggleActivo={(id, cur) => rolesHook.toggleRoleActivo(id, cur, reload)}
          onTogglePermiso={rolesHook.togglePermiso}
          onToggleAllModule={(rid, mod) => rolesHook.toggleAllModule(rid, mod, () => rolesHook.loadRoles(empresa!.id))}
          onToggleAllGroup={(rid, grp) => rolesHook.toggleAllGroup(rid, grp, () => rolesHook.loadRoles(empresa!.id))}
        />
      )}

      {usuarios.showNewUser && (
        <NewUserModal
          newUser={usuarios.newUser} setNewUser={usuarios.setNewUser} creatingUser={usuarios.creatingUser}
          activeRoles={activeRoles} almacenes={usuarios.almacenes}
          quickCreateRole={usuarios.quickCreateRole} setQuickCreateRole={usuarios.setQuickCreateRole}
          quickRoleName={usuarios.quickRoleName} setQuickRoleName={usuarios.setQuickRoleName}
          quickCreateAlmacen={usuarios.quickCreateAlmacen} setQuickCreateAlmacen={usuarios.setQuickCreateAlmacen}
          quickAlmacenName={usuarios.quickAlmacenName} setQuickAlmacenName={usuarios.setQuickAlmacenName}
          onQuickCreateRole={usuarios.quickCreateRoleAction} onQuickCreateAlmacen={usuarios.quickCreateAlmacenAction}
          onCreate={() => usuarios.createUser(availableSlots, subscription.maxUsuarios)}
          onClose={() => usuarios.setShowNewUser(false)}
        />
      )}

      {usuarios.editingUser && (
        <EditUserModal
          editingUser={usuarios.editingUser} editForm={usuarios.editForm} setEditForm={usuarios.setEditForm}
          savingUser={usuarios.savingUser} authUsers={usuarios.authUsers} activeRoles={activeRoles} almacenes={usuarios.almacenes}
          ownerUserId={empresa?.owner_user_id}
          onSave={usuarios.saveUser} onClose={() => usuarios.setEditingUser(null)}
        />
      )}

      {usuarios.passwordModal && (
        <PasswordModal
          nombre={usuarios.passwordModal.nombre}
          newPassword={usuarios.newPassword} setNewPassword={usuarios.setNewPassword}
          settingPassword={usuarios.settingPassword}
          onSave={usuarios.handleSetPassword} onClose={() => usuarios.setPasswordModal(null)}
        />
      )}
    </div>
  );
}
