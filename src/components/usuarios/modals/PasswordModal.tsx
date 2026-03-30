interface Props {
  nombre: string;
  newPassword: string;
  setNewPassword: (v: string) => void;
  settingPassword: boolean;
  onSave: () => void;
  onClose: () => void;
}

export default function PasswordModal({ nombre, newPassword, setNewPassword, settingPassword, onSave, onClose }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-card border border-border rounded-lg p-5 w-full max-w-sm space-y-4 shadow-lg">
        <h3 className="text-sm font-semibold text-foreground">Cambiar contraseña</h3>
        <p className="text-xs text-muted-foreground">Usuario: <strong>{nombre}</strong></p>
        <div>
          <label className="label-odoo">Nueva contraseña</label>
          <input className="input-odoo" type="text" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Mínimo 6 caracteres" autoFocus />
        </div>
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="btn-odoo text-xs">Cancelar</button>
          <button onClick={onSave} disabled={settingPassword} className="btn-odoo-primary text-xs">{settingPassword ? 'Guardando...' : 'Guardar contraseña'}</button>
        </div>
      </div>
    </div>
  );
}
