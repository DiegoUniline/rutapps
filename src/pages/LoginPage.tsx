import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { Eye, EyeOff } from 'lucide-react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [isForgot, setIsForgot] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isForgot) {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        toast.success('Te enviamos un enlace para restablecer tu contraseña. Revisa tu email.');
        setIsForgot(false);
      } else if (isSignUp) {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        toast.success('Cuenta creada. Revisa tu email para confirmar.');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success('Sesión iniciada');
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-sm bg-card border border-border rounded p-6">
        <div className="text-center mb-6">
          <h1 className="text-xl font-bold text-primary">Rutapp</h1>
          <p className="text-xs text-muted-foreground mt-1">
            {isForgot ? 'Recuperar contraseña' : isSignUp ? 'Crear cuenta' : 'Iniciar sesión'}
          </p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="label-odoo">Email</label>
            <input type="email" className="input-odoo" value={email} onChange={e => setEmail(e.target.value)} required />
          </div>
          {!isForgot && (
            <div>
              <label className="label-odoo">Contraseña</label>
              <div className="relative">
                <input type={showPassword ? "text" : "password"} className="input-odoo pr-10" value={password} onChange={e => setPassword(e.target.value)} required />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          )}
          <button type="submit" className="btn-odoo-primary w-full justify-center" disabled={loading}>
            {loading ? 'Cargando...' : isForgot ? 'Enviar enlace' : isSignUp ? 'Registrarse' : 'Entrar'}
          </button>
        </form>
        {!isForgot && !isSignUp && (
          <p className="text-center text-xs text-muted-foreground mt-3">
            <button onClick={() => setIsForgot(true)} className="odoo-link">
              ¿Olvidaste tu contraseña?
            </button>
          </p>
        )}
        <p className="text-center text-xs text-muted-foreground mt-3">
          {isForgot ? (
            <button onClick={() => setIsForgot(false)} className="odoo-link">
              Volver a iniciar sesión
            </button>
          ) : (
            <>
              {isSignUp ? '¿Ya tienes cuenta?' : '¿No tienes cuenta?'}{' '}
              <button onClick={() => setIsSignUp(!isSignUp)} className="odoo-link">
                {isSignUp ? 'Iniciar sesión' : 'Registrarse'}
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
