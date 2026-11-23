import { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { Eye, EyeOff, Mail, Lock, Loader2, Truck, Boxes, Wallet } from 'lucide-react';
import { translateError } from '@/lib/errorTranslator';
import { Seo } from '@/components/seo/Seo';

const LOGO_URL = 'https://res.cloudinary.com/dstcnsu6a/image/upload/v1774544059/Imagen_p4jkid.png';

const BENEFICIOS = [
  { icon: Truck, t: 'Ventas en ruta', d: 'Preventa, venta directa y entregas desde el celular del vendedor.' },
  { icon: Boxes, t: 'Inventario por camión', d: 'Cada unidad con su propio stock, cargas y descargas.' },
  { icon: Wallet, t: 'Cobranza y facturación', d: 'Cobros, saldos y facturas en un mismo lugar.' },
];

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
      const t = translateError(err);
      toast.error(t.title, { description: t.suggestion });
    } finally {
      setLoading(false);
    }
  };

  const inputCls =
    'h-11 w-full rounded-lg border border-input bg-card pl-10 pr-3 text-[14px] text-foreground ' +
    'placeholder:text-muted-foreground/60 transition-colors ' +
    'focus:outline-none focus:border-primary focus:ring-2 focus:ring-ring/30';

  return (
    <div className="min-h-[100dvh] bg-background lg:grid lg:grid-cols-2">
      <Seo
        title="Iniciar sesión · Rutapp"
        description="Accede a tu cuenta de Rutapp para gestionar ventas en ruta, inventario y cobranza desde cualquier dispositivo."
        path="/login"
      />

      {/* Panel de marca (solo escritorio). Azul RutApp fijo para conservar contraste en modo claro y oscuro. */}
      <aside
        className="relative hidden lg:flex flex-col justify-between overflow-hidden p-12 xl:p-16 text-white"
        style={{ background: 'linear-gradient(155deg, hsl(215 100% 45%) 0%, hsl(215 100% 37%) 100%)' }}
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-[0.12]"
          style={{ backgroundImage: 'radial-gradient(hsl(0 0% 100%) 1px, transparent 1px)', backgroundSize: '22px 22px' }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full"
          style={{ background: 'radial-gradient(circle, hsl(0 0% 100% / 0.14), transparent 70%)' }}
        />

        <div className="relative flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-white shadow-sm">
            <img src={LOGO_URL} alt="" className="h-8 w-8 object-contain" />
          </span>
          <span className="text-[20px] font-bold tracking-tight">Rutapp</span>
        </div>

        <div className="relative max-w-md">
          <p className="text-[34px] xl:text-[40px] font-bold leading-[1.1] tracking-tight">
            Vende, entrega y cobra en ruta desde un solo lugar.
          </p>
          <ul className="mt-10 space-y-6">
            {BENEFICIOS.map(({ icon: Icon, t, d }) => (
              <li key={t} className="flex items-start gap-4">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-white/15 ring-1 ring-white/20">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <div>
                  <p className="text-[16px] font-semibold">{t}</p>
                  <p className="mt-0.5 text-[14px] leading-relaxed text-white/90">{d}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-[13px] text-white/90">© {new Date().getFullYear()} Rutapp · Hecho en México</p>
      </aside>

      {/* Formulario */}
      <main className="flex min-h-[100dvh] items-center justify-center pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] sm:pl-[max(2rem,env(safe-area-inset-left))] sm:pr-[max(2rem,env(safe-area-inset-right))] lg:px-12">
        <div className="w-full max-w-[400px]">
          <div className="mb-8">
            <img
              src={LOGO_URL}
              alt="Rutapp"
              className="mb-6 h-12 w-12 rounded-xl object-contain lg:hidden"
            />
            <h1 className="text-[24px] sm:text-[28px] font-bold leading-tight tracking-tight text-foreground">
              {isForgot ? 'Recuperar contraseña en Rutapp' : 'Iniciar sesión en Rutapp'}
            </h1>
            <p className="mt-2 text-[14px] text-muted-foreground">
              {isForgot
                ? 'Escribe tu email y te enviaremos un enlace para restablecerla.'
                : 'Ingresa con tu email y contraseña.'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="login-email" className="mb-1.5 block text-[13px] font-semibold text-foreground">
                Email
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <input
                  id="login-email"
                  type="email"
                  autoComplete="email"
                  placeholder="tu@empresa.com"
                  className={inputCls}
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>

            {!isForgot && (
              <div>
                <div className="mb-1.5 flex items-center justify-between gap-3">
                  <label htmlFor="login-password" className="block text-[13px] font-semibold text-foreground">
                    Contraseña
                  </label>
                  <button
                    type="button"
                    onClick={() => setIsForgot(true)}
                    className="rounded text-[13px] font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                  >
                    ¿Olvidaste tu contraseña?
                  </button>
                </div>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                  <input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    className={`${inputCls} pr-11`}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    className="absolute right-1.5 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-[14px] font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-60"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {loading ? 'Cargando...' : isForgot ? 'Enviar enlace' : 'Entrar'}
            </button>
          </form>

          <div className="mt-6 border-t border-border pt-6 text-center text-[14px] text-muted-foreground">
            {isForgot ? (
              <button
                onClick={() => setIsForgot(false)}
                className="rounded font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              >
                Volver a iniciar sesión
              </button>
            ) : (
              <>
                ¿No tienes cuenta?{' '}
                <Link
                  to="/signup"
                  className="rounded font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                >
                  Crear cuenta
                </Link>
              </>
            )}
          </div>

          {!isForgot && (
            <p className="mt-6 text-center text-[12px] leading-relaxed text-muted-foreground">
              Al registrarte o iniciar sesión aceptas los{' '}
              <Link to="/terminos" target="_blank" className="underline hover:text-foreground">Términos de Servicio</Link>
              {' '}y la{' '}
              <Link to="/privacidad" target="_blank" className="underline hover:text-foreground">Política de Privacidad</Link>.
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
