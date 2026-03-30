import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { MODULOS, getModuloGroups, getModuloAcciones } from '@/hooks/usePermisos';
import { toast } from 'sonner';

interface Role { id: string; nombre: string; descripcion: string | null; es_sistema: boolean; acceso_ruta_movil: boolean; activo: boolean; solo_movil: boolean; }
interface RolePermiso { id: string; role_id: string; modulo: string; accion: string; permitido: boolean; }

export type { Role, RolePermiso };

export function useRoles() {
  const { empresa } = useAuth();
  const qc = useQueryClient();

  const [roles, setRoles] = useState<Role[]>([]);
  const [permisos, setPermisos] = useState<RolePermiso[]>([]);
  const [savingPermisos, setSavingPermisos] = useState(false);

  // Role form state
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [roleName, setRoleName] = useState('');
  const [roleDesc, setRoleDesc] = useState('');
  const [roleMovil, setRoleMovil] = useState(false);
  const [roleSoloMovil, setRoleSoloMovil] = useState(false);
  const [showRoleForm, setShowRoleForm] = useState(false);
  const [rolesTab, setRolesTab] = useState<'activos' | 'inactivos'>('activos');

  const notifyPermisosChanged = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['user-permisos'] });
    window.dispatchEvent(new Event('uniline:permisos-changed'));
  }, [qc]);

  const loadRoles = useCallback(async (empresaId: string) => {
    const { data: r } = await supabase.from('roles').select('*').eq('empresa_id', empresaId).order('nombre');
    const roleIds = (r ?? []).map(role => role.id);
    let allPermisos: RolePermiso[] = [];
    if (roleIds.length > 0) {
      const { data: p } = await supabase.from('role_permisos').select('*').in('role_id', roleIds);
      allPermisos = p ?? [];
    }
    setRoles(r ?? []);
    setPermisos(allPermisos);
    return { roles: r ?? [], permisos: allPermisos };
  }, []);

  const resetRoleForm = useCallback(() => {
    setShowRoleForm(false);
    setEditingRole(null);
    setRoleName('');
    setRoleDesc('');
    setRoleMovil(false);
    setRoleSoloMovil(false);
  }, []);

  const saveRoleWithSoloMovil = useCallback(async (reload: () => void) => {
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
      resetRoleForm();
      reload();
      notifyPermisosChanged();
    } catch (e: any) { toast.error(e.message); }
  }, [roleName, roleDesc, roleMovil, roleSoloMovil, editingRole, empresa?.id, permisos, resetRoleForm, notifyPermisosChanged]);

  const toggleRoleActivo = useCallback(async (id: string, currentActivo: boolean, reload: () => void) => {
    const newVal = !currentActivo;
    await supabase.from('roles').update({ activo: newVal }).eq('id', id);
    toast.success(newVal ? 'Rol reactivado' : 'Rol dado de baja');
    reload();
  }, []);

  const togglePermiso = useCallback((roleId: string, modulo: string, accion: string) => {
    if (savingPermisos) return;
    const key = (p: RolePermiso) => p.role_id === roleId && p.modulo === modulo && p.accion === accion;
    const current = permisos.find(key)?.permitido ?? false;
    const permitido = !current;

    setPermisos(prev => {
      const i = prev.findIndex(key);
      if (i >= 0) return prev.map((p, idx) => idx === i ? { ...p, permitido } : p);
      return [...prev, { id: `${roleId}:${modulo}:${accion}`, role_id: roleId, modulo, accion, permitido }];
    });

    void supabase
      .from('role_permisos')
      .upsert({ role_id: roleId, modulo, accion, permitido }, { onConflict: 'role_id,modulo,accion' })
      .select('id, role_id, modulo, accion, permitido')
      .single()
      .then(({ data }) => {
        if (data) setPermisos(prev => prev.map(p => key(p) ? data : p));
      });
  }, [savingPermisos, permisos]);

  const toggleAllGroup = useCallback(async (roleId: string, group: string, reload: () => void) => {
    if (savingPermisos) return;
    setSavingPermisos(true);
    try {
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
      await reload();
      notifyPermisosChanged();
    } finally {
      setSavingPermisos(false);
    }
  }, [savingPermisos, notifyPermisosChanged]);

  const toggleAllModule = useCallback(async (roleId: string, modulo: string, reload: () => void) => {
    if (savingPermisos) return;
    setSavingPermisos(true);
    try {
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
      await reload();
      notifyPermisosChanged();
    } finally {
      setSavingPermisos(false);
    }
  }, [savingPermisos, notifyPermisosChanged]);

  const openEditRole = useCallback((role: Role) => {
    setEditingRole(role);
    setRoleName(role.nombre);
    setRoleDesc(role.descripcion || '');
    setRoleMovil(role.acceso_ruta_movil);
    const isSoloMovil = role.solo_movil || permisos.filter(p => p.role_id === role.id).some(p => p.modulo === 'solo_movil' && p.accion === 'ver' && p.permitido);
    setRoleSoloMovil(isSoloMovil);
    setShowRoleForm(true);
  }, [permisos]);

  const openNewRole = useCallback(() => {
    setShowRoleForm(true);
    setEditingRole(null);
    setRoleName('');
    setRoleDesc('');
    setRoleMovil(false);
    setRoleSoloMovil(false);
  }, []);

  return {
    roles, permisos, savingPermisos,
    editingRole, roleName, setRoleName, roleDesc, setRoleDesc,
    roleMovil, setRoleMovil, roleSoloMovil, setRoleSoloMovil,
    showRoleForm, rolesTab, setRolesTab,
    loadRoles, resetRoleForm, saveRoleWithSoloMovil, toggleRoleActivo,
    togglePermiso, toggleAllGroup, toggleAllModule,
    openEditRole, openNewRole,
  };
}
