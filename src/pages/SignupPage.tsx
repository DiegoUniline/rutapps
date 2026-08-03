import { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { ArrowLeft, Building2, Phone, Mail, User, Lock, Loader2, ShieldCheck, MessageCircle, Eye, EyeOff, Clock, AlertTriangle, Tag, Sparkles, FileText, Check, Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Seo } from '@/components/seo/Seo';

interface SignupPlanRow {
  id: string;
  slug: string | null;
  nombre: string;
  precio_base: number | null;
  usuarios_incluidos: number | null;
  precio_extra_usuario: number | null;
  popular: boolean | null;
  ideal_para: string | null;
  orden: number | null;
}

const SELECTED_PLAN_KEY = 'rutapp_selected_plan';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';

const COUNTRY_CODES = [
  { code: '+52', country: 'MX', label: '🇲🇽 México (+52)', digits: 10 },
  { code: '+34', country: 'ES', label: '🇪🇸 España (+34)', digits: 9 },
  { code: '+1', country: 'US', label: '🇺🇸 EE.UU./Canadá (+1)', digits: 10 },
  { code: '+502', country: 'GT', label: '🇬🇹 Guatemala (+502)', digits: 8 },
  { code: '+57', country: 'CO', label: '🇨🇴 Colombia (+57)', digits: 10 },
  { code: '+54', country: 'AR', label: '🇦🇷 Argentina (+54)', digits: 10 },
  { code: '+51', country: 'PE', label: '🇵🇪 Perú (+51)', digits: 9 },
  { code: '+56', country: 'CL', label: '🇨🇱 Chile (+56)', digits: 9 },
  { code: '+55', country: 'BR', label: '🇧🇷 Brasil (+55)', digits: 11 },
  { code: '+593', country: 'EC', label: '🇪🇨 Ecuador (+593)', digits: 9 },
  { code: '+591', country: 'BO', label: '🇧🇴 Bolivia (+591)', digits: 8 },
  { code: '+595', country: 'PY', label: '🇵🇾 Paraguay (+595)', digits: 9 },
  { code: '+598', country: 'UY', label: '🇺🇾 Uruguay (+598)', digits: 8 },
  { code: '+507', country: 'PA', label: '🇵🇦 Panamá (+507)', digits: 8 },
  { code: '+506', country: 'CR', label: '🇨🇷 Costa Rica (+506)', digits: 8 },
  { code: '+503', country: 'SV', label: '🇸🇻 El Salvador (+503)', digits: 8 },
  { code: '+504', country: 'HN', label: '🇭🇳 Honduras (+504)', digits: 8 },
  { code: '+505', country: 'NI', label: '🇳🇮 Nicaragua (+505)', digits: 8 },
  { code: '+58', country: 'VE', label: '🇻🇪 Venezuela (+58)', digits: 10 },
  { code: '+809', country: 'DO', label: '🇩🇴 Rep. Dominicana (+809)', digits: 10 },
];

type VerificationMethod = 'whatsapp' | 'email' | null;

const REF_KEY = 'rutapp_partner_ref';

export default function SignupPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [cuponCodigo, setCuponCodigo] = useState('');
  const [partnerRef, setPartnerRef] = useState<string>('');
  const [plans, setPlans] = useState<SignupPlanRow[]>([]);
  const [selectedPlanSlug, setSelectedPlanSlug] = useState<string>('');

  // Capture ?ref= from URL or localStorage
  useEffect(() => {
    const urlRef = searchParams.get('ref');
    if (urlRef) {
      localStorage.setItem(REF_KEY, urlRef);
      setPartnerRef(urlRef);
    } else {
      const saved = localStorage.getItem(REF_KEY);
      if (saved) setPartnerRef(saved);
    }
    const urlCupon = searchParams.get('cupon') || searchParams.get('coupon');
    if (urlCupon) setCuponCodigo(urlCupon.toUpperCase());
  }, [searchParams]);

  // Load active subscription plans for selector
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('subscription_plans')
        .select('id, slug, nombre, precio_base, usuarios_incluidos, precio_extra_usuario, popular, ideal_para, orden')
        .eq('activo', true)
        .not('slug', 'is', null)
        .order('orden', { ascending: true });
      const rows = (data as SignupPlanRow[] | null) || [];
      setPlans(rows);
      const urlPlan = searchParams.get('plan');
      const fromUrl = urlPlan ? rows.find(p => p.slug === urlPlan) : null;
      const popular = rows.find(p => p.popular);
      const chosen = fromUrl || popular || rows[0];
      if (chosen?.slug) setSelectedPlanSlug(chosen.slug);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSelectPlan(slug: string) {
    setSelectedPlanSlug(slug);
    const next = new URLSearchParams(searchParams);
    next.set('plan', slug);
    setSearchParams(next, { replace: true });
  }

  const selectedPlan = plans.find(p => p.slug === selectedPlanSlug) || null;


  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [acceptedPrivacy, setAcceptedPrivacy] = useState(false);
  const [verificationMethod, setVerificationMethod] = useState<VerificationMethod>(null);
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showOtpDialog, setShowOtpDialog] = useState(false);
  const [showCooldownDialog, setShowCooldownDialog] = useState(false);
  const [showPoliciesDialog, setShowPoliciesDialog] = useState(false);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [form, setForm] = useState({
    nombre: '',
    empresa: '',
    email: '',
    password: '',
    countryCode: '+52',
    telefono: '',
  });

  // Persistent cooldown timer that survives page reloads
  const COOLDOWN_KEY = 'otp_cooldown_until';

  const getCooldownRemaining = useCallback(() => {
    const until = localStorage.getItem(COOLDOWN_KEY);
    if (!until) return 0;
    const remaining = Math.ceil((parseInt(until) - Date.now()) / 1000);
    return remaining > 0 ? remaining : 0;
  }, []);

  const startCooldown = useCallback((seconds: number) => {
    const until = Date.now() + seconds * 1000;
    localStorage.setItem(COOLDOWN_KEY, until.toString());
    setCooldownSeconds(seconds);
    setShowCooldownDialog(true);
  }, []);

  // Initialize and tick cooldown
  useEffect(() => {
    const remaining = getCooldownRemaining();
    if (remaining > 0) {
      setCooldownSeconds(remaining);
      setShowCooldownDialog(true);
    }
  }, [getCooldownRemaining]);

  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    const interval = setInterval(() => {
      const remaining = getCooldownRemaining();
      if (remaining <= 0) {
        setCooldownSeconds(0);
        setShowCooldownDialog(false);
        localStorage.removeItem(COOLDOWN_KEY);
        clearInterval(interval);
      } else {
        setCooldownSeconds(remaining);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [cooldownSeconds, getCooldownRemaining]);

  const formatCooldown = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const selectedCountry = COUNTRY_CODES.find(c => c.code === form.countryCode) || COUNTRY_CODES[0];
  const fullPhone = form.countryCode + form.telefono.replace(/\D/g, '');

  function validatePhone() {
    const digits = form.telefono.replace(/\D/g, '');
    if (digits.length !== selectedCountry.digits) {
      return `El número debe tener ${selectedCountry.digits} dígitos para ${selectedCountry.country}`;
    }
    return null;
  }

  function resetVerification() {
    setOtpSent(false);
    setOtpVerified(false);
    setOtpCode('');
  }

  function handleSelectMethod(method: VerificationMethod) {
    setVerificationMethod(method);
    resetVerification();
  }

  // WhatsApp OTP
  async function handleSendOtp() {
    const phoneError = validatePhone();
    if (phoneError) {
      toast.error(phoneError);
      return;
    }
    if (getCooldownRemaining() > 0) {
      setShowCooldownDialog(true);
      setCooldownSeconds(getCooldownRemaining());
      return;
    }
    setSendingOtp(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-otp', {
        body: { action: 'send', phone: fullPhone },
      });
      // Detect rate limit from edge function response
      const errMsg = error?.message || data?.error || '';
      const isRateLimit = errMsg.toLowerCase().includes('demasiados intentos') ||
        errMsg.toLowerCase().includes('rate limit') ||
        errMsg.toLowerCase().includes('too many') ||
        errMsg.includes('429');
      if (isRateLimit) {
        // Extract minutes from message or default to 10
        const minuteMatch = errMsg.match(/(\d+)\s*minuto/i);
        const cooldownMins = minuteMatch ? parseInt(minuteMatch[1]) : 10;
        startCooldown(cooldownMins * 60);
        return;
      }
      if (error) throw new Error(errMsg || 'Error al enviar código');
      if (data?.error) throw new Error(data.error);
      setOtpSent(true);
      setShowOtpDialog(true);
      toast.success('Código enviado por WhatsApp 📲');
    } catch (err: any) {
      const msg = err.message || 'Error al enviar el código';
      // Also catch rate limit from catch block
      if (msg.includes('non-2xx') || msg.includes('429')) {
        startCooldown(10 * 60);
        return;
      }
      toast.error(msg);
    } finally {
      setSendingOtp(false);
    }
  }

  async function handleVerifyOtp() {
    if (otpCode.length !== 6) {
      toast.error('Ingresa el código de 6 dígitos');
      return;
    }
    setVerifyingOtp(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-otp', {
        body: { action: 'verify', phone: fullPhone, code: otpCode },
      });
      if (error) throw new Error(error.message || 'Error de verificación');
      if (data?.error) throw new Error(data.error);
      if (data?.verified) {
        setOtpVerified(true);
        setShowOtpDialog(false);
        toast.success('Número verificado ✓');
      }
    } catch (err: any) {
      toast.error(err.message || 'Código incorrecto');
    } finally {
      setVerifyingOtp(false);
    }
  }

  // For email method, verification happens via Supabase's confirmation email after signup
  const isVerified = verificationMethod === 'whatsapp' ? otpVerified : verificationMethod === 'email';

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();

    if (!form.nombre.trim()) {
      toast.error('El nombre es obligatorio');
      return;
    }
    if (!form.empresa.trim()) {
      toast.error('El nombre de la empresa es obligatorio');
      return;
    }
    if (!form.email.trim()) {
      toast.error('El correo electrónico es obligatorio');
      return;
    }
    const phoneError = validatePhone();
    if (phoneError) {
      toast.error(phoneError);
      return;
    }
    if (!acceptedTerms || !acceptedPrivacy) {
      toast.error('Debes aceptar los Términos y el Aviso de Privacidad');
      return;
    }
    if (form.password.length < 6) {
      toast.error('La contraseña debe tener al menos 6 caracteres');
      return;
    }
    if (form.password !== confirmPassword) {
      toast.error('Las contraseñas no coinciden');
      return;
    }

    setLoading(true);
    try {
      // Check blacklist before anything else
      const { data: blacklisted } = await supabase.rpc('is_email_blacklisted', {
        p_email: form.email.trim().toLowerCase(),
      });
      if (blacklisted) {
        toast.error('Este correo no es elegible para prueba gratuita. Contacta a ventas para adquirir un plan.');
        setLoading(false);
        return;
      }

      const { data: existingEmail } = await supabase
        .from('empresas')
        .select('id')
        .eq('email', form.email.trim().toLowerCase())
        .maybeSingle();
      if (existingEmail) {
        toast.error('Ya existe una empresa registrada con este correo electrónico');
        setLoading(false);
        return;
      }

      const { data: existingPhone } = await supabase
        .from('empresas')
        .select('id')
        .eq('telefono', fullPhone)
        .maybeSingle();
      if (existingPhone) {
        toast.error('Ya existe una empresa registrada con este número de teléfono');
        setLoading(false);
        return;
      }

      const { error: signupError } = await supabase.auth.signUp({
        email: form.email.trim().toLowerCase(),
        password: form.password,
        options: {
          data: {
            full_name: form.nombre,
            phone: fullPhone,
            empresa_nombre: form.empresa,
            accepted_terms_at: new Date().toISOString(),
            verified_via: 'auto',
            partner_ref: partnerRef || null,
            cupon_codigo: cuponCodigo.trim().toUpperCase() || null,
          },
          emailRedirectTo: window.location.origin,
        },
      });

      if (signupError) throw signupError;

      // Send welcome WhatsApp message (fire-and-forget)
      try {
        await supabase.functions.invoke('billing-notify', {
          body: {
            manual_send: true,
            tipo: 'bienvenida',
            nombre: form.nombre,
            empresa: form.empresa,
            phone: fullPhone,
            email: form.email.trim().toLowerCase(),
          },
        });
      } catch { /* silent - welcome msg is best-effort */ }

      toast.success('¡Cuenta creada! Ahora captura tu tarjeta para iniciar tu prueba.', { duration: 8000 });
      // Persist plan choice so /completar-registro lo preselecciona
      if (selectedPlanSlug) {
        try { localStorage.setItem(SELECTED_PLAN_KEY, selectedPlanSlug); } catch {}
      }
      const planQuery = selectedPlanSlug ? `?plan=${encodeURIComponent(selectedPlanSlug)}` : '';
      // After signUp the user is already authenticated; send them to capture card.
      // If session is not yet ready, redirect to /login which will then route to /completar-registro via the guard.
      const { data: { session } } = await supabase.auth.getSession();
      navigate(session ? `/completar-registro${planQuery}` : '/login');
    } catch (err: any) {
      const msg = err.message || 'Error al crear la cuenta';
      if (msg.includes('duplicate') && msg.includes('email')) {
        toast.error('Este correo electrónico ya está registrado');
      } else if (msg.includes('duplicate') && msg.includes('telefono')) {
        toast.error('Este número de teléfono ya está registrado');
      } else {
        toast.error(msg);
      }
    } finally {
      setLoading(false);
    }
  }

  const isFormReady =
    acceptedTerms &&
    acceptedPrivacy &&
    form.email.trim() &&
    form.telefono.trim() &&
    form.empresa.trim() &&
    form.nombre.trim() &&
    form.password.length >= 6 &&
    form.password === confirmPassword;

  return (
    <div className="flex-1 min-h-0 h-full w-full overflow-y-auto overscroll-contain flex flex-col items-center justify-start md:justify-center p-4 sm:p-6 bg-card pt-[max(1rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))]">
      <Seo
        title="Crear cuenta · Rutapp"
        description="Regístrate en Rutapp y prueba gratis 7 días el ERP de venta en ruta: inventario, cobranza, rutas optimizadas y facturación CFDI 4.0."
        path="/signup"
      />
      <Card className="w-full max-w-3xl shadow-xl">
        <CardHeader className="text-center">
          <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4">
            <ArrowLeft className="h-4 w-4" /> Volver al inicio
          </Link>
          <img src="https://res.cloudinary.com/dstcnsu6a/image/upload/v1774544059/Imagen_p4jkid.png" alt="Rutapp" className="h-14 w-14 mx-auto mb-2 rounded-xl object-contain" />
          <h1 className="text-2xl font-black">Crear cuenta en Rutapp</h1>
          <p className="text-sm text-muted-foreground">7 días de prueba gratis · Se requiere tarjeta para activar la cuenta</p>

          {/* Plan selector */}
          {plans.length > 0 && (
            <div className="mt-4 rounded-lg border border-primary/30 bg-primary/5 p-3 text-left">
              <div className="flex items-center gap-2 text-sm font-semibold text-primary mb-3">
                <Sparkles className="h-4 w-4" />
                Elige tu plan
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {plans.map(p => {
                  const isSel = p.slug === selectedPlanSlug;
                  return (
                    <button
                      type="button"
                      key={p.id}
                      onClick={() => p.slug && handleSelectPlan(p.slug)}
                      className={cn(
                        'relative rounded-lg border p-3 text-left transition-all bg-card hover:border-primary',
                        isSel ? 'border-primary ring-2 ring-primary shadow-md' : 'border-border'
                      )}
                    >
                      {p.popular && (
                        <span className="absolute -top-2 right-2 inline-flex items-center gap-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold px-2 py-0.5">
                          <Star className="h-2.5 w-2.5" /> Popular
                        </span>
                      )}
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-sm text-foreground">{p.nombre}</span>
                        {isSel && <Check className="h-4 w-4 text-primary" />}
                      </div>
                      {p.ideal_para && (
                        <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{p.ideal_para}</p>
                      )}
                      <div className="mt-2">
                        <span className="text-lg font-black text-foreground">
                          ${Number(p.precio_base || 0).toLocaleString('es-MX')}
                        </span>
                        <span className="text-[11px] text-muted-foreground"> MXN/mes</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        {p.usuarios_incluidos || 1} usuario{(p.usuarios_incluidos || 1) > 1 ? 's' : ''} incluidos
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Pricing & card disclosure */}
          <div className="mt-4 rounded-lg border border-primary/30 bg-primary/5 p-3 text-left space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-primary">
              <Sparkles className="h-4 w-4" />
              Cómo funciona el cobro
            </div>
            <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-4">
              {selectedPlan ? (
                <li>
                  Plan <strong className="text-foreground">{selectedPlan.nombre}</strong>: ${Number(selectedPlan.precio_base || 0).toLocaleString('es-MX')} MXN/mes con {selectedPlan.usuarios_incluidos || 1} usuario{(selectedPlan.usuarios_incluidos || 1) > 1 ? 's' : ''} incluidos. Usuarios adicionales: ${Number(selectedPlan.precio_extra_usuario || 0).toLocaleString('es-MX')} MXN c/u.
                </li>
              ) : (
                <li><strong className="text-foreground">$300 MXN por usuario al mes</strong> (planes semestral -10% y anual -15%).</li>
              )}
              <li>En el siguiente paso capturas tu tarjeta y confirmas tu plan. <strong className="text-foreground">No se cobra nada durante los 7 días de prueba.</strong></li>
              <li>Al terminar la prueba se realiza el primer cargo automático según el plan elegido.</li>
              <li>Puedes cancelar antes del día 7 desde tu cuenta sin ningún cargo.</li>
              <li><strong className="text-foreground">Si no capturas la tarjeta, la cuenta no se activa</strong> y no podrás acceder al sistema.</li>
            </ul>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSignup} className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
            {/* Name */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2"><User className="h-4 w-4" /> Tu nombre</Label>
              <Input required value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} placeholder="Juan Pérez" />
            </div>

            {/* Company */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2"><Building2 className="h-4 w-4" /> Nombre de tu empresa</Label>
              <Input required value={form.empresa} onChange={e => setForm(f => ({ ...f, empresa: e.target.value }))} placeholder="Distribuidora Norte S.A." />
            </div>

            {/* Email — full width */}
            <div className="space-y-2 md:col-span-2">
              <Label className="flex items-center gap-2"><Mail className="h-4 w-4" /> Email</Label>
              <Input
                type="email"
                required
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                placeholder="tu@empresa.com"
              />
              <p className="text-xs text-muted-foreground">Se usará para iniciar sesión y recuperar tu contraseña</p>
            </div>

            {/* Phone — full width */}
            <div className="space-y-2 md:col-span-2">
              <Label className="flex items-center gap-2"><Phone className="h-4 w-4" /> Teléfono</Label>
              <div className="flex gap-2">
                <Select
                  value={form.countryCode}
                  onValueChange={v => {
                    setForm(f => ({ ...f, countryCode: v }));
                    if (verificationMethod === 'whatsapp') resetVerification();
                  }}
                  disabled={otpVerified && verificationMethod === 'whatsapp'}
                >
                  <SelectTrigger className="w-[180px] shrink-0"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {COUNTRY_CODES.map(c => (
                      <SelectItem key={c.code} value={c.code}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  required
                  value={form.telefono}
                  onChange={e => {
                    setForm(f => ({ ...f, telefono: e.target.value }));
                    if (verificationMethod === 'whatsapp' && otpSent) resetVerification();
                  }}
                  placeholder={`${'0'.repeat(selectedCountry.digits)}`}
                  maxLength={selectedCountry.digits + 2}
                  disabled={otpVerified && verificationMethod === 'whatsapp'}
                />
              </div>
              <p className="text-xs text-muted-foreground">{selectedCountry.digits} dígitos para {selectedCountry.country}</p>
            </div>

            {/* Password */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2"><Lock className="h-4 w-4" /> Contraseña</Label>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={6}
                  value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  placeholder="Mínimo 6 caracteres"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Confirm Password */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2"><Lock className="h-4 w-4" /> Confirmar contraseña</Label>
              <Input
                type="password"
                required
                minLength={6}
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="Repite tu contraseña"
              />
              {confirmPassword && form.password !== confirmPassword && (
                <p className="text-xs text-destructive">Las contraseñas no coinciden</p>
              )}
            </div>

            {/* Cupón / Referido */}
            <div className="space-y-2 md:col-span-2">
              <Label className="flex items-center gap-2"><Tag className="h-4 w-4" /> Código de cupón <span className="text-xs text-muted-foreground font-normal">(opcional)</span></Label>
              <div className="flex gap-2 items-center">
                <Input
                  value={cuponCodigo}
                  onChange={e => setCuponCodigo(e.target.value.toUpperCase())}
                  placeholder="EJ. JUAN10"
                  className="uppercase max-w-xs"
                />
                {partnerRef && (
                  <p className="text-xs text-primary flex items-center gap-1">
                    <Sparkles className="h-3 w-3" /> Referido por <span className="font-semibold">{partnerRef}</span>
                  </p>
                )}
              </div>
            </div>

            {/* Terms & Privacy — full width */}
            <div className="space-y-3 pt-2 border-t md:col-span-2">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex items-start gap-2">
                  <Checkbox id="terms" checked={acceptedTerms} onCheckedChange={v => setAcceptedTerms(v === true)} />
                  <label htmlFor="terms" className="text-xs text-muted-foreground leading-tight cursor-pointer">
                    Acepto los Términos y Condiciones del servicio.
                  </label>
                </div>
                <div className="flex items-start gap-2">
                  <Checkbox id="privacy" checked={acceptedPrivacy} onCheckedChange={v => setAcceptedPrivacy(v === true)} />
                  <label htmlFor="privacy" className="text-xs text-muted-foreground leading-tight cursor-pointer">
                    Acepto el Aviso de Privacidad y el tratamiento de mis datos personales.
                  </label>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowPoliciesDialog(true)}
                className="w-full"
              >
                <FileText className="h-4 w-4 mr-2" />
                Ver Términos y Aviso de Privacidad
              </Button>
            </div>

            <Button type="submit" disabled={loading || !isFormReady} className="w-full md:col-span-2" size="lg">
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Crear mi cuenta
            </Button>

            <p className="text-center text-sm text-muted-foreground md:col-span-2">
              ¿Ya tienes cuenta? <Link to="/login" className="text-primary font-medium hover:underline">Iniciar sesión</Link>
            </p>
          </form>
        </CardContent>
      </Card>

      {/* OTP Verification Dialog */}
      <Dialog open={showOtpDialog} onOpenChange={setShowOtpDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <MessageCircle className="h-5 w-5 text-primary" />
              Verificación de identidad
            </DialogTitle>
            <DialogDescription className="text-sm">
              Te enviamos un código de 6 dígitos a tu celular por WhatsApp. Ingrésalo a continuación para verificar tu número y continuar con el registro.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="flex justify-center">
              <InputOTP maxLength={6} value={otpCode} onChange={setOtpCode}>
                <InputOTPGroup>
                  <InputOTPSlot index={0} />
                  <InputOTPSlot index={1} />
                  <InputOTPSlot index={2} />
                  <InputOTPSlot index={3} />
                  <InputOTPSlot index={4} />
                  <InputOTPSlot index={5} />
                </InputOTPGroup>
              </InputOTP>
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={handleSendOtp} disabled={sendingOtp} className="flex-1">
                {sendingOtp ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Reenviar'}
              </Button>
              <Button type="button" size="sm" onClick={handleVerifyOtp} disabled={verifyingOtp || otpCode.length !== 6} className="flex-1">
                {verifyingOtp ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <ShieldCheck className="h-3 w-3 mr-1" />}
                Verificar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Cooldown Dialog */}
      <Dialog open={showCooldownDialog} onOpenChange={v => { if (!v && cooldownSeconds <= 0) setShowCooldownDialog(false); }}>
        <DialogContent className="max-w-sm text-center">
          <DialogHeader>
            <div className="mx-auto mb-2 h-14 w-14 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
              <AlertTriangle className="h-7 w-7 text-amber-600 dark:text-amber-400" />
            </div>
            <DialogTitle className="text-lg">Demasiados intentos</DialogTitle>
            <DialogDescription className="text-sm leading-relaxed">
              Has enviado varios códigos de verificación en poco tiempo.
              Por seguridad, necesitas esperar un momento antes de intentar de nuevo.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            {cooldownSeconds > 0 ? (
              <div className="space-y-3">
                <div className="inline-flex items-center gap-2 bg-muted rounded-full px-5 py-2.5">
                  <Clock className="h-4 w-4 text-muted-foreground animate-pulse" />
                  <span className="font-mono text-xl font-bold text-foreground">{formatCooldown(cooldownSeconds)}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Podrás enviar un nuevo código cuando el temporizador llegue a 0:00
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="inline-flex items-center gap-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-full px-5 py-2.5">
                  <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">¡Listo! Ya puedes intentar de nuevo</span>
                </div>
              </div>
            )}
          </div>
          <Button
            variant={cooldownSeconds > 0 ? "outline" : "default"}
            onClick={() => setShowCooldownDialog(false)}
            className="w-full"
          >
            {cooldownSeconds > 0 ? 'Entendido' : 'Continuar'}
          </Button>
        </DialogContent>
      </Dialog>

      {/* Policies Dialog */}
      <Dialog open={showPoliciesDialog} onOpenChange={setShowPoliciesDialog}>
        <DialogContent className="sm:max-w-3xl max-h-[90dvh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Documentos legales
            </DialogTitle>
            <DialogDescription>
              Revisa nuestros Términos y Condiciones y el Aviso de Privacidad antes de crear tu cuenta.
            </DialogDescription>
          </DialogHeader>
          <Tabs defaultValue="terminos" className="flex-1 min-h-0 flex flex-col">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="terminos">Términos y Condiciones</TabsTrigger>
              <TabsTrigger value="privacidad">Aviso de Privacidad</TabsTrigger>
            </TabsList>
            <TabsContent value="terminos" className="flex-1 min-h-0 overflow-y-auto max-h-[50vh] mt-4 pr-2">
              <div className="prose prose-sm max-w-none text-foreground/90 space-y-4 text-xs">
                <section>
                  <h3 className="text-sm font-bold text-foreground">1. Aceptación de los Términos</h3>
                  <p>Al acceder, registrarse o utilizar la plataforma RutApp, usted acepta estos Términos y Condiciones en su totalidad.</p>
                </section>
                <section>
                  <h3 className="text-sm font-bold text-foreground">2. Descripción del Servicio</h3>
                  <p>RutApp es una plataforma de gestión empresarial en la nube (SaaS) que incluye: ventas, inventario, facturación CFDI 4.0, logística, cobranza, punto de venta y reportes.</p>
                </section>
                <section>
                  <h3 className="text-sm font-bold text-foreground">3. Registro y Cuenta</h3>
                  <ul className="list-disc pl-5 space-y-1">
                    <li>Información veraz, completa y actualizada.</li>
                    <li>Correo y teléfono únicos.</li>
                    <li>Cada cuenta es personal e intransferible.</li>
                    <li>Mayor de 18 años.</li>
                    <li>Verificación de identidad obligatoria.</li>
                  </ul>
                </section>
                <section>
                  <h3 className="text-sm font-bold text-foreground">4. Planes, Pagos y Suscripciones</h3>
                  <ul className="list-disc pl-5 space-y-1">
                    <li>Periodo de prueba gratuito de 7 días naturales.</li>
                    <li>3 días de gracia adicionales antes de suspender.</li>
                    <li>Pagos seguros mediante Stripe. No almacenamos tarjetas.</li>
                    <li>Renovación automática mensual salvo cancelación.</li>
                    <li>Timbres fiscales no reembolsables.</li>
                    <li>La Empresa puede modificar precios con 30 días de aviso.</li>
                  </ul>
                </section>
                <section>
                  <h3 className="text-sm font-bold text-foreground">5. Cobro Automático</h3>
                  <ul className="list-disc pl-5 space-y-1">
                    <li>Cobro automático recurrente mensual autorizado.</li>
                    <li>Si falla, hasta 3 intentos en 7 días antes de suspender.</li>
                    <li>Cambios de plan con ajuste prorrateado.</li>
                    <li>Aumento de usuarios genera cargo prorrateado inmediato.</li>
                  </ul>
                </section>
                <section>
                  <h3 className="text-sm font-bold text-foreground">6. Cancelación</h3>
                  <ul className="list-disc pl-5 space-y-1">
                    <li>Cancelación en cualquier momento desde el panel.</li>
                    <li>Acceso activo hasta final del periodo pagado.</li>
                    <li>No reembolsos parciales salvo errores comprobados.</li>
                    <li>Datos conservados 30 días tras cancelación.</li>
                  </ul>
                </section>
                <section>
                  <h3 className="text-sm font-bold text-foreground">7. Política de Reembolso</h3>
                  <ul className="list-disc pl-5 space-y-1">
                    <li>La prueba no genera cargo.</li>
                    <li>Cargos mensuales no reembolsables salvo duplicados o errores.</li>
                    <li>Timbres fiscales no reembolsables.</li>
                    <li>Disputas dentro de 15 días naturales posteriores al cargo.</li>
                  </ul>
                </section>
                <section>
                  <h3 className="text-sm font-bold text-foreground">8. Baja de Cuenta</h3>
                  <ul className="list-disc pl-5 space-y-1">
                    <li>Eliminación permanente de datos en máximo 30 días.</li>
                    <li>CFDI conservados 5 años por ley fiscal.</li>
                    <li>Datos de facturación conservados por obligaciones contables.</li>
                  </ul>
                </section>
                <section>
                  <h3 className="text-sm font-bold text-foreground">9. Uso Aceptable</h3>
                  <ul className="list-disc pl-5 space-y-1">
                    <li>Usos lícitos y comerciales legítimos únicamente.</li>
                    <li>No accesos no autorizados ni ingeniería inversa.</li>
                    <li>No virus, spam ni sobrecarga de servidores.</li>
                  </ul>
                </section>
                <section>
                  <h3 className="text-sm font-bold text-foreground">10. Propiedad Intelectual</h3>
                  <p>Todo el software, diseño, código, logos y marcas son propiedad exclusiva de RutApp. El Usuario retiene la propiedad de sus datos comerciales.</p>
                </section>
                <section>
                  <h3 className="text-sm font-bold text-foreground">11. Limitación de Responsabilidad</h3>
                  <ul className="list-disc pl-5 space-y-1">
                    <li>Servicio "tal cual" sin garantías expresas.</li>
                    <li>Responsabilidad máxima limitada a 3 meses de pago.</li>
                    <li>No responsable por errores en información fiscal del Usuario.</li>
                  </ul>
                </section>
                <section>
                  <h3 className="text-sm font-bold text-foreground">12. Legislación</h3>
                  <p>Leyes de los Estados Unidos Mexicanos. Jurisdicción: Guadalajara, Jalisco.</p>
                </section>
              </div>
            </TabsContent>
            <TabsContent value="privacidad" className="flex-1 min-h-0 overflow-y-auto max-h-[50vh] mt-4 pr-2">
              <div className="prose prose-sm max-w-none text-foreground/90 space-y-4 text-xs">
                <section>
                  <h3 className="text-sm font-bold text-foreground">1. Responsable</h3>
                  <p>RutApp es responsable del tratamiento de datos conforme a la LFPDPPP. Domicilio: Guadalajara, Jalisco, México.</p>
                </section>
                <section>
                  <h3 className="text-sm font-bold text-foreground">2. Datos Recabados</h3>
                  <ul className="list-disc pl-5 space-y-1">
                    <li><strong>Identificación:</strong> Nombre, correo, teléfono.</li>
                    <li><strong>Empresa:</strong> Nombre comercial, RFC, régimen fiscal.</li>
                    <li><strong>Financieros:</strong> Procesados por Stripe (no almacenamos tarjetas).</li>
                    <li><strong>Uso:</strong> IP, dispositivo, GPS (con autorización).</li>
                    <li><strong>Fiscales:</strong> CSD, constancias, CFDI.</li>
                  </ul>
                </section>
                <section>
                  <h3 className="text-sm font-bold text-foreground">3. Finalidades</h3>
                  <p><strong>Primarias:</strong></p>
                  <ul className="list-disc pl-5 space-y-1">
                    <li>Crear y administrar su cuenta.</li>
                    <li>Proveer los servicios contratados.</li>
                    <li>Procesar pagos y cobros recurrentes.</li>
                    <li>Emitir CFDI ante el SAT.</li>
                    <li>Verificar identidad.</li>
                    <li>Cumplir obligaciones legales y fiscales.</li>
                  </ul>
                  <p className="mt-2"><strong>Secundarias (opcionales):</strong></p>
                  <ul className="list-disc pl-5 space-y-1">
                    <li>Comunicaciones promocionales.</li>
                    <li>Análisis estadísticos para mejorar el servicio.</li>
                  </ul>
                </section>
                <section>
                  <h3 className="text-sm font-bold text-foreground">4. Datos Financieros</h3>
                  <ul className="list-disc pl-5 space-y-1">
                    <li>Stripe procesa pagos con PCI DSS Nivel 1.</li>
                    <li>No almacenamos datos de tarjetas.</li>
                    <li>Cobros recurrentes autorizados al registrar método de pago.</li>
                  </ul>
                </section>
                <section>
                  <h3 className="text-sm font-bold text-foreground">5. Transferencias</h3>
                  <ul className="list-disc pl-5 space-y-1">
                    <li><strong>Stripe, Inc.</strong> — Pagos (EE.UU., PCI DSS).</li>
                    <li><strong>Supabase, Inc.</strong> — Almacenamiento y autenticación (EE.UU.).</li>
                    <li><strong>Facturama</strong> — Emisión CFDI (México).</li>
                    <li><strong>WhatsAPI</strong> — Notificaciones y OTP.</li>
                    <li><strong>Google Maps</strong> — Geolocalización.</li>
                    <li><strong>SAT</strong> — Cuando lo requiera la ley.</li>
                  </ul>
                </section>
                <section>
                  <h3 className="text-sm font-bold text-foreground">6. Derechos ARCO</h3>
                  <p>Usted tiene derecho a Acceder, Rectificar, Cancelar u Oponerse al tratamiento. Envíe solicitud a soporte@rutapp.com con identificación oficial. Respuesta en 20 días hábiles.</p>
                </section>
                <section>
                  <h3 className="text-sm font-bold text-foreground">7. Seguridad</h3>
                  <ul className="list-disc pl-5 space-y-1">
                    <li>Cifrado TLS/SSL en tránsito y reposo.</li>
                    <li>Acceso basado en roles (RLS).</li>
                    <li>Aislamiento multi-tenant.</li>
                    <li>Respaldos diarios y redundancia geográfica.</li>
                    <li>Monitoreo continuo.</li>
                  </ul>
                </section>
                <section>
                  <h3 className="text-sm font-bold text-foreground">8. Cookies</h3>
                  <p>Uso exclusivo para sesión segura, preferencias, funcionalidad offline (PWA) y sincronización. Sin cookies de terceros publicitarias.</p>
                </section>
                <section>
                  <h3 className="text-sm font-bold text-foreground">9. Conservación</h3>
                  <ul className="list-disc pl-5 space-y-1">
                    <li>Datos activos mientras la cuenta esté vigente.</li>
                    <li>30 días tras cancelación para reactivación.</li>
                    <li>CFDI conservados 5 años por ley fiscal.</li>
                    <li>Registros de pagos por obligaciones contables.</li>
                  </ul>
                </section>
                <section>
                  <h3 className="text-sm font-bold text-foreground">10. Contacto</h3>
                  <p>Para ejercer derechos ARCO o consultas de privacidad: soporte@rutapp.com.</p>
                </section>
              </div>
            </TabsContent>
          </Tabs>
          <div className="flex gap-2 pt-2 border-t">
            <Button variant="outline" size="sm" className="flex-1" asChild>
              <Link to="/terminos" target="_blank">Ver Términos completos</Link>
            </Button>
            <Button variant="outline" size="sm" className="flex-1" asChild>
              <Link to="/privacidad" target="_blank">Ver Privacidad completo</Link>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
