import { useState } from 'react';
import { KeyRound, Loader2, Eye, EyeOff, User as UserIcon, Mail, Building2, Moon, Sun } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/hooks/useTheme';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import AvatarUploader from '@/components/AvatarUploader';

export default function PerfilPage() {
  const { user, profile, empresa } = useAuth();
  const { theme, setTheme } = useTheme();
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [saving, setSaving] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);

  const handleChangePassword = async () => {
    if (newPass.length < 6) { toast.error('La contraseña debe tener al menos 6 caracteres'); return; }
    if (newPass !== confirmPass) { toast.error('Las contraseñas no coinciden'); return; }
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password: newPass });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Contraseña actualizada correctamente');
    setNewPass('');
    setConfirmPass('');
  };

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-bold text-foreground">Mi perfil</h1>
        <p className="text-xs text-muted-foreground mt-0.5">Administra tu información personal y contraseña</p>
      </div>

      {/* Datos del usuario */}
      <section className="bg-card border border-border rounded-lg p-5">
        <h2 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
          <UserIcon className="h-4 w-4 text-primary" /> Información personal
        </h2>
        <div className="flex items-start gap-5">
          {user?.id && profile?.id && (
            <AvatarUploader
              userId={user.id}
              profileId={profile.id}
              currentUrl={(profile as any)?.avatar_url}
              name={profile?.nombre}
              size={88}
            />
          )}
          <div className="flex-1 space-y-2.5 text-sm">
            <div className="flex items-center gap-2">
              <UserIcon className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-muted-foreground">Nombre:</span>
              <span className="font-medium text-foreground">{profile?.nombre || '—'}</span>
            </div>
            <div className="flex items-center gap-2">
              <Mail className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-muted-foreground">Correo:</span>
              <span className="font-medium text-foreground">{user?.email}</span>
            </div>
            <div className="flex items-center gap-2">
              <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-muted-foreground">Empresa:</span>
              <span className="font-medium text-foreground">{empresa?.nombre || '—'}</span>
            </div>
          </div>
        </div>
      </section>

      {/* Cambiar contraseña */}
      <section className="bg-card border border-border rounded-lg p-5">
        <h2 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-primary" /> Cambiar contraseña
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-xl">
          <div>
            <label className="label-odoo">Nueva contraseña</label>
            <div className="relative">
              <input
                type={showNewPass ? 'text' : 'password'}
                value={newPass}
                onChange={e => setNewPass(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                className="input-odoo pr-10"
              />
              <button
                type="button"
                onClick={() => setShowNewPass(!showNewPass)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showNewPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div>
            <label className="label-odoo">Confirmar contraseña</label>
            <div className="relative">
              <input
                type={showConfirmPass ? 'text' : 'password'}
                value={confirmPass}
                onChange={e => setConfirmPass(e.target.value)}
                placeholder="Repetir contraseña"
                className="input-odoo pr-10"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPass(!showConfirmPass)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showConfirmPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {confirmPass && newPass !== confirmPass && (
              <p className="text-[11px] text-destructive mt-1">Las contraseñas no coinciden</p>
            )}
          </div>
        </div>
        <div className="mt-4">
          <button
            onClick={handleChangePassword}
            disabled={saving || newPass.length < 6 || newPass !== confirmPass}
            className="btn-odoo-primary text-xs flex items-center gap-2"
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Guardar nueva contraseña
          </button>
        </div>
      </section>

      {/* Apariencia */}
      <section className="bg-card border border-border rounded-lg p-5">
        <h2 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
          {theme === 'dark' ? <Moon className="h-4 w-4 text-primary" /> : <Sun className="h-4 w-4 text-primary" />} Apariencia
        </h2>
        <button
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="btn-odoo text-xs flex items-center gap-2"
        >
          {theme === 'dark' ? <><Sun className="h-3.5 w-3.5" /> Cambiar a modo claro</> : <><Moon className="h-3.5 w-3.5" /> Cambiar a modo oscuro</>}
        </button>
      </section>
    </div>
  );
}
