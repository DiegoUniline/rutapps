import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

interface ProfileUser { id: string; user_id: string; nombre: string | null; almacen_id: string | null; vendedor_id: string | null; telefono: string | null; estado: string; pin_code: string | null; }
interface UserRole { id: string; user_id: string; role_id: string; }
interface Almacen { id: string; nombre: string; }
interface Vendedor { id: string; nombre: string; }
interface AuthUser { id: string; email: string; }

export type { ProfileUser, UserRole, Almacen, Vendedor, AuthUser };

export interface EditForm {
  nombre: string;
  telefono: string;
  estado: string;
  almacen_id: string;
  role_id: string;
  pin_code: string;
}

export interface NewUserForm {
  email: string;
  password: string;
  nombre: string;
  role_id: string;
  almacen_id: string;
}

export function useUsuarios() {
  const { empresa } = useAuth();

  const [profiles, setProfiles] = useState<ProfileUser[]>([]);
  const [userRoles, setUserRoles] = useState<UserRole[]>([]);
  const [almacenes, setAlmacenes] = useState<Almacen[]>([]);
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [authUsers, setAuthUsers] = useState<AuthUser[]>([]);
  const [loading, setLoading] = useState(true);

  // Edit user state
  const [editingUser, setEditingUser] = useState<ProfileUser | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({ nombre: '', telefono: '', estado: 'activo', almacen_id: '', role_id: '', pin_code: '' });
  const [savingUser, setSavingUser] = useState(false);

  // New user state
  const [showNewUser, setShowNewUser] = useState(false);
  const [newUser, setNewUser] = useState<NewUserForm>({ email: '', password: '', nombre: '', role_id: '', almacen_id: '' });
  const [creatingUser, setCreatingUser] = useState(false);
  const [quickCreateRole, setQuickCreateRole] = useState(false);
  const [quickRoleName, setQuickRoleName] = useState('');
  const [quickCreateAlmacen, setQuickCreateAlmacen] = useState(false);
  const [quickAlmacenName, setQuickAlmacenName] = useState('');

  // Password modal state
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

  const loadUsuarios = useCallback(async (showLoader = true) => {
    if (!empresa?.id) return;
    if (showLoader) setLoading(true);
    const [pr, ur, a, v] = await Promise.all([
      supabase.from('profiles').select('id, user_id, nombre, almacen_id, vendedor_id, telefono, estado, pin_code').eq('empresa_id', empresa.id),
      supabase.from('user_roles').select('*'),
      supabase.from('almacenes').select('id, nombre').eq('empresa_id', empresa.id),
      supabase.from('vendedores').select('id, nombre').eq('empresa_id', empresa.id),
    ]);
    setProfiles(pr.data ?? []);
    setUserRoles(ur.data ?? []);
    setAlmacenes(a.data ?? []);
    setVendedores(v.data ?? []);
    await loadAuthUsers();
    if (showLoader) setLoading(false);
    return { profiles: pr.data ?? [], userRoles: ur.data ?? [] };
  }, [empresa?.id, loadAuthUsers]);

  const startEdit = useCallback((p: ProfileUser) => {
    const userRole = userRoles.find(ur => ur.user_id === p.user_id);
    setEditingUser(p);
    setEditForm({ nombre: p.nombre || '', telefono: p.telefono || '', estado: p.estado || 'activo', almacen_id: p.almacen_id || '', role_id: userRole?.role_id || '', pin_code: p.pin_code || '' });
  }, [userRoles]);

  const saveUser = useCallback(async () => {
    if (!editingUser) return;
    setSavingUser(true);
    try {
      await supabase.from('profiles').update({ nombre: editForm.nombre || null, telefono: editForm.telefono || null, estado: editForm.estado, almacen_id: editForm.almacen_id || null, pin_code: editForm.pin_code || null }).eq('id', editingUser.id);
      const existing = userRoles.filter(ur => ur.user_id === editingUser.user_id);
      for (const ur of existing) { await supabase.from('user_roles').delete().eq('id', ur.id); }
      if (editForm.role_id) { await supabase.from('user_roles').insert({ user_id: editingUser.user_id, role_id: editForm.role_id }); }
      toast.success('Usuario actualizado');
      setEditingUser(null);
      loadUsuarios();
    } catch (e: any) { toast.error(e.message); } finally { setSavingUser(false); }
  }, [editingUser, editForm, userRoles, loadUsuarios]);

  const createUser = useCallback(async (availableSlots: number, maxUsuarios: number) => {
    if (!newUser.email || !newUser.password) { toast.error('Email y contraseña son obligatorios'); return; }
    if (newUser.password.length < 6) { toast.error('La contraseña debe tener al menos 6 caracteres'); return; }
    if (!newUser.role_id) { toast.error('Debes seleccionar un rol'); return; }
    if (availableSlots <= 0) {
      toast.error(`Ya alcanzaste el límite de ${maxUsuarios} usuarios de tu plan. Actualiza tu suscripción para agregar más.`);
      return;
    }
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
      setShowNewUser(false);
      setNewUser({ email: '', password: '', nombre: '', role_id: '', almacen_id: '' });
      loadUsuarios();
    } catch (e: any) { toast.error(e.message || 'Error al crear usuario'); } finally { setCreatingUser(false); }
  }, [newUser, authUsers, loadUsuarios]);

  const handleSetPassword = useCallback(async () => {
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
      setPasswordModal(null);
      setNewPassword('');
    } catch (e: any) { toast.error(e.message); } finally { setSettingPassword(false); }
  }, [passwordModal, newPassword]);

  const toggleEstado = useCallback(async (p: ProfileUser, email?: string) => {
    const newEstado = p.estado === 'activo' ? 'baja' : 'activo';
    if (newEstado === 'baja' && !confirm(`¿Dar de baja a ${p.nombre || email}? No podrá acceder al sistema y no generará costo.`)) return;
    await supabase.from('profiles').update({ estado: newEstado }).eq('id', p.id);
    toast.success(newEstado === 'baja' ? 'Usuario dado de baja' : 'Usuario reactivado');
    loadUsuarios();
  }, [loadUsuarios]);

  const quickCreateRoleAction = useCallback(async () => {
    if (!quickRoleName.trim() || !empresa?.id) return;
    const { data } = await supabase.from('roles').insert({ empresa_id: empresa.id, nombre: quickRoleName.trim() }).select('id').single();
    if (data) {
      setNewUser(prev => ({ ...prev, role_id: data.id }));
      toast.success('Rol creado');
      loadUsuarios(false);
    }
    setQuickCreateRole(false);
  }, [quickRoleName, empresa?.id, loadUsuarios]);

  const quickCreateAlmacenAction = useCallback(async () => {
    if (!quickAlmacenName.trim() || !empresa?.id) return;
    const { data } = await supabase.from('almacenes').insert({ empresa_id: empresa.id, nombre: quickAlmacenName.trim() }).select('id').single();
    if (data) {
      setNewUser(prev => ({ ...prev, almacen_id: data.id }));
      toast.success('Almacén creado');
      loadUsuarios(false);
    }
    setQuickCreateAlmacen(false);
  }, [quickAlmacenName, empresa?.id, loadUsuarios]);

  return {
    profiles, userRoles, almacenes, vendedores, authUsers, loading, setLoading,
    editingUser, setEditingUser, editForm, setEditForm, savingUser,
    showNewUser, setShowNewUser, newUser, setNewUser, creatingUser,
    quickCreateRole, setQuickCreateRole, quickRoleName, setQuickRoleName,
    quickCreateAlmacen, setQuickCreateAlmacen, quickAlmacenName, setQuickAlmacenName,
    passwordModal, setPasswordModal, newPassword, setNewPassword, settingPassword,
    loadUsuarios, startEdit, saveUser, createUser, handleSetPassword, toggleEstado,
    quickCreateRoleAction, quickCreateAlmacenAction,
  };
}
