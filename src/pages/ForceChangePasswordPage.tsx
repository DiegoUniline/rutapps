import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Eye, EyeOff, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function ForceChangePasswordPage() {
  const { user, profile } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) { toast.error('La contraseña debe tener al menos 6 caracteres'); return; }
    if (password !== confirm) { toast.error('Las contraseñas no coinciden'); return; }

    setLoading(true);
    try {
      // Update password
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      // Clear the flag
      if (user) {
        await supabase.from('profiles').update({ must_change_password: false }).eq('user_id', user.id);
      }

      toast.success('Contraseña actualizada correctamente');
      navigate('/dashboard');
    } catch (err: any) {
      toast.error(err.message || 'Error al cambiar contraseña');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md border-border shadow-lg">
        <CardHeader className="text-center space-y-3 pb-2">
          <div className="mx-auto h-14 w-14 rounded-full bg-amber-500/10 flex items-center justify-center">
            <ShieldAlert className="h-7 w-7 text-amber-600" />
          </div>
          <CardTitle className="text-xl font-bold">Cambio de contraseña requerido</CardTitle>
          <p className="text-sm text-muted-foreground">
            Tu administrador ha solicitado que cambies tu contraseña antes de continuar.
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-sm">Nueva contraseña</Label>
              <div className="relative">
                <Input
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  required
                  minLength={6}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm">Confirmar contraseña</Label>
              <Input
                type={showPw ? 'text' : 'password'}
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                placeholder="Repetir contraseña"
                required
                minLength={6}
              />
              {confirm && password !== confirm && (
                <p className="text-xs text-destructive">Las contraseñas no coinciden</p>
              )}
            </div>

            <Button type="submit" className="w-full" disabled={loading || password.length < 6 || password !== confirm}>
              {loading ? 'Guardando...' : 'Cambiar contraseña y continuar'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
