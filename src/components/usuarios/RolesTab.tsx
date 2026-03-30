import { useState } from 'react';
import { Plus, Shield, Edit2, ChevronDown, ChevronRight, ToggleLeft, ToggleRight, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MODULOS, ACCIONES, getModuloGroups, getModuloAcciones } from '@/hooks/usePermisos';
import type { Role, RolePermiso } from '@/hooks/useRoles';

const ACCION_LABELS: Record<string, string> = {
  ver: 'Ver', crear: 'Crear', editar: 'Editar', eliminar: 'Eliminar', ver_todos: 'Global',
};

const ACCION_TOOLTIPS: Record<string, string> = {
  ver: 'Puede acceder y ver este módulo',
  crear: 'Puede crear nuevos registros',
  editar: 'Puede modificar registros existentes',
  eliminar: 'Puede eliminar o cancelar registros',
  ver_todos: 'Ve registros de todos los vendedores, no solo los suyos. Ej: un vendedor sin este permiso solo ve sus propias ventas y clientes.',
};

interface Props {
  roles: Role[];
  permisos: RolePermiso[];
  savingPermisos: boolean;
  rolesTab: 'activos' | 'inactivos';
  setRolesTab: (t: 'activos' | 'inactivos') => void;
  showRoleForm: boolean;
  editingRole: Role | null;
  roleName: string;
  setRoleName: (v: string) => void;
  roleDesc: string;
  setRoleDesc: (v: string) => void;
  roleMovil: boolean;
  setRoleMovil: (v: boolean) => void;
  roleSoloMovil: boolean;
  setRoleSoloMovil: (v: boolean) => void;
  onNewRole: () => void;
  onCloseRoleForm: () => void;
  onSaveRole: () => void;
  onEditRole: (role: Role) => void;
  onToggleActivo: (id: string, currentActivo: boolean) => void;
  onTogglePermiso: (roleId: string, mod: string, acc: string) => void;
  onToggleAllModule: (roleId: string, mod: string) => void;
  onToggleAllGroup: (roleId: string, group: string) => void;
}

export default function RolesTab({
  roles, permisos, savingPermisos, rolesTab, setRolesTab,
  showRoleForm, editingRole, roleName, setRoleName, roleDesc, setRoleDesc,
  roleMovil, setRoleMovil, roleSoloMovil, setRoleSoloMovil,
  onNewRole, onCloseRoleForm, onSaveRole, onEditRole, onToggleActivo,
  onTogglePermiso, onToggleAllModule, onToggleAllGroup,
}: Props) {
  const displayRoles = rolesTab === 'activos' ? roles.filter(r => r.activo !== false) : roles.filter(r => r.activo === false);

  return (
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
        <button onClick={onNewRole} className="btn-odoo-primary text-xs">
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
              <button onClick={onCloseRoleForm} className="p-1.5 rounded-md hover:bg-muted"><X className="h-4 w-4 text-muted-foreground" /></button>
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
              <div>
                <label className="label-odoo mb-2">Tipo de acceso</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => { setRoleMovil(false); setRoleSoloMovil(false); }}
                    className={cn(
                      "flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all text-center",
                      !roleSoloMovil ? "border-primary bg-primary/5 ring-1 ring-primary/20" : "border-border hover:border-muted-foreground/30"
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
                      roleSoloMovil ? "border-primary bg-primary/5 ring-1 ring-primary/20" : "border-border hover:border-muted-foreground/30"
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
              <button onClick={onCloseRoleForm} className="btn-odoo text-sm">Cancelar</button>
              <button onClick={onSaveRole} className="btn-odoo-primary text-sm">Guardar</button>
            </div>
          </div>
        </div>
      )}

      {displayRoles.map(role => (
        <RoleCard
          key={role.id}
          role={role}
          permisos={permisos.filter(p => p.role_id === role.id)}
          disabled={savingPermisos}
          onEdit={() => onEditRole(role)}
          onToggleActivo={() => onToggleActivo(role.id, role.activo !== false)}
          onTogglePermiso={(mod, acc) => onTogglePermiso(role.id, mod, acc)}
          onToggleAll={(mod) => onToggleAllModule(role.id, mod)}
          onToggleGroup={(group) => onToggleAllGroup(role.id, group)}
        />
      ))}
      {roles.length === 0 && !showRoleForm && <div className="text-center py-12 text-muted-foreground text-sm">No hay roles creados. Crea uno para empezar a asignar permisos.</div>}
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
                    key={group} group={group} mods={groupMods} permisos={permisos}
                    allGroupChecked={allGroupChecked} disabled={disabled}
                    onTogglePermiso={onTogglePermiso} onToggleAll={onToggleAll} onToggleGroup={onToggleGroup}
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
  group: string; mods: { id: string; label: string; group: string }[]; permisos: RolePermiso[];
  allGroupChecked: boolean; disabled?: boolean;
  onTogglePermiso: (mod: string, acc: string) => void; onToggleAll: (mod: string) => void; onToggleGroup: (group: string) => void;
}) {
  return (
    <>
      <tr className="bg-accent/50 border-t border-border">
        <td className="px-4 py-2 font-bold text-foreground text-[13px]">{group}</td>
        {ACCIONES.map(a => <td key={a} className="text-center px-2 py-2"></td>)}
        <td className="text-center px-2 py-2">
          <input type="checkbox" checked={allGroupChecked} disabled={disabled} onChange={() => onToggleGroup(group)} className="rounded border-border cursor-pointer disabled:opacity-50 disabled:cursor-wait" title={`Todos los permisos de ${group}`} />
        </td>
      </tr>
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
