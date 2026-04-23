import { useEffect, useState } from 'react';
import { X, Edit2, Shield, ShieldCheck, Truck } from 'lucide-react';
import { cn } from '@/lib/utils';
import AvatarUploader from '@/components/AvatarUploader';
import type { ProfileUser, AuthUser, Almacen, EditForm } from '@/hooks/useUsuarios';
import type { Role } from '@/hooks/useRoles';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Props {
  editingUser: ProfileUser;
  editForm: EditForm;
  setEditForm: (f: EditForm) => void;
  savingUser: boolean;
  authUsers: AuthUser[];
  activeRoles: Role[];
  almacenes: Almacen[];
  ownerUserId?: string;
  onSave: () => void;
  onClose: () => void;
}

interface VehiculoLite { id: string; alias: string; placa: string | null; vendedor_default_id: string | null; }

export default function EditUserModal({ editingUser, editForm, setEditForm, savingUser, authUsers, activeRoles, almacenes, ownerUserId, onSave, onClose }: Props) {
  const isOwner = ownerUserId === editingUser.user_id;
  const [vehiculos, setVehiculos] = useState<VehiculoLite[]>([]);
  const [vehiculoId, setVehiculoId] = useState<string>('');
  const [initialVehiculoId, setInitialVehiculoId] = useState<string>('');

  useEffect(() => {
    let cancel = false;
    (async () => {
      const { data } = await supabase
        .from('vehiculos')
        .select('id, alias, placa, vendedor_default_id, empresa_id')
        .eq('empresa_id', (editingUser as any).empresa_id ?? undefined as any);
      if (cancel) return;
      // Fallback: if empresa_id no está en editingUser, traemos por asignación al user
      let list: VehiculoLite[] = (data as any) || [];
      if (!list.length) {
        const { data: all } = await supabase.from('vehiculos').select('id, alias, placa, vendedor_default_id');
        list = (all as any) || [];
      }
      setVehiculos(list);
      const mine = list.find(v => v.vendedor_default_id === editingUser.id);
      setVehiculoId(mine?.id || '');
      setInitialVehiculoId(mine?.id || '');
    })();
    return () => { cancel = true; };
  }, [editingUser.id]);

  const handlePinChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value.replace(/\D/g, '').slice(0, 4);
    setEditForm({ ...editForm, pin_code: v });
  };

  const handleSaveAll = async () => {
    // Actualizar asignación de vehículo si cambió
    if (vehiculoId !== initialVehiculoId) {
      try {
        // Liberar el anterior
        if (initialVehiculoId) {
          await supabase.from('vehiculos').update({ vendedor_default_id: null }).eq('id', initialVehiculoId);
        }
        // Asignar el nuevo (y desasignar a otros que lo tuvieran)
        if (vehiculoId) {
          await supabase.from('vehiculos').update({ vendedor_default_id: null }).eq('vendedor_default_id', editingUser.id);
          await supabase.from('vehiculos').update({ vendedor_default_id: editingUser.id }).eq('id', vehiculoId);
        } else {
          await supabase.from('vehiculos').update({ vendedor_default_id: null }).eq('vendedor_default_id', editingUser.id);
        }
      } catch (e: any) {
        toast.error('No se pudo guardar el vehículo: ' + (e.message || ''));
      }
    }
    onSave();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-auto">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h3 className="text-base font-bold text-foreground flex items-center gap-2">
            <Edit2 className="h-4 w-4 text-primary" /> Editar usuario
          </h3>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-muted"><X className="h-4 w-4 text-muted-foreground" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="text-xs text-muted-foreground bg-accent/30 rounded-lg px-3 py-2">
            {authUsers.find(au => au.id === editingUser.user_id)?.email || '—'}
          </div>
          <div>
            <label className="label-odoo">Foto de perfil</label>
            <AvatarUploader
              userId={editingUser.user_id}
              profileId={editingUser.id}
              currentUrl={editingUser.avatar_url}
              name={editForm.nombre || editingUser.nombre}
            />
          </div>
          <div>
            <label className="label-odoo label-required">Nombre</label>
            <input className="input-odoo w-full" value={editForm.nombre} onChange={e => setEditForm({ ...editForm, nombre: e.target.value })} placeholder="Nombre completo" />
          </div>
          <div>
            <label className="label-odoo">Teléfono</label>
            <input className="input-odoo w-full" value={editForm.telefono} onChange={e => setEditForm({ ...editForm, telefono: e.target.value })} placeholder="10 dígitos" />
          </div>
          <div>
            <label className="label-odoo label-required">Rol</label>
            {isOwner ? (
              <div className="input-odoo w-full bg-accent/30 text-muted-foreground cursor-not-allowed flex items-center gap-2">
                <Shield className="h-3.5 w-3.5 text-primary" />
                {activeRoles.find(r => r.id === editForm.role_id)?.nombre || 'Administrador'}
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
                {editForm.role_id && activeRoles.find(r => r.id === editForm.role_id)?.acceso_ruta_movil && !editForm.almacen_id && (
                  <p className="text-[11px] text-warning mt-1">⚠️ Se recomienda asignar un almacén para que este usuario pueda operar en ruta</p>
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
            <label className="label-odoo flex items-center gap-1.5">
              <Truck className="h-3.5 w-3.5 text-primary" /> Vehículo asignado
            </label>
            <select className="input-odoo w-full" value={vehiculoId} onChange={e => setVehiculoId(e.target.value)}>
              <option value="">Sin vehículo asignado</option>
              {vehiculos.map(v => {
                const ocupadoPorOtro = v.vendedor_default_id && v.vendedor_default_id !== editingUser.id;
                return (
                  <option key={v.id} value={v.id}>
                    {v.alias}{v.placa ? ` (${v.placa})` : ''}{ocupadoPorOtro ? ' — ya asignado a otro' : ''}
                  </option>
                );
              })}
            </select>
            <p className="text-[11px] text-muted-foreground mt-1">
              Es el vehículo que se preselecciona al iniciar la jornada de ruta. Puedes cambiarlo en cualquier momento.
            </p>
          </div>
          <div>
            <label className="label-odoo">Estado</label>
            {isOwner ? (
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
              onChange={handlePinChange}
              placeholder="••••"
            />
            <p className="text-[11px] text-muted-foreground mt-1">Se usará para autorizar operaciones sensibles (cancelar ventas, reabrir conteos, etc.)</p>
          </div>
        </div>
        <div className="p-5 border-t border-border flex gap-2 justify-end">
          <button onClick={onClose} className="btn-odoo text-sm">Cancelar</button>
          <button onClick={handleSaveAll} disabled={savingUser} className="btn-odoo-primary text-sm">
            {savingUser ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </div>
  );
}
