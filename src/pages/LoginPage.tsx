import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isSignUp) {
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
            {isSignUp ? 'Crear cuenta' : 'Iniciar sesión'}
          </p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="label-odoo">Email</label>
            <input type="email" className="input-odoo" value={email} onChange={e => setEmail(e.target.value)} required />
          </div>
          <div>
            <label className="label-odoo">Contraseña</label>
            <input type="password" className="input-odoo" value={password} onChange={e => setPassword(e.target.value)} required />
          </div>
          <button type="submit" className="btn-odoo-primary w-full justify-center" disabled={loading}>
            {loading ? 'Cargando...' : isSignUp ? 'Registrarse' : 'Entrar'}
          </button>
        </form>
        <p className="text-center text-xs text-muted-foreground mt-4">
          {isSignUp ? '¿Ya tienes cuenta?' : '¿No tienes cuenta?'}{' '}
          <button onClick={() => setIsSignUp(!isSignUp)} className="odoo-link">
            {isSignUp ? 'Iniciar sesión' : 'Registrarse'}
          </button>
        </p>
      </div>
    </div>
  );
}
