import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { ArrowLeft, Building2, Phone, Mail, User, Lock, Loader2, ShieldCheck, MessageCircle, Eye, EyeOff } from 'lucide-react';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';

const COUNTRY_CODES = [
  { code: '+52', country: 'MX', label: '🇲🇽 México (+52)', digits: 10 },
  { code: '+502', country: 'GT', label: '🇬🇹 Guatemala (+502)', digits: 8 },
  { code: '+57', country: 'CO', label: '🇨🇴 Colombia (+57)', digits: 10 },
  { code: '+54', country: 'AR', label: '🇦🇷 Argentina (+54)', digits: 10 },
  { code: '+51', country: 'PE', label: '🇵🇪 Perú (+51)', digits: 9 },
  { code: '+56', country: 'CL', label: '🇨🇱 Chile (+56)', digits: 9 },
  { code: '+593', country: 'EC', label: '🇪🇨 Ecuador (+593)', digits: 9 },
  { code: '+591', country: 'BO', label: '🇧🇴 Bolivia (+591)', digits: 8 },
  { code: '+595', country: 'PY', label: '🇵🇾 Paraguay (+595)', digits: 9 },
  { code: '+598', country: 'UY', label: '🇺🇾 Uruguay (+598)', digits: 8 },
  { code: '+507', country: 'PA', label: '🇵🇦 Panamá (+507)', digits: 8 },
  { code: '+506', country: 'CR', label: '🇨🇷 Costa Rica (+506)', digits: 8 },
  { code: '+503', country: 'SV', label: '🇸🇻 El Salvador (+503)', digits: 8 },
  { code: '+504', country: 'HN', label: '🇭🇳 Honduras (+504)', digits: 8 },
  { code: '+505', country: 'NI', label: '🇳🇮 Nicaragua (+505)', digits: 8 },
  { code: '+1', country: 'US', label: '🇺🇸 EE.UU. (+1)', digits: 10 },
];

type VerificationMethod = 'whatsapp' | 'email' | null;

export default function SignupPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
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
  const [form, setForm] = useState({
    nombre: '',
    empresa: '',
    email: '',
    password: '',
    countryCode: '+52',
    telefono: '',
  });

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
    setSendingOtp(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-otp', {
        body: { action: 'send', phone: fullPhone },
      });
      if (error) throw new Error(error.message || 'Error al enviar código');
      if (data?.error) throw new Error(data.error);
      setOtpSent(true);
      setShowOtpDialog(true);
      toast.success('Código enviado por WhatsApp 📲');
    } catch (err: any) {
      toast.error(err.message || 'Error al enviar el código');
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
    if (!verificationMethod) {
      toast.error('Selecciona un método de verificación');
      return;
    }
    if (verificationMethod === 'whatsapp' && !otpVerified) {
      toast.error('Debes verificar tu número de WhatsApp');
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
            verified_via: verificationMethod,
          },
          emailRedirectTo: window.location.origin,
        },
      });

      if (signupError) throw signupError;

      const successMsg = verificationMethod === 'email'
        ? '¡Cuenta creada! Revisa tu correo electrónico para confirmar tu cuenta y activarla.'
        : '¡Cuenta creada exitosamente! Revisa tu email para confirmar tu cuenta.';

      toast.success(successMsg, { duration: 8000 });
      navigate('/login');
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
    isVerified &&
    acceptedTerms &&
    acceptedPrivacy &&
    form.email.trim() &&
    form.telefono.trim() &&
    form.empresa.trim() &&
    form.nombre.trim() &&
    form.password.length >= 6 &&
    form.password === confirmPassword;

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-muted/30">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="text-center">
          <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4">
            <ArrowLeft className="h-4 w-4" /> Volver al inicio
          </Link>
          <CardTitle className="text-2xl font-black">Crear cuenta</CardTitle>
          <p className="text-sm text-muted-foreground">7 días de prueba gratis · Sin tarjeta de crédito</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSignup} className="space-y-4">
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

            {/* Email */}
            <div className="space-y-2">
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

            {/* Phone */}
            <div className="space-y-2">
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
                  <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
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

            {/* Verification method */}
            <div className="space-y-3 p-3 bg-muted/40 rounded-lg border">
              <p className="text-sm font-medium text-center">Verifica tu identidad</p>

              {otpVerified && verificationMethod === 'whatsapp' ? (
                <div className="flex items-center gap-2 text-sm text-emerald-600 font-medium bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                  <ShieldCheck className="h-4 w-4" />
                  Número verificado por WhatsApp
                </div>
              ) : verificationMethod === 'email' ? (
                <div className="flex items-center gap-2 text-sm text-blue-600 font-medium bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                  <Mail className="h-4 w-4" />
                  Se enviará un enlace de confirmación a tu correo al crear la cuenta
                </div>
              ) : null}

              {/* Method selector buttons */}
              {!(otpVerified && verificationMethod === 'whatsapp') && (
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant={verificationMethod === 'whatsapp' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => handleSelectMethod('whatsapp')}
                    className="flex flex-col h-auto py-3 gap-1"
                  >
                    <MessageCircle className="h-5 w-5" />
                    <span className="text-xs">WhatsApp OTP</span>
                  </Button>
                  <Button
                    type="button"
                    variant={verificationMethod === 'email' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => handleSelectMethod('email')}
                    className="flex flex-col h-auto py-3 gap-1"
                  >
                    <Mail className="h-5 w-5" />
                    <span className="text-xs">Correo electrónico</span>
                  </Button>
                </div>
              )}

              {/* WhatsApp OTP flow */}
              {verificationMethod === 'whatsapp' && !otpVerified && (
                <>
                  {!otpSent ? (
                    <Button
                      type="button" variant="outline" size="sm"
                      onClick={handleSendOtp}
                      disabled={sendingOtp || !form.telefono}
                      className="w-full"
                    >
                      {sendingOtp ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <MessageCircle className="h-4 w-4 mr-1.5" />}
                      Enviar código por WhatsApp
                    </Button>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-xs text-muted-foreground text-center">
                        Ingresa el código de 6 dígitos enviado a tu WhatsApp
                      </p>
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
                  )}
                </>
              )}
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

            {/* Terms & Privacy */}
            <div className="space-y-3 pt-2 border-t">
              <div className="flex items-start gap-2">
                <Checkbox id="terms" checked={acceptedTerms} onCheckedChange={v => setAcceptedTerms(v === true)} />
                <label htmlFor="terms" className="text-xs text-muted-foreground leading-tight cursor-pointer">
                  Acepto los <Link to="/terminos" target="_blank" className="text-primary font-medium hover:underline">Términos y Condiciones</Link> del servicio.
                </label>
              </div>
              <div className="flex items-start gap-2">
                <Checkbox id="privacy" checked={acceptedPrivacy} onCheckedChange={v => setAcceptedPrivacy(v === true)} />
                <label htmlFor="privacy" className="text-xs text-muted-foreground leading-tight cursor-pointer">
                  Acepto el <Link to="/privacidad" target="_blank" className="text-primary font-medium hover:underline">Aviso de Privacidad</Link> y el tratamiento de mis datos personales.
                </label>
              </div>
            </div>

            <Button type="submit" disabled={loading || !isFormReady} className="w-full" size="lg">
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Crear mi cuenta
            </Button>

            <p className="text-center text-sm text-muted-foreground">
              ¿Ya tienes cuenta? <Link to="/login" className="text-primary font-medium hover:underline">Iniciar sesión</Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
