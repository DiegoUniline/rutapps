import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { Eye, EyeOff, Play, Package, Users, Warehouse, Truck, BarChart3, MapPin } from 'lucide-react';
import { Progress } from '@/components/ui/progress';

const DEMO_STEPS = [
  { icon: Warehouse, label: 'Creando almacenes y zonas...' },
  { icon: Package, label: 'Cargando catálogo de productos...' },
  { icon: Users, label: 'Registrando clientes y rutas...' },
  { icon: BarChart3, label: 'Configurando listas de precios...' },
  { icon: Truck, label: 'Preparando cargas y stock...' },
  { icon: MapPin, label: '¡Casi listo! Finalizando...' },
];

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isForgot, setIsForgot] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const [demoStep, setDemoStep] = useState(0);

  useEffect(() => {
    if (!demoLoading) { setDemoStep(0); return; }
    const interval = setInterval(() => {
      setDemoStep(s => (s < DEMO_STEPS.length - 1 ? s + 1 : s));
    }, 3500);
    return () => clearInterval(interval);
  }, [demoLoading]);

  const handleDemo = async () => {
    setDemoLoading(true);
    setDemoStep(0);
    try {
      const { data, error } = await supabase.functions.invoke('demo-login');
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      if (data?.session) {
        await supabase.auth.setSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        });
        sessionStorage.setItem('demo_welcome', '1');
        toast.success('¡Bienvenido a la demo! Los datos se resetean en cada sesión.');
      }
    } catch (err: any) {
      toast.error(err.message || 'Error al iniciar demo');
    } finally {
      setDemoLoading(false);
    }
  };

  if (demoLoading) {
    const StepIcon = DEMO_STEPS[demoStep].icon;
    const progress = Math.min(((demoStep + 1) / DEMO_STEPS.length) * 100, 95);
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-full max-w-sm text-center space-y-6 p-6">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center animate-pulse">
            <StepIcon className="h-8 w-8 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-foreground">Preparando tu demo</h2>
            <p className="text-sm text-muted-foreground mt-1 animate-fade-in" key={demoStep}>
              {DEMO_STEPS[demoStep].label}
            </p>
          </div>
          <Progress value={progress} className="h-2" />
          <p className="text-xs text-muted-foreground">
            Esto toma unos segundos, estamos creando un entorno completo para ti.
          </p>
        </div>
      </div>
    );
  }

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

        {/* Demo button */}
        {!isForgot && (
          <button
            type="button"
            onClick={handleDemo}
            disabled={demoLoading}
            className="w-full mt-3 flex items-center justify-center gap-2 px-4 py-2 rounded border-2 border-dashed border-primary/40 text-primary text-sm font-medium hover:bg-primary/5 transition-colors disabled:opacity-50"
          >
            <Play className="h-4 w-4" />
            {demoLoading ? 'Preparando demo...' : 'Probar Demo (sin registro)'}
          </button>
        )}

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