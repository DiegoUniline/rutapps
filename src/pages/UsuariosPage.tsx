import { useState, useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import HelpButton from '@/components/HelpButton';
import { HELP } from '@/lib/helpContent';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useSubscription } from '@/hooks/useSubscription';
import { MODULOS, ACCIONES, getModuloGroups, getModuloAcciones } from '@/hooks/usePermisos';
import { toast } from 'sonner';
import { Plus, Trash2, Edit2, Shield, ChevronDown, ChevronRight, Users, X, KeyRound, UserPlus, AlertTriangle, ToggleLeft, ToggleRight, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

const ACCION_LABELS: Record<string, string> = {
  ver: 'Ver',
  crear: 'Crear',
  editar: 'Editar',
  eliminar: 'Eliminar',
  ver_todos: 'Global',
};

const ACCION_TOOLTIPS: Record<string, string> = {
  ver: 'Puede acceder y ver este módulo',
  crear: 'Puede crear nuevos registros',
  editar: 'Puede modificar registros existentes',
  eliminar: 'Puede eliminar o cancelar registros',
  ver_todos: 'Ve registros de todos los vendedores, no solo los suyos. Ej: un vendedor sin este permiso solo ve sus propias ventas y clientes.',
};

interface Role { id: string; nombre: string; descripcion: string | null; es_sistema: boolean; acceso_ruta_movil: boolean; activo: boolean; solo_movil: boolean; }
interface RolePermiso { id: string; role_id: string; modulo: string; accion: string; permitido: boolean; }
interface ProfileUser { id: string; user_id: string; nombre: string | null; almacen_id: string | null; vendedor_id: string | null; telefono: string | null; estado: string; pin_code: string | null; }
interface UserRole { id: string; user_id: string; role_id: string; }
interface Almacen { id: string; nombre: string; }
interface Vendedor { id: string; nombre: string; }
interface AuthUser { id: string; email: string; }

export default function UsuariosPage() {
  const { empresa } = useAuth();
  const subscription = useSubscription();
  const [tab, setTab] = useState<'usuarios' | 'roles'>('usuarios');
  const [rolesTab, setRolesTab] = useState<'activos' | 'inactivos'>('activos');
  const [roles, setRoles] = useState<Role[]>([]);
  const [permisos, setPermisos] = useState<RolePermiso[]>([]);
  const [profiles, setProfiles] = useState<ProfileUser[]>([]);
  const [userRoles, setUserRoles] = useState<UserRole[]>([]);
  const [almacenes, setAlmacenes] = useState<Almacen[]>([]);
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [authUsers, setAuthUsers] = useState<AuthUser[]>([]);
  const [loading, setLoading] = useState(true);

  // Role form
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [roleName, setRoleName] = useState('');
  const [roleDesc, setRoleDesc] = useState('');
  const [roleMovil, setRoleMovil] = useState(false);
  const [roleSoloMovil, setRoleSoloMovil] = useState(false);
  const [showRoleForm, setShowRoleForm] = useState(false);

  // User edit
  const [editingUser, setEditingUser] = useState<ProfileUser | null>(null);
  const [editForm, setEditForm] = useState({ nombre: '', telefono: '', estado: 'activo', almacen_id: '', role_id: '', pin_code: '' });
  const [savingUser, setSavingUser] = useState(false);

  // New user form
  const [showNewUser, setShowNewUser] = useState(false);
  const [newUser, setNewUser] = useState({ email: '', password: '', nombre: '', role_id: '', almacen_id: '' });
  const [creatingUser, setCreatingUser] = useState(false);
  const [quickCreateRole, setQuickCreateRole] = useState(false);
  const [quickRoleName, setQuickRoleName] = useState('');
  const [quickCreateAlmacen, setQuickCreateAlmacen] = useState(false);
  const [quickAlmacenName, setQuickAlmacenName] = useState('');

  // Password modal
  const [passwordModal, setPasswordModal] = useState<{ userId: string; nombre: string } | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [settingPassword, setSettingPassword] = useState(false);

  const loadAuthUsers = useCallback(async () => {
    try {
      const { data, error } = await supabase.functions.invoke('admin-users', {
        body: { action: 'list-users' },
      });
      if (error) throw error;
      setAuthUsers(data?.users ?? []);
    } catch { /* ignore */ }
  }, []);

  const load = useCallback(async (showLoader = true) => {
    if (!empresa?.id) return;
    if (showLoader) setLoading(true);
    const [r, p, pr, ur, a, v] = await Promise.all([
      supabase.from('roles').select('*').eq('empresa_id', empresa.id).order('nombre'),
      supabase.from('role_permisos').select('*'),
      supabase.from('profiles').select('id, user_id, nombre, almacen_id, vendedor_id, telefono, estado, pin_code').eq('empresa_id', empresa.id),
      supabase.from('user_roles').select('*'),
      supabase.from('almacenes').select('id, nombre').eq('empresa_id', empresa.id),
      supabase.from('vendedores').select('id, nombre').eq('empresa_id', empresa.id),
    ]);
    setRoles(r.data ?? []);
    setPermisos(p.data ?? []);
    setProfiles(pr.data ?? []);
    setUserRoles(ur.data ?? []);
    setAlmacenes(a.data ?? []);
    setVendedores(v.data ?? []);
    await loadAuthUsers();
    setLoading(false);
  }, [empresa?.id, loadAuthUsers]);

  useEffect(() => { load(); }, [load]);

  // ── Role CRUD ──
  const saveRole = async () => {
    if (!roleName.trim() || !empresa?.id) return;
    try {
      if (editingRole) {
        await supabase.from('roles').update({ nombre: roleName, descripcion: roleDesc || null, acceso_ruta_movil: roleMovil }).eq('id', editingRole.id);
      } else {
        await supabase.from('roles').insert({ empresa_id: empresa.id, nombre: roleName, descripcion: roleDesc || null, acceso_ruta_movil: roleMovil });
      }
      toast.success('Rol guardado');
      setShowRoleForm(false); setEditingRole(null); setRoleName(''); setRoleDesc(''); setRoleMovil(false); setRoleSoloMovil(false);
      load();
    } catch (e: any) { toast.error(e.message); }
  };

  const saveRoleWithSoloMovil = async () => {
    if (!roleName.trim() || !empresa?.id) return;
    try {
      let roleId = editingRole?.id;
      const roleData = {
        nombre: roleName,
        descripcion: roleDesc || null,
        acceso_ruta_movil: roleMovil || roleSoloMovil,
        solo_movil: roleSoloMovil,
      };
      if (editingRole) {
        await supabase.from('roles').update(roleData).eq('id', editingRole.id);
      } else {
        const { data } = await supabase.from('roles').insert({ empresa_id: empresa.id, ...roleData }).select('id').single();
        roleId = data?.id;
      }
      // Also set the solo_movil permission for the permission system
      if (roleId && roleSoloMovil) {
        const existing = permisos.find(p => p.role_id === roleId && p.modulo === 'solo_movil' && p.accion === 'ver');
        if (existing) {
          await supabase.from('role_permisos').update({ permitido: true }).eq('id', existing.id);
        } else {
          await supabase.from('role_permisos').insert({ role_id: roleId, modulo: 'solo_movil', accion: 'ver', permitido: true });
        }
      } else if (roleId && !roleSoloMovil) {
        const existing = permisos.find(p => p.role_id === roleId && p.modulo === 'solo_movil' && p.accion === 'ver');
        if (existing) {
          await supabase.from('role_permisos').update({ permitido: false }).eq('id', existing.id);
        }
      }
      toast.success('Rol guardado');
      setShowRoleForm(false); setEditingRole(null); setRoleName(''); setRoleDesc(''); setRoleMovil(false); setRoleSoloMovil(false);
      load();
      notifyPermisosChanged();
    } catch (e: any) { toast.error(e.message); }
  };

  const toggleRoleActivo = async (id: string, currentActivo: boolean) => {
    const newVal = !currentActivo;
    await supabase.from('roles').update({ activo: newVal }).eq('id', id);
    toast.success(newVal ? 'Rol reactivado' : 'Rol dado de baja');
    load();
  };

  const qc = useQueryClient();
  const notifyPermisosChanged = () => {
    qc.invalidateQueries({ queryKey: ['user-permisos'] });
    window.dispatchEvent(new Event('uniline:permisos-changed'));
  };
  const togglePermiso = async (roleId: string, modulo: string, accion: string) => {
    const existing = permisos.find(p => p.role_id === roleId && p.modulo === modulo && p.accion === accion);
    if (existing) {
      setPermisos(prev => prev.map(p => p.id === existing.id ? { ...p, permitido: !p.permitido } : p));
      await supabase.from('role_permisos').update({ permitido: !existing.permitido }).eq('id', existing.id);
    } else {
      const tempId = `temp-${Date.now()}`;
      setPermisos(prev => [...prev, { id: tempId, role_id: roleId, modulo, accion, permitido: true }]);
      const { data } = await supabase.from('role_permisos').insert({ role_id: roleId, modulo, accion, permitido: true }).select().single();
      if (data) {
        setPermisos(prev => prev.map(p => p.id === tempId ? data : p));
      }
    }
    notifyPermisosChanged();
  };

  const [savingPermisos, setSavingPermisos] = useState(false);

  const toggleAllGroup = async (roleId: string, group: string) => {
    if (savingPermisos) return;
    setSavingPermisos(true);
    try {
      // Fetch fresh permisos from DB to avoid stale/temp IDs
      const { data: freshPermisos } = await supabase.from('role_permisos').select('*').eq('role_id', roleId);
      const fresh = freshPermisos ?? [];

      const groupMods = MODULOS.filter(m => m.group === group && m.id !== 'solo_movil');
      const allChecked = groupMods.every(mod => {
        const modActions = getModuloAcciones(mod.id);
        return modActions.every(a => fresh.find(p => p.modulo === mod.id && p.accion === a)?.permitido);
      });
      const newVal = !allChecked;

      const ops: PromiseLike<any>[] = [];
      for (const mod of groupMods) {
        const modActions = getModuloAcciones(mod.id);
        for (const accion of modActions) {
          const existing = fresh.find(p => p.modulo === mod.id && p.accion === accion);
          if (existing) {
            ops.push(supabase.from('role_permisos').update({ permitido: newVal }).eq('id', existing.id).select());
          } else {
            ops.push(supabase.from('role_permisos').insert({ role_id: roleId, modulo: mod.id, accion, permitido: newVal }).select());
          }
        }
      }
      await Promise.all(ops);
      await load(false);
      notifyPermisosChanged();
    } finally {
      setSavingPermisos(false);
    }
  };

  const toggleAllModule = async (roleId: string, modulo: string) => {
    if (savingPermisos) return;
    setSavingPermisos(true);
    try {
      // Fetch fresh permisos from DB to avoid stale/temp IDs
      const { data: freshPermisos } = await supabase.from('role_permisos').select('*').eq('role_id', roleId).eq('modulo', modulo);
      const fresh = freshPermisos ?? [];

      const modActions = getModuloAcciones(modulo);
      const allEnabled = modActions.every(a => fresh.find(p => p.accion === a)?.permitido);
      const newVal = !allEnabled;

      const ops: PromiseLike<any>[] = [];
      for (const accion of modActions) {
        const existing = fresh.find(p => p.accion === accion);
        if (existing) {
          ops.push(supabase.from('role_permisos').update({ permitido: newVal }).eq('id', existing.id).select());
        } else {
          ops.push(supabase.from('role_permisos').insert({ role_id: roleId, modulo, accion, permitido: newVal }).select());
        }
      }
      await Promise.all(ops);
      await load(false);
      notifyPermisosChanged();
    } finally {
      setSavingPermisos(false);
    }
  };

  // ── User edit ──
  const startEdit = (p: ProfileUser) => {
    const userRole = userRoles.find(ur => ur.user_id === p.user_id);
    setEditingUser(p);
    setEditForm({ nombre: p.nombre || '', telefono: p.telefono || '', estado: p.estado || 'activo', almacen_id: p.almacen_id || '', role_id: userRole?.role_id || '', pin_code: p.pin_code || '' });
  };

  const saveUser = async () => {
    if (!editingUser) return;
    setSavingUser(true);
    try {
      await supabase.from('profiles').update({ nombre: editForm.nombre || null, telefono: editForm.telefono || null, estado: editForm.estado, almacen_id: editForm.almacen_id || null, pin_code: editForm.pin_code || null }).eq('id', editingUser.id);
      const existing = userRoles.filter(ur => ur.user_id === editingUser.user_id);
      for (const ur of existing) { await supabase.from('user_roles').delete().eq('id', ur.id); }
      if (editForm.role_id) { await supabase.from('user_roles').insert({ user_id: editingUser.user_id, role_id: editForm.role_id }); }
      toast.success('Usuario actualizado'); setEditingUser(null); load();
    } catch (e: any) { toast.error(e.message); } finally { setSavingUser(false); }
  };

  // ── Create user ──
  const activeUsers = profiles.filter(p => p.estado === 'activo').length;
  const availableSlots = subscription.maxUsuarios - activeUsers;
  const displayRoles = rolesTab === 'activos' ? roles.filter(r => r.activo !== false) : roles.filter(r => r.activo === false);
  // Only show active roles in user role selector
  const activeRoles = roles.filter(r => r.activo !== false);

  const createUser = async () => {
    if (!newUser.email || !newUser.password) { toast.error('Email y contraseña son obligatorios'); return; }
    if (newUser.password.length < 6) { toast.error('La contraseña debe tener al menos 6 caracteres'); return; }
    if (!newUser.role_id) { toast.error('Debes seleccionar un rol'); return; }
    if (availableSlots <= 0) {
      toast.error(`Ya alcanzaste el límite de ${subscription.maxUsuarios} usuarios de tu plan. Actualiza tu suscripción para agregar más.`);
      return;
    }
    // Client-side duplicate check
    const emailLower = newUser.email.trim().toLowerCase();
    const existingAuth = authUsers.find(u => u.email?.toLowerCase() === emailLower);
    if (existingAuth) {
      toast.error('Este correo electrónico ya está registrado. Por favor usa otro correo.');
      return;
    }
    setCreatingUser(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-users', {
        body: { action: 'create-user', email: newUser.email, password: newUser.password, nombre: newUser.nombre, role_id: newUser.role_id, almacen_id: newUser.almacen_id || null },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success('Usuario creado exitosamente');
      setShowNewUser(false); setNewUser({ email: '', password: '', nombre: '', role_id: '', almacen_id: '' });
      load();
    } catch (e: any) { toast.error(e.message || 'Error al crear usuario'); } finally { setCreatingUser(false); }
  };

  // ── Set password ──
  const handleSetPassword = async () => {
    if (!passwordModal || !newPassword) return;
    if (newPassword.length < 6) { toast.error('Mínimo 6 caracteres'); return; }
    setSettingPassword(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-users', {
        body: { action: 'set-password', user_id: passwordModal.userId, password: newPassword },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success('Contraseña actualizada');
      setPasswordModal(null); setNewPassword('');
    } catch (e: any) { toast.error(e.message); } finally { setSettingPassword(false); }
  };

  const estadoBadge = (estado: string) => {
    switch (estado) {
      case 'activo': return 'bg-success/10 text-success';
      case 'baja': return 'bg-destructive/10 text-destructive';
      default: return 'bg-card/50 text-muted-foreground';
    }
  };

  if (loading) return <div className="p-6 text-muted-foreground text-sm">Cargando...</div>;

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
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground">
                <Users className="h-3.5 w-3.5 inline mr-1" />
                {activeUsers} / {subscription.maxUsuarios} usuarios activos
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
              onClick={() => setShowNewUser(true)}
              disabled={availableSlots <= 0}
              className={cn("btn-odoo-primary text-xs", availableSlots <= 0 && "opacity-50 cursor-not-allowed")}
            >
              <UserPlus className="h-3.5 w-3.5 mr-1" /> Nuevo usuario
            </button>
          </div>

          {/* User creation modal */}
          {showNewUser && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
              <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-auto">
                <div className="flex items-center justify-between p-5 border-b border-border">
                  <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                    <UserPlus className="h-4 w-4 text-primary" /> Crear nuevo usuario
                  </h3>
                  <button onClick={() => setShowNewUser(false)} className="p-1.5 rounded-md hover:bg-muted"><X className="h-4 w-4 text-muted-foreground" /></button>
                </div>
                <div className="p-5 space-y-4">
                  <div>
                    <label className="label-odoo">Nombre</label>
                    <input className="input-odoo w-full" value={newUser.nombre} onChange={e => setNewUser({ ...newUser, nombre: e.target.value })} placeholder="Nombre completo" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="label-odoo">Email (usuario) <span className="text-destructive">*</span></label>
                      <input className="input-odoo w-full" type="email" value={newUser.email} onChange={e => setNewUser({ ...newUser, email: e.target.value })} placeholder="correo@ejemplo.com" />
                    </div>
                    <div>
                      <label className="label-odoo">Contraseña inicial <span className="text-destructive">*</span></label>
                      <input className="input-odoo w-full" type="text" value={newUser.password} onChange={e => setNewUser({ ...newUser, password: e.target.value })} placeholder="Mínimo 6 caracteres" />
                    </div>
                  </div>

                  {/* Rol with quick-create */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="label-odoo mb-0">Rol <span className="text-destructive">*</span></label>
                      <button type="button" onClick={() => { setQuickCreateRole(true); setQuickRoleName(''); }}
                        className="text-[11px] text-primary hover:underline flex items-center gap-0.5">
                        <Plus className="h-3 w-3" /> Crear rol
                      </button>
                    </div>
                    {quickCreateRole ? (
                      <div className="flex gap-2">
                        <input className="input-odoo flex-1 text-sm" value={quickRoleName} onChange={e => setQuickRoleName(e.target.value)}
                          placeholder="Nombre del nuevo rol" autoFocus />
                        <button onClick={async () => {
                          if (!quickRoleName.trim() || !empresa?.id) return;
                          const { data } = await supabase.from('roles').insert({ empresa_id: empresa.id, nombre: quickRoleName.trim() }).select('id').single();
                          if (data) {
                            setNewUser({ ...newUser, role_id: data.id });
                            toast.success('Rol creado');
                            load(false);
                          }
                          setQuickCreateRole(false);
                        }} className="btn-odoo-primary text-xs px-3">Crear</button>
                        <button onClick={() => setQuickCreateRole(false)} className="btn-odoo text-xs">✕</button>
                      </div>
                    ) : (
                      <select className="input-odoo w-full" value={newUser.role_id} onChange={e => setNewUser({ ...newUser, role_id: e.target.value })}>
                        <option value="">Seleccionar rol...</option>
                        {activeRoles.map(r => (
                          <option key={r.id} value={r.id}>{r.nombre}{r.acceso_ruta_movil ? ' 📱' : ''}</option>
                        ))}
                      </select>
                    )}
                    {/* Vendedor hint */}
                    {newUser.role_id && activeRoles.find(r => r.id === newUser.role_id)?.acceso_ruta_movil && (
                      <p className="text-[11px] text-success mt-1 flex items-center gap-1">
                        📱 Este rol tiene acceso a la vista móvil de ruta
                      </p>
                    )}
                  </div>

                  {/* Almacén with quick-create */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="label-odoo mb-0">Almacén de trabajo</label>
                      <button type="button" onClick={() => { setQuickCreateAlmacen(true); setQuickAlmacenName(''); }}
                        className="text-[11px] text-primary hover:underline flex items-center gap-0.5">
                        <Plus className="h-3 w-3" /> Crear almacén
                      </button>
                    </div>
                    {quickCreateAlmacen ? (
                      <div className="flex gap-2">
                        <input className="input-odoo flex-1 text-sm" value={quickAlmacenName} onChange={e => setQuickAlmacenName(e.target.value)}
                          placeholder="Nombre del nuevo almacén" autoFocus />
                        <button onClick={async () => {
                          if (!quickAlmacenName.trim() || !empresa?.id) return;
                          const { data } = await supabase.from('almacenes').insert({ empresa_id: empresa.id, nombre: quickAlmacenName.trim() }).select('id').single();
                          if (data) {
                            setNewUser({ ...newUser, almacen_id: data.id });
                            toast.success('Almacén creado');
                            load(false);
                          }
                          setQuickCreateAlmacen(false);
                        }} className="btn-odoo-primary text-xs px-3">Crear</button>
                        <button onClick={() => setQuickCreateAlmacen(false)} className="btn-odoo text-xs">✕</button>
                      </div>
                    ) : (
                      <select className="input-odoo w-full" value={newUser.almacen_id} onChange={e => setNewUser({ ...newUser, almacen_id: e.target.value })}>
                        <option value="">Sin almacén asignado</option>
                        {almacenes.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                      </select>
                    )}
                  </div>
                </div>

                <div className="p-5 border-t border-border flex gap-2 justify-end">
                  <button onClick={() => setShowNewUser(false)} className="btn-odoo text-sm">Cancelar</button>
                  <button onClick={createUser} disabled={creatingUser} className="btn-odoo-primary text-sm">
                    {creatingUser ? 'Creando...' : 'Crear usuario'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Edit user modal */}
          {editingUser && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
              <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-auto">
                <div className="flex items-center justify-between p-5 border-b border-border">
                  <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                    <Edit2 className="h-4 w-4 text-primary" /> Editar usuario
                  </h3>
                  <button onClick={() => setEditingUser(null)} className="p-1.5 rounded-md hover:bg-muted"><X className="h-4 w-4 text-muted-foreground" /></button>
                </div>
                <div className="p-5 space-y-4">
                  <div className="text-xs text-muted-foreground bg-accent/30 rounded-lg px-3 py-2">
                    {authUsers.find(au => au.id === editingUser.user_id)?.email || '—'}
                  </div>
                  <div>
                    <label className="label-odoo">Nombre</label>
                    <input className="input-odoo w-full" value={editForm.nombre} onChange={e => setEditForm({ ...editForm, nombre: e.target.value })} placeholder="Nombre completo" />
                  </div>
                  <div>
                    <label className="label-odoo">Teléfono</label>
                    <input className="input-odoo w-full" value={editForm.telefono} onChange={e => setEditForm({ ...editForm, telefono: e.target.value })} placeholder="10 dígitos" />
                  </div>
                  <div>
                    <label className="label-odoo">Rol</label>
                    {empresa?.owner_user_id === editingUser.user_id ? (
                      <div className="input-odoo w-full bg-accent/30 text-muted-foreground cursor-not-allowed flex items-center gap-2">
                        <Shield className="h-3.5 w-3.5 text-primary" />
                        {roles.find(r => r.id === editForm.role_id)?.nombre || 'Administrador'}
                        <span className="text-[10px] text-primary ml-auto">Dueño — no modificable</span>
                      </div>
                    ) : (
                      <>
                        <select className="input-odoo w-full" value={editForm.role_id} onChange={e => setEditForm({ ...editForm, role_id: e.target.value })}>
                          <option value="">Sin rol</option>
                          {activeRoles.map(r => <option key={r.id} value={r.id}>{r.nombre}{r.acceso_ruta_movil ? ' 📱' : ''}</option>)}
                        </select>
                        {editForm.role_id && activeRoles.find(r => r.id === editForm.role_id)?.acceso_ruta_movil && (
                          <p className="text-[11px] text-success mt-1">📱 Este rol tiene acceso a la vista móvil de ruta</p>
                        )}
                      </>
                    )}
                  </div>
                  <div>
                    <label className="label-odoo">Almacén de trabajo</label>
                    <select className="input-odoo w-full" value={editForm.almacen_id} onChange={e => setEditForm({ ...editForm, almacen_id: e.target.value })}>
                      <option value="">Sin almacén asignado</option>
                      {almacenes.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label-odoo">Estado</label>
                    {empresa?.owner_user_id === editingUser.user_id ? (
                      <div className="input-odoo w-full bg-accent/30 text-muted-foreground cursor-not-allowed">
                        ✅ Activo <span className="text-[10px] text-primary ml-2">Dueño — siempre activo</span>
                      </div>
                    ) : (
                      <>
                        <select className="input-odoo w-full" value={editForm.estado} onChange={e => setEditForm({ ...editForm, estado: e.target.value })}>
                          <option value="activo">✅ Activo</option>
                          <option value="baja">🚫 Baja (no puede acceder)</option>
                        </select>
                        {editForm.estado === 'baja' && (
                          <p className="text-[11px] text-destructive mt-1">Este usuario no podrá iniciar sesión y no generará costo en tu plan.</p>
                        )}
                      </>
                    )}
                  </div>
                  <div>
                    <label className="label-odoo flex items-center gap-1.5">
                      <ShieldCheck className="h-3.5 w-3.5 text-primary" /> PIN de autorización (4 dígitos)
                    </label>
                    <input
                      className="input-odoo w-full font-mono tracking-[0.5em] text-center"
                      type="text"
                      inputMode="numeric"
                      maxLength={4}
                      value={editForm.pin_code}
                      onChange={e => {
                        const v = e.target.value.replace(/\D/g, '').slice(0, 4);
                        setEditForm({ ...editForm, pin_code: v });
                      }}
                      placeholder="••••"
                    />
                    <p className="text-[11px] text-muted-foreground mt-1">Se usará para autorizar operaciones sensibles (cancelar ventas, reabrir conteos, etc.)</p>
                  </div>
                </div>
                <div className="p-5 border-t border-border flex gap-2 justify-end">
                  <button onClick={() => setEditingUser(null)} className="btn-odoo text-sm">Cancelar</button>
                  <button onClick={saveUser} disabled={savingUser} className="btn-odoo-primary text-sm">
                    {savingUser ? 'Guardando...' : 'Guardar cambios'}
                  </button>
                </div>
              </div>
            </div>
          )}

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
                  const isOwnerUser = empresa?.owner_user_id === p.user_id;
                  return (
                    <tr key={p.id} className="border-b border-border last:border-0 hover:bg-accent/30 cursor-pointer" onClick={() => startEdit(p)}>
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
                          <button onClick={() => startEdit(p)} className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground" title="Editar"><Edit2 className="h-3.5 w-3.5" /></button>
                          <button onClick={() => { setPasswordModal({ userId: p.user_id, nombre: p.nombre || authUser?.email || '' }); setNewPassword(''); }} className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground" title="Cambiar contraseña"><KeyRound className="h-3.5 w-3.5" /></button>
                          {!isOwnerUser && (
                            <button
                              onClick={async () => {
                                const newEstado = p.estado === 'activo' ? 'baja' : 'activo';
                                if (newEstado === 'baja' && !confirm(`¿Dar de baja a ${p.nombre || authUser?.email}? No podrá acceder al sistema y no generará costo.`)) return;
                                await supabase.from('profiles').update({ estado: newEstado }).eq('id', p.id);
                                toast.success(newEstado === 'baja' ? 'Usuario dado de baja' : 'Usuario reactivado');
                                load();
                              }}
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
      )}

      {tab === 'roles' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex gap-1 border-b border-border">
              <button
                onClick={() => setRolesTab('activos')}
                className={cn("px-4 py-2 text-sm font-medium border-b-2 transition-colors", rolesTab === 'activos' ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}
              >
                Activos ({roles.filter(r => r.activo !== false).length})
              </button>
              <button
                onClick={() => setRolesTab('inactivos')}
                className={cn("px-4 py-2 text-sm font-medium border-b-2 transition-colors", rolesTab === 'inactivos' ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}
              >
                Inactivos ({roles.filter(r => r.activo === false).length})
              </button>
            </div>
            <button onClick={() => { setShowRoleForm(true); setEditingRole(null); setRoleName(''); setRoleDesc(''); setRoleMovil(false); }} className="btn-odoo-primary text-xs">
              <Plus className="h-3.5 w-3.5 mr-1" /> Nuevo rol
            </button>
          </div>
          {showRoleForm && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
              <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-md">
                <div className="flex items-center justify-between p-5 border-b border-border">
                  <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                    <Shield className="h-4 w-4 text-primary" /> {editingRole ? 'Editar rol' : 'Nuevo rol'}
                  </h3>
                  <button onClick={() => { setShowRoleForm(false); setEditingRole(null); }} className="p-1.5 rounded-md hover:bg-muted"><X className="h-4 w-4 text-muted-foreground" /></button>
                </div>
                <div className="p-5 space-y-4">
                  <div>
                    <label className="label-odoo">Nombre del rol</label>
                    <input className="input-odoo w-full" value={roleName} onChange={e => setRoleName(e.target.value)} placeholder="Ej: Vendedor, Supervisor..." autoFocus />
                  </div>
                  <div>
                    <label className="label-odoo">Descripción (opcional)</label>
                    <input className="input-odoo w-full" value={roleDesc} onChange={e => setRoleDesc(e.target.value)} placeholder="Breve descripción del rol" />
                  </div>

                  {/* Tipo de acceso */}
                  <div>
                    <label className="label-odoo mb-2">Tipo de acceso</label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => { setRoleMovil(false); setRoleSoloMovil(false); }}
                        className={cn(
                          "flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all text-center",
                          !roleSoloMovil
                            ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                            : "border-border hover:border-muted-foreground/30"
                        )}
                      >
                        <Shield className={cn("h-6 w-6", !roleSoloMovil ? "text-primary" : "text-muted-foreground")} />
                        <span className={cn("text-sm font-semibold", !roleSoloMovil ? "text-primary" : "text-foreground")}>Acceso general</span>
                        <span className="text-[11px] text-muted-foreground leading-tight">Escritorio + móvil. Configura permisos detallados.</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => { setRoleSoloMovil(true); setRoleMovil(true); }}
                        className={cn(
                          "flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all text-center",
                          roleSoloMovil
                            ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                            : "border-border hover:border-muted-foreground/30"
                        )}
                      >
                        <span className={cn("text-2xl", roleSoloMovil ? "" : "grayscale opacity-60")}>📱</span>
                        <span className={cn("text-sm font-semibold", roleSoloMovil ? "text-primary" : "text-foreground")}>Solo vista móvil</span>
                        <span className="text-[11px] text-muted-foreground leading-tight">Solo accede a la app de ruta. Sin permisos de escritorio.</span>
                      </button>
                    </div>
                  </div>

                  {!roleSoloMovil && (
                    <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer bg-accent/30 rounded-lg px-3 py-2.5">
                      <input type="checkbox" checked={roleMovil} onChange={e => setRoleMovil(e.target.checked)} className="rounded border-border" />
                      <span>También tiene acceso a ruta móvil</span>
                    </label>
                  )}
                </div>
                <div className="p-5 border-t border-border flex gap-2 justify-end">
                  <button onClick={() => { setShowRoleForm(false); setEditingRole(null); }} className="btn-odoo text-sm">Cancelar</button>
                  <button onClick={saveRoleWithSoloMovil} className="btn-odoo-primary text-sm">Guardar</button>
                </div>
              </div>
            </div>
          )}
          {displayRoles.map(role => (
            <RoleCard key={role.id} role={role} permisos={permisos.filter(p => p.role_id === role.id)}
              disabled={savingPermisos}
              onEdit={() => {
                setEditingRole(role); setRoleName(role.nombre); setRoleDesc(role.descripcion || ''); setRoleMovil(role.acceso_ruta_movil);
                const isSoloMovil = role.solo_movil || permisos.filter(p => p.role_id === role.id).some(p => p.modulo === 'solo_movil' && p.accion === 'ver' && p.permitido);
                setRoleSoloMovil(isSoloMovil);
                setShowRoleForm(true);
              }}
              onToggleActivo={() => toggleRoleActivo(role.id, role.activo !== false)}
              onTogglePermiso={(mod, acc) => togglePermiso(role.id, mod, acc)}
              onToggleAll={(mod) => toggleAllModule(role.id, mod)}
              onToggleGroup={(group) => toggleAllGroup(role.id, group)} />
          ))}
          {roles.length === 0 && !showRoleForm && <div className="text-center py-12 text-muted-foreground text-sm">No hay roles creados. Crea uno para empezar a asignar permisos.</div>}
        </div>
      )}

      {/* Password modal */}
      {passwordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-card border border-border rounded-lg p-5 w-full max-w-sm space-y-4 shadow-lg">
            <h3 className="text-sm font-semibold text-foreground">Cambiar contraseña</h3>
            <p className="text-xs text-muted-foreground">Usuario: <strong>{passwordModal.nombre}</strong></p>
            <div>
              <label className="label-odoo">Nueva contraseña</label>
              <input className="input-odoo" type="text" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Mínimo 6 caracteres" autoFocus />
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setPasswordModal(null)} className="btn-odoo text-xs">Cancelar</button>
              <button onClick={handleSetPassword} disabled={settingPassword} className="btn-odoo-primary text-xs">{settingPassword ? 'Guardando...' : 'Guardar contraseña'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function RoleCard({ role, permisos, disabled, onEdit, onToggleActivo, onTogglePermiso, onToggleAll, onToggleGroup }: {
  role: Role; permisos: RolePermiso[]; disabled?: boolean; onEdit: () => void; onToggleActivo: () => void;
  onTogglePermiso: (mod: string, acc: string) => void; onToggleAll: (mod: string) => void;
  onToggleGroup: (group: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const groups = getModuloGroups();
  const isInactive = role.activo === false;
  const isSoloMovil = role.solo_movil || permisos.some(p => p.modulo === 'solo_movil' && p.accion === 'ver' && p.permitido);
  const displayModulos = MODULOS.filter(m => m.id !== 'solo_movil');

  return (
    <div className={cn("bg-card border border-border rounded-lg overflow-hidden", isInactive && "opacity-60")}>
      <div className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-accent/30" onClick={() => !isSoloMovil && setOpen(!open)}>
        <div className="flex items-center gap-3">
          {!isSoloMovil && (open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />)}
          <Shield className="h-4 w-4 text-primary" />
          <div>
            <span className="text-sm font-semibold text-foreground">{role.nombre}</span>
            {role.descripcion && <span className="text-xs text-muted-foreground ml-2">{role.descripcion}</span>}
            {isSoloMovil && <span className="ml-2 text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-semibold">📱 Solo vista móvil</span>}
            {!isSoloMovil && role.acceso_ruta_movil && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-success/10 text-success font-medium">Ruta móvil</span>}
            {isInactive && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-destructive/10 text-destructive font-medium">Inactivo</span>}
          </div>
        </div>
        <div className="flex gap-1" onClick={e => e.stopPropagation()}>
          <button onClick={onEdit} className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground" title="Editar"><Edit2 className="h-3.5 w-3.5" /></button>
          <button onClick={onToggleActivo} className={cn("p-1.5 rounded", isInactive ? "hover:bg-success/10 text-success" : "hover:bg-destructive/10 text-muted-foreground hover:text-destructive")} title={isInactive ? 'Reactivar' : 'Dar de baja'}>
            {isInactive ? <ToggleRight className="h-3.5 w-3.5" /> : <ToggleLeft className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>
      {isSoloMovil && (
        <div className="border-t border-border px-4 py-3 bg-accent/20">
          <p className="text-xs text-muted-foreground">Este rol solo tiene acceso a la aplicación móvil de ruta. No requiere configuración de permisos de escritorio.</p>
        </div>
      )}
      {open && !isSoloMovil && (
        <div className="border-t border-border overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr className="bg-accent/30">
              <th className="text-left px-4 py-2 font-semibold text-foreground w-48">Módulo</th>
              {ACCIONES.map(a => (
                <th key={a} className="text-center px-2 py-2 font-semibold text-foreground w-16" title={ACCION_TOOLTIPS[a] || ''}>
                  <span className="capitalize">{ACCION_LABELS[a] || a}</span>
                </th>
              ))}
              <th className="text-center px-2 py-2 font-semibold text-foreground w-16">Todo</th>
            </tr></thead>
            <tbody>
              {groups.map(group => {
                const groupMods = displayModulos.filter(m => m.group === group);
                if (groupMods.length === 0) return null;
                const groupPerms = permisos.filter(p => groupMods.some(m => m.id === p.modulo));
                const allGroupChecked = groupMods.every(mod => {
                  const modActions = getModuloAcciones(mod.id);
                  return modActions.every(a => groupPerms.find(p => p.modulo === mod.id && p.accion === a)?.permitido);
                });

                return (
                  <GroupRows
                    key={group}
                    group={group}
                    mods={groupMods}
                    permisos={permisos}
                    allGroupChecked={allGroupChecked}
                    disabled={disabled}
                    onTogglePermiso={onTogglePermiso}
                    onToggleAll={onToggleAll}
                    onToggleGroup={onToggleGroup}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function GroupRows({ group, mods, permisos, allGroupChecked, disabled, onTogglePermiso, onToggleAll, onToggleGroup }: {
  group: string;
  mods: { id: string; label: string; group: string }[];
  permisos: RolePermiso[];
  allGroupChecked: boolean;
  disabled?: boolean;
  onTogglePermiso: (mod: string, acc: string) => void;
  onToggleAll: (mod: string) => void;
  onToggleGroup: (group: string) => void;
}) {
  return (
    <>
      {/* Group header row */}
      <tr className="bg-accent/50 border-t border-border">
        <td className="px-4 py-2 font-bold text-foreground text-[13px]">{group}</td>
        {ACCIONES.map(a => <td key={a} className="text-center px-2 py-2"></td>)}
        <td className="text-center px-2 py-2">
          <input type="checkbox" checked={allGroupChecked} disabled={disabled} onChange={() => onToggleGroup(group)} className="rounded border-border cursor-pointer disabled:opacity-50 disabled:cursor-wait" title={`Todos los permisos de ${group}`} />
        </td>
      </tr>
      {/* Sub-module rows */}
      {mods.map(mod => {
        const modPerms = permisos.filter(p => p.modulo === mod.id);
        const applicableActions = getModuloAcciones(mod.id);
        const allChecked = applicableActions.every(a => modPerms.find(p => p.accion === a)?.permitido);
        return (
          <tr key={mod.id} className="border-t border-border/30 hover:bg-accent/20">
            <td className="px-4 py-1.5 pl-8 text-muted-foreground">{mod.label}</td>
            {ACCIONES.map(acc => {
              const isApplicable = applicableActions.includes(acc);
              if (!isApplicable) {
                return <td key={acc} className="text-center px-2 py-1.5"><span className="text-muted-foreground/30">—</span></td>;
              }
              const perm = modPerms.find(p => p.accion === acc);
              return (
                <td key={acc} className="text-center px-2 py-1.5">
                  <input type="checkbox" checked={perm?.permitido ?? false} disabled={disabled} onChange={() => onTogglePermiso(mod.id, acc)} className="rounded border-border cursor-pointer disabled:opacity-50 disabled:cursor-wait" />
                </td>
              );
            })}
            <td className="text-center px-2 py-1.5">
              <input type="checkbox" checked={allChecked} disabled={disabled} onChange={() => onToggleAll(mod.id)} className="rounded border-border cursor-pointer disabled:opacity-50 disabled:cursor-wait" />
            </td>
          </tr>
        );
      })}
    </>
  );
}
