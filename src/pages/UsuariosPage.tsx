import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Plus, Trash2, Edit2, Shield, ChevronDown, ChevronRight, Users, Save, X, KeyRound } from 'lucide-react';
import { cn } from '@/lib/utils';

const MODULOS = [
  { id: 'ventas', label: 'Ventas' },
  { id: 'clientes', label: 'Clientes' },
  { id: 'catalogo', label: 'Catálogo' },
  { id: 'almacen', label: 'Almacén' },
  { id: 'finanzas', label: 'Finanzas' },
  { id: 'reportes', label: 'Reportes' },
  { id: 'configuracion', label: 'Configuración' },
];

const ACCIONES = ['ver', 'crear', 'editar', 'eliminar'];

interface Role {
  id: string;
  nombre: string;
  descripcion: string | null;
  es_sistema: boolean;
  acceso_ruta_movil: boolean;
}

interface RolePermiso {
  id: string;
  role_id: string;
  modulo: string;
  accion: string;
  permitido: boolean;
}

interface ProfileUser {
  id: string;
  user_id: string;
  nombre: string | null;
  almacen_id: string | null;
  vendedor_id: string | null;
  telefono: string | null;
  estado: string;
}

interface UserRole {
  id: string;
  user_id: string;
  role_id: string;
}

interface Almacen {
  id: string;
  nombre: string;
}

interface Vendedor {
  id: string;
  nombre: string;
}

export default function UsuariosPage() {
  const { empresa } = useAuth();
  const [tab, setTab] = useState<'usuarios' | 'roles'>('usuarios');
  const [roles, setRoles] = useState<Role[]>([]);
  const [permisos, setPermisos] = useState<RolePermiso[]>([]);
  const [profiles, setProfiles] = useState<ProfileUser[]>([]);
  const [userRoles, setUserRoles] = useState<UserRole[]>([]);
  const [almacenes, setAlmacenes] = useState<Almacen[]>([]);
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [loading, setLoading] = useState(true);

  // Role form
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [roleName, setRoleName] = useState('');
  const [roleDesc, setRoleDesc] = useState('');
  const [roleMovil, setRoleMovil] = useState(false);
  const [showRoleForm, setShowRoleForm] = useState(false);

  // User edit
  const [editingUser, setEditingUser] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{ nombre: string; telefono: string; estado: string; almacen_id: string; vendedor_id: string; role_id: string }>({ nombre: '', telefono: '', estado: 'activo', almacen_id: '', vendedor_id: '', role_id: '' });

  const load = useCallback(async () => {
    if (!empresa?.id) return;
    setLoading(true);
    const [r, p, pr, ur, a, v] = await Promise.all([
      supabase.from('roles').select('*').eq('empresa_id', empresa.id).order('nombre'),
      supabase.from('role_permisos').select('*'),
      supabase.from('profiles').select('id, user_id, nombre, almacen_id, vendedor_id, telefono, estado').eq('empresa_id', empresa.id),
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
    setLoading(false);
  }, [empresa?.id]);

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
      setShowRoleForm(false);
      setEditingRole(null);
      setRoleName('');
      setRoleDesc('');
      setRoleMovil(false);
      load();
    } catch (e: any) { toast.error(e.message); }
  };

  const deleteRole = async (id: string) => {
    if (!confirm('¿Eliminar este rol?')) return;
    await supabase.from('roles').delete().eq('id', id);
    toast.success('Rol eliminado');
    load();
  };

  const togglePermiso = async (roleId: string, modulo: string, accion: string) => {
    const existing = permisos.find(p => p.role_id === roleId && p.modulo === modulo && p.accion === accion);
    if (existing) {
      await supabase.from('role_permisos').update({ permitido: !existing.permitido }).eq('id', existing.id);
    } else {
      await supabase.from('role_permisos').insert({ role_id: roleId, modulo, accion, permitido: true });
    }
    load();
  };

  const toggleAllModule = async (roleId: string, modulo: string) => {
    const modulePerms = permisos.filter(p => p.role_id === roleId && p.modulo === modulo);
    const allEnabled = ACCIONES.every(a => modulePerms.find(p => p.accion === a)?.permitido);
    const newVal = !allEnabled;
    for (const accion of ACCIONES) {
      const existing = modulePerms.find(p => p.accion === accion);
      if (existing) {
        await supabase.from('role_permisos').update({ permitido: newVal }).eq('id', existing.id);
      } else {
        await supabase.from('role_permisos').insert({ role_id: roleId, modulo, accion, permitido: newVal });
      }
    }
    load();
  };

  // ── User edit ──
  const startEdit = (p: ProfileUser) => {
    const userRole = userRoles.find(ur => ur.user_id === p.user_id);
    setEditingUser(p.id);
    setEditForm({
      nombre: p.nombre || '',
      telefono: p.telefono || '',
      estado: p.estado || 'activo',
      almacen_id: p.almacen_id || '',
      vendedor_id: p.vendedor_id || '',
      role_id: userRole?.role_id || '',
    });
  };

  const saveUser = async (p: ProfileUser) => {
    try {
      // Update profile
      await supabase.from('profiles').update({
        nombre: editForm.nombre || null,
        telefono: editForm.telefono || null,
        estado: editForm.estado,
        almacen_id: editForm.almacen_id || null,
        vendedor_id: editForm.vendedor_id || null,
      }).eq('id', p.id);

      // Update role
      const existing = userRoles.filter(ur => ur.user_id === p.user_id);
      for (const ur of existing) {
        await supabase.from('user_roles').delete().eq('id', ur.id);
      }
      if (editForm.role_id) {
        await supabase.from('user_roles').insert({ user_id: p.user_id, role_id: editForm.role_id });
      }

      toast.success('Usuario actualizado');
      setEditingUser(null);
      load();
    } catch (e: any) { toast.error(e.message); }
  };

  const resetPassword = async (userId: string) => {
    // We can't reset password from client-side without email, so we inform the user
    toast.info('Para cambiar la contraseña, el usuario debe usar "¿Olvidaste tu contraseña?" en la pantalla de inicio de sesión.');
  };

  const estadoBadge = (estado: string) => {
    switch (estado) {
      case 'activo': return 'bg-success/10 text-success';
      case 'baja': return 'bg-destructive/10 text-destructive';
      default: return 'bg-muted/20 text-muted-foreground';
    }
  };

  if (loading) return <div className="p-6 text-muted-foreground text-sm">Cargando...</div>;

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-foreground flex items-center gap-2">
          <Users className="h-5 w-5" /> Usuarios y Permisos
        </h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        <button onClick={() => setTab('usuarios')} className={cn("px-4 py-2 text-sm font-medium border-b-2 transition-colors", tab === 'usuarios' ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}>
          Usuarios
        </button>
        <button onClick={() => setTab('roles')} className={cn("px-4 py-2 text-sm font-medium border-b-2 transition-colors", tab === 'roles' ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}>
          Roles y Permisos
        </button>
      </div>

      {tab === 'usuarios' && (
        <div className="bg-card border border-border rounded-lg overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-accent/50 border-b border-border">
                <th className="text-left px-4 py-2.5 font-semibold text-foreground">Nombre</th>
                <th className="text-left px-4 py-2.5 font-semibold text-foreground">Teléfono</th>
                <th className="text-left px-4 py-2.5 font-semibold text-foreground">Rol</th>
                <th className="text-left px-4 py-2.5 font-semibold text-foreground">Almacén</th>
                <th className="text-left px-4 py-2.5 font-semibold text-foreground">Estado</th>
                <th className="w-24"></th>
              </tr>
            </thead>
            <tbody>
              {profiles.map(p => {
                const userRole = userRoles.find(ur => ur.user_id === p.user_id);
                const isEditing = editingUser === p.id;
                return (
                  <tr key={p.id} className="border-b border-border last:border-0 hover:bg-accent/30">
                    <td className="px-4 py-2.5">
                      {isEditing ? (
                        <input className="input-odoo text-xs py-1 w-full" value={editForm.nombre} onChange={e => setEditForm({ ...editForm, nombre: e.target.value })} placeholder="Nombre completo" />
                      ) : (
                        <span className="font-medium text-foreground">{p.nombre || 'Sin nombre'}</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      {isEditing ? (
                        <input className="input-odoo text-xs py-1 w-full" value={editForm.telefono} onChange={e => setEditForm({ ...editForm, telefono: e.target.value })} placeholder="Teléfono" />
                      ) : (
                        <span className="text-xs text-muted-foreground">{p.telefono || '—'}</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      {isEditing ? (
                        <select className="input-odoo text-xs py-1" value={editForm.role_id} onChange={e => setEditForm({ ...editForm, role_id: e.target.value })}>
                          <option value="">Sin rol</option>
                          {roles.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
                        </select>
                      ) : (
                        <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", userRole ? "bg-primary/10 text-primary" : "bg-muted/20 text-muted-foreground")}>
                          {userRole ? roles.find(r => r.id === userRole.role_id)?.nombre : 'Sin rol'}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      {isEditing ? (
                        <select className="input-odoo text-xs py-1" value={editForm.almacen_id} onChange={e => setEditForm({ ...editForm, almacen_id: e.target.value })}>
                          <option value="">Ninguno</option>
                          {almacenes.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                        </select>
                      ) : (
                        <span className="text-xs text-muted-foreground">{almacenes.find(a => a.id === p.almacen_id)?.nombre || '—'}</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      {isEditing ? (
                        <select className="input-odoo text-xs py-1" value={editForm.estado} onChange={e => setEditForm({ ...editForm, estado: e.target.value })}>
                          <option value="activo">Activo</option>
                          <option value="baja">Baja</option>
                        </select>
                      ) : (
                        <span className={cn("text-[11px] px-2 py-0.5 rounded-full font-medium capitalize", estadoBadge(p.estado))}>
                          {p.estado}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1">
                        {isEditing ? (
                          <>
                            <button onClick={() => saveUser(p)} className="p-1 rounded hover:bg-success/10 text-success" title="Guardar">
                              <Save className="h-3.5 w-3.5" />
                            </button>
                            <button onClick={() => setEditingUser(null)} className="p-1 rounded hover:bg-accent text-muted-foreground" title="Cancelar">
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </>
                        ) : (
                          <>
                            <button onClick={() => startEdit(p)} className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground" title="Editar">
                              <Edit2 className="h-3.5 w-3.5" />
                            </button>
                            <button onClick={() => resetPassword(p.user_id)} className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground" title="Restablecer contraseña">
                              <KeyRound className="h-3.5 w-3.5" />
                            </button>
                          </>
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
      )}

      {tab === 'roles' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              onClick={() => { setShowRoleForm(true); setEditingRole(null); setRoleName(''); setRoleDesc(''); setRoleMovil(false); }}
              className="btn-odoo-primary text-xs"
            >
              <Plus className="h-3.5 w-3.5 mr-1" /> Nuevo rol
            </button>
          </div>

          {showRoleForm && (
            <div className="bg-card border border-border rounded-lg p-4 space-y-3">
              <h3 className="text-sm font-semibold text-foreground">{editingRole ? 'Editar rol' : 'Nuevo rol'}</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="label-odoo">Nombre</label>
                  <input className="input-odoo" value={roleName} onChange={e => setRoleName(e.target.value)} placeholder="Ej: Supervisor" />
                </div>
                <div>
                  <label className="label-odoo">Descripción</label>
                  <input className="input-odoo" value={roleDesc} onChange={e => setRoleDesc(e.target.value)} placeholder="Opcional" />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                <input type="checkbox" checked={roleMovil} onChange={e => setRoleMovil(e.target.checked)} className="rounded border-border" />
                Acceso a ruta móvil
              </label>
              <div className="flex gap-2">
                <button onClick={saveRole} className="btn-odoo-primary text-xs">Guardar</button>
                <button onClick={() => { setShowRoleForm(false); setEditingRole(null); }} className="btn-odoo text-xs">Cancelar</button>
              </div>
            </div>
          )}

          {roles.map(role => (
            <RoleCard
              key={role.id}
              role={role}
              permisos={permisos.filter(p => p.role_id === role.id)}
              onEdit={() => { setEditingRole(role); setRoleName(role.nombre); setRoleDesc(role.descripcion || ''); setRoleMovil(role.acceso_ruta_movil); setShowRoleForm(true); }}
              onDelete={() => deleteRole(role.id)}
              onTogglePermiso={(mod, acc) => togglePermiso(role.id, mod, acc)}
              onToggleAll={(mod) => toggleAllModule(role.id, mod)}
            />
          ))}

          {roles.length === 0 && !showRoleForm && (
            <div className="text-center py-12 text-muted-foreground text-sm">
              No hay roles creados. Crea uno para empezar a asignar permisos.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function RoleCard({ role, permisos, onEdit, onDelete, onTogglePermiso, onToggleAll }: {
  role: Role;
  permisos: RolePermiso[];
  onEdit: () => void;
  onDelete: () => void;
  onTogglePermiso: (mod: string, acc: string) => void;
  onToggleAll: (mod: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-accent/30" onClick={() => setOpen(!open)}>
        <div className="flex items-center gap-3">
          {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
          <Shield className="h-4 w-4 text-primary" />
          <div>
            <span className="text-sm font-semibold text-foreground">{role.nombre}</span>
            {role.descripcion && <span className="text-xs text-muted-foreground ml-2">{role.descripcion}</span>}
            {role.acceso_ruta_movil && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-success/10 text-success font-medium">Ruta móvil</span>}
          </div>
        </div>
        <div className="flex gap-1" onClick={e => e.stopPropagation()}>
          <button onClick={onEdit} className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground"><Edit2 className="h-3.5 w-3.5" /></button>
          <button onClick={onDelete} className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
        </div>
      </div>

      {open && (
        <div className="border-t border-border">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-accent/30">
                <th className="text-left px-4 py-2 font-semibold text-foreground w-40">Módulo</th>
                {ACCIONES.map(a => (
                  <th key={a} className="text-center px-2 py-2 font-semibold text-foreground capitalize w-20">{a}</th>
                ))}
                <th className="text-center px-2 py-2 font-semibold text-foreground w-20">Todos</th>
              </tr>
            </thead>
            <tbody>
              {MODULOS.map(mod => {
                const modPerms = permisos.filter(p => p.modulo === mod.id);
                const allChecked = ACCIONES.every(a => modPerms.find(p => p.accion === a)?.permitido);
                return (
                  <tr key={mod.id} className="border-t border-border/50 hover:bg-accent/20">
                    <td className="px-4 py-2 font-medium text-foreground">{mod.label}</td>
                    {ACCIONES.map(acc => {
                      const perm = modPerms.find(p => p.accion === acc);
                      return (
                        <td key={acc} className="text-center px-2 py-2">
                          <input
                            type="checkbox"
                            checked={perm?.permitido ?? false}
                            onChange={() => onTogglePermiso(mod.id, acc)}
                            className="rounded border-border cursor-pointer"
                          />
                        </td>
                      );
                    })}
                    <td className="text-center px-2 py-2">
                      <input
                        type="checkbox"
                        checked={allChecked}
                        onChange={() => onToggleAll(mod.id)}
                        className="rounded border-border cursor-pointer"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
