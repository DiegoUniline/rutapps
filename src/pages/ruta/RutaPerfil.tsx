import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, LogOut, KeyRound, User, Loader2, Moon, Sun, Download } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/hooks/useTheme';
import { usePwaInstall } from '@/hooks/usePwaInstall';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

export default function RutaPerfil() {
  const navigate = useNavigate();
  const { user, profile, signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  const [showChangePass, setShowChangePass] = useState(false);
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [saving, setSaving] = useState(false);

  const handleChangePassword = async () => {
    if (newPass.length < 6) { toast.error('La contraseña debe tener al menos 6 caracteres'); return; }
    if (newPass !== confirmPass) { toast.error('Las contraseñas no coinciden'); return; }
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password: newPass });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Contraseña actualizada');
    setShowChangePass(false);
    setNewPass('');
    setConfirmPass('');
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="sticky top-0 z-10 bg-background border-b border-border px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-1 -ml-1">
          <ArrowLeft className="h-5 w-5 text-foreground" />
        </button>
        <h1 className="text-[16px] font-bold text-foreground">Mi perfil</h1>
      </div>

      <div className="flex-1 p-4 space-y-4">
        {/* User info */}
        <div className="bg-card border border-border rounded-xl p-4 flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <User className="h-6 w-6 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[14px] font-semibold text-foreground truncate">{profile?.nombre || 'Usuario'}</p>
            <p className="text-[12px] text-muted-foreground truncate">{user?.email}</p>
          </div>
        </div>

        {/* Change password */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <button
            onClick={() => setShowChangePass(!showChangePass)}
            className="w-full px-4 py-3.5 flex items-center gap-3 active:bg-muted/50 transition-colors"
          >
            <KeyRound className="h-5 w-5 text-muted-foreground" />
            <span className="text-[14px] font-medium text-foreground flex-1 text-left">Cambiar contraseña</span>
          </button>

          {showChangePass && (
            <div className="px-4 pb-4 space-y-3 border-t border-border pt-3">
              <input
                type="password"
                placeholder="Nueva contraseña"
                value={newPass}
                onChange={e => setNewPass(e.target.value)}
                className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <input
                type="password"
                placeholder="Confirmar contraseña"
                value={confirmPass}
                onChange={e => setConfirmPass(e.target.value)}
                className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <button
                onClick={handleChangePassword}
                disabled={saving}
                className="w-full bg-primary text-primary-foreground rounded-lg py-2.5 text-[13px] font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                Guardar
              </button>
            </div>
          )}
        </div>

        {/* Theme toggle */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="w-full px-4 py-3.5 flex items-center gap-3 active:bg-muted/50 transition-colors"
          >
            {theme === 'dark' ? <Sun className="h-5 w-5 text-muted-foreground" /> : <Moon className="h-5 w-5 text-muted-foreground" />}
            <span className="text-[14px] font-medium text-foreground flex-1 text-left">
              {theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
            </span>
          </button>
        </div>

        {/* Sign out */}
        <button
          onClick={handleSignOut}
          className="w-full bg-card border border-border rounded-xl px-4 py-3.5 flex items-center gap-3 active:bg-destructive/10 transition-colors"
        >
          <LogOut className="h-5 w-5 text-destructive" />
          <span className="text-[14px] font-medium text-destructive">Cerrar sesión</span>
        </button>
      </div>
    </div>
  );
}
