import { X, UserPlus, Plus } from 'lucide-react';
import type { NewUserForm, Almacen } from '@/hooks/useUsuarios';
import type { Role } from '@/hooks/useRoles';

interface Props {
  newUser: NewUserForm;
  setNewUser: (f: NewUserForm) => void;
  creatingUser: boolean;
  activeRoles: Role[];
  almacenes: Almacen[];
  quickCreateRole: boolean;
  setQuickCreateRole: (v: boolean) => void;
  quickRoleName: string;
  setQuickRoleName: (v: string) => void;
  quickCreateAlmacen: boolean;
  setQuickCreateAlmacen: (v: boolean) => void;
  quickAlmacenName: string;
  setQuickAlmacenName: (v: string) => void;
  onQuickCreateRole: () => void;
  onQuickCreateAlmacen: () => void;
  onCreate: () => void;
  onClose: () => void;
}

export default function NewUserModal({
  newUser, setNewUser, creatingUser, activeRoles, almacenes,
  quickCreateRole, setQuickCreateRole, quickRoleName, setQuickRoleName,
  quickCreateAlmacen, setQuickCreateAlmacen, quickAlmacenName, setQuickAlmacenName,
  onQuickCreateRole, onQuickCreateAlmacen, onCreate, onClose,
}: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-auto">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h3 className="text-base font-bold text-foreground flex items-center gap-2">
            <UserPlus className="h-4 w-4 text-primary" /> Crear nuevo usuario
          </h3>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-muted"><X className="h-4 w-4 text-muted-foreground" /></button>
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
                <button onClick={onQuickCreateRole} className="btn-odoo-primary text-xs px-3">Crear</button>
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
                <button onClick={onQuickCreateAlmacen} className="btn-odoo-primary text-xs px-3">Crear</button>
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
          <button onClick={onClose} className="btn-odoo text-sm">Cancelar</button>
          <button onClick={onCreate} disabled={creatingUser} className="btn-odoo-primary text-sm">
            {creatingUser ? 'Creando...' : 'Crear usuario'}
          </button>
        </div>
      </div>
    </div>
  );
}
