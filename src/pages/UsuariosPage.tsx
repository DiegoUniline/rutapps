import { useState, useEffect, useCallback } from 'react';
import { Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useSubscription } from '@/hooks/useSubscription';
import { useUsuarios, type ProfileUser } from '@/hooks/useUsuarios';
import { useRoles } from '@/hooks/useRoles';
import HelpButton from '@/components/HelpButton';
import { HELP } from '@/lib/helpContent';
import UsuariosTab from '@/components/usuarios/UsuariosTab';
import UsuariosBajaTab from '@/components/usuarios/UsuariosBajaTab';
import PlanSimuladorCard from '@/components/usuarios/PlanSimuladorCard';
import RolesTab from '@/components/usuarios/RolesTab';
import EditUserModal from '@/components/usuarios/modals/EditUserModal';
import NewUserModal from '@/components/usuarios/modals/NewUserModal';
import PasswordModal from '@/components/usuarios/modals/PasswordModal';
import ArchiveUserWizard from '@/components/usuarios/modals/ArchiveUserWizard';
import { confirmDialog } from '@/lib/confirm';

export default function UsuariosPage() {
  const { empresa } = useAuth();
  const subscription = useSubscription();
  const [tab, setTab] = useState<'usuarios' | 'bajas' | 'roles'>('usuarios');
  const [showArchived, setShowArchived] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<{ user: ProfileUser; email?: string } | null>(null);
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
  const isTrial = subscription.status === 'trial';
  // En prueba: usuarios ilimitados. En planes pagados: respeta el límite del plan.
  const effectiveMax = isTrial ? 9999 : subscription.maxUsuarios;
  const availableSlots = effectiveMax - activeUsers;
  const activeRoles = rolesHook.roles.filter(r => r.activo !== false);

  const handleArchive = (p: ProfileUser, email?: string) => setArchiveTarget({ user: p, email });
  const handleForceSignOut = async (p: ProfileUser) => {
    if (!await confirmDialog(`¿Cerrar la sesión de ${p.nombre || 'este usuario'}? Será expulsado de todos sus dispositivos y tendrá que volver a iniciar sesión.`)) return;
    try {
      const { data, error } = await supabase.functions.invoke('admin-users', {
        body: { action: 'sign-out-user', user_id: p.user_id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success('Sesión cerrada. El usuario deberá iniciar sesión nuevamente.');
    } catch (e: any) {
      toast.error(e.message || 'No se pudo cerrar la sesión');
    }
  };
  const handleReactivate = async (p: ProfileUser) => {
    if (!await confirmDialog(`¿Reactivar a ${p.nombre || 'este usuario'}? Volverá a contar para el límite del plan.`)) return;
    try {
      const { error } = await supabase.rpc('reactivar_usuario', { p_profile_id: p.id });
      if (error) throw error;
      toast.success('Usuario reactivado');
      reload();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

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
        <PlanSimuladorCard activeUsers={activeUsers} isTrial={isTrial} />
      )}

      {tab === 'usuarios' && (
        <UsuariosTab
          profiles={usuarios.profiles} userRoles={usuarios.userRoles} authUsers={usuarios.authUsers}
          roles={rolesHook.roles} almacenes={usuarios.almacenes}
          activeUsers={activeUsers} maxUsuarios={effectiveMax} availableSlots={availableSlots}
          ownerUserId={empresa?.owner_user_id}
          showArchived={showArchived} setShowArchived={setShowArchived}
          onNewUser={() => usuarios.setShowNewUser(true)}
          onEditUser={usuarios.startEdit}
          onSetPassword={(uid, name) => { usuarios.setPasswordModal({ userId: uid, nombre: name }); usuarios.setNewPassword(''); }}
          onArchive={handleArchive}
          onReactivate={handleReactivate}
          onForceSignOut={handleForceSignOut}
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
          roleSoloPos={rolesHook.roleSoloPos} setRoleSoloPos={rolesHook.setRoleSoloPos}
          onNewRole={rolesHook.openNewRole}
          onCloseRoleForm={rolesHook.resetRoleForm}
          onSaveRole={() => rolesHook.saveRoleWithSoloMovil(reload)}
          onEditRole={rolesHook.openEditRole}
          onToggleActivo={(id, cur) => rolesHook.toggleRoleActivo(id, cur, reload)}
          onTogglePermiso={rolesHook.togglePermiso}
          onToggleMobilePermiso={rolesHook.toggleMobilePermiso}
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
          onCreate={() => usuarios.createUser(availableSlots, effectiveMax)}
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

      {archiveTarget && (
        <ArchiveUserWizard
          user={archiveTarget.user}
          emailLabel={archiveTarget.email}
          activeUsers={usuarios.profiles}
          almacenes={usuarios.almacenes}
          onClose={() => setArchiveTarget(null)}
          onArchived={() => { setArchiveTarget(null); reload(); }}
        />
      )}
    </div>
  );
}
