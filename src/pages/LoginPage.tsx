import { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { Eye, EyeOff, Play } from 'lucide-react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
            {isForgot ? 'Recuperar contraseña' : 'Iniciar sesión'}
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
            {loading ? 'Cargando...' : isForgot ? 'Enviar enlace' : 'Entrar'}
          </button>
        </form>
        {!isForgot && (
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
              ¿No tienes cuenta?{' '}
              <Link to="/signup" className="odoo-link">
                Crear cuenta
              </Link>
            </>
          )}
        </p>
        {!isForgot && (
          <p className="text-center text-[10px] text-muted-foreground mt-4 leading-relaxed">
            Al registrarte o iniciar sesión aceptas los{' '}
            <Link to="/terminos" target="_blank" className="underline hover:text-foreground">Términos de Servicio</Link>
            {' '}y la{' '}
            <Link to="/privacidad" target="_blank" className="underline hover:text-foreground">Política de Privacidad</Link>.
          </p>
        )}
      </div>
    </div>
  );
}