import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { ArrowLeft, Building2, Phone, Mail, User, Lock, Loader2, ShieldCheck, MessageCircle } from 'lucide-react';
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
  const [form, setForm] = useState({
    nombre: '',
    empresa: '',
    email: '',
    password: '',
    countryCode: '+52',
    telefono: '',
  });

  const selectedCountry = COUNTRY_CODES.find(c => c.code === form.countryCode) || COUNTRY_CODES[0];

  function validatePhone() {
    const digits = form.telefono.replace(/\D/g, '');
    if (digits.length !== selectedCountry.digits) {
      return `El número debe tener ${selectedCountry.digits} dígitos para ${selectedCountry.country}`;
    }
    return null;
  }

  const fullPhone = form.countryCode + form.telefono.replace(/\D/g, '');

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

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();

    if (!otpVerified) {
      toast.error('Debes verificar tu número de teléfono');
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

    setLoading(true);
    try {
      const { data: signupData, error: signupError } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
        options: {
          data: {
            full_name: form.nombre,
            phone: fullPhone,
            empresa_nombre: form.empresa,
            accepted_terms_at: new Date().toISOString(),
          },
          emailRedirectTo: window.location.origin,
        },
      });

      if (signupError) throw signupError;

      toast.success(
        'Cuenta creada exitosamente. Revisa tu email para confirmar tu cuenta.',
        { duration: 8000 }
      );
      navigate('/login');
    } catch (err: any) {
      toast.error(err.message || 'Error al crear la cuenta');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: 'hsl(220, 14%, 98%)' }}>
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
            <div className="space-y-2">
              <Label className="flex items-center gap-2"><User className="h-4 w-4" /> Tu nombre</Label>
              <Input
                required
                value={form.nombre}
                onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                placeholder="Juan Pérez"
              />
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2"><Building2 className="h-4 w-4" /> Nombre de tu empresa</Label>
              <Input
                required
                value={form.empresa}
                onChange={e => setForm(f => ({ ...f, empresa: e.target.value }))}
                placeholder="Distribuidora Norte S.A."
              />
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2"><Mail className="h-4 w-4" /> Email</Label>
              <Input
                type="email"
                required
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                placeholder="tu@empresa.com"
              />
            </div>

            {/* Phone + OTP verification */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2"><Phone className="h-4 w-4" /> Teléfono</Label>
              <div className="flex gap-2">
                <Select
                  value={form.countryCode}
                  onValueChange={v => {
                    setForm(f => ({ ...f, countryCode: v }));
                    setOtpSent(false);
                    setOtpVerified(false);
                    setOtpCode('');
                  }}
                  disabled={otpVerified}
                >
                  <SelectTrigger className="w-[180px]">
                    <SelectValue />
                  </SelectTrigger>
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
                    if (otpSent) {
                      setOtpSent(false);
                      setOtpVerified(false);
                      setOtpCode('');
                    }
                  }}
                  placeholder={`${'0'.repeat(selectedCountry.digits)}`}
                  maxLength={selectedCountry.digits + 2}
                  disabled={otpVerified}
                />
              </div>
              <p className="text-xs text-muted-foreground">{selectedCountry.digits} dígitos para {selectedCountry.country}</p>

              {/* OTP section */}
              {otpVerified ? (
                <div className="flex items-center gap-2 text-sm text-emerald-600 font-medium bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                  <ShieldCheck className="h-4 w-4" />
                  Número verificado
                </div>
              ) : !otpSent ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleSendOtp}
                  disabled={sendingOtp || !form.telefono}
                  className="w-full"
                >
                  {sendingOtp ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                  ) : (
                    <MessageCircle className="h-4 w-4 mr-1.5" />
                  )}
                  Enviar código por WhatsApp
                </Button>
              ) : (
                <div className="space-y-3 p-3 bg-muted/50 rounded-lg border">
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
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleSendOtp}
                      disabled={sendingOtp}
                      className="flex-1"
                    >
                      {sendingOtp ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Reenviar'}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleVerifyOtp}
                      disabled={verifyingOtp || otpCode.length !== 6}
                      className="flex-1"
                    >
                      {verifyingOtp ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <ShieldCheck className="h-3 w-3 mr-1" />}
                      Verificar
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2"><Lock className="h-4 w-4" /> Contraseña</Label>
              <Input
                type="password"
                required
                minLength={6}
                value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                placeholder="Mínimo 6 caracteres"
              />
            </div>

            {/* Terms & Privacy */}
            <div className="space-y-3 pt-2 border-t">
              <div className="flex items-start gap-2">
                <Checkbox
                  id="terms"
                  checked={acceptedTerms}
                  onCheckedChange={v => setAcceptedTerms(v === true)}
                />
                <label htmlFor="terms" className="text-xs text-muted-foreground leading-tight cursor-pointer">
                  Acepto los{' '}
                  <Link to="/terminos" target="_blank" className="text-primary font-medium hover:underline">
                    Términos y Condiciones
                  </Link>{' '}
                  del servicio.
                </label>
              </div>
              <div className="flex items-start gap-2">
                <Checkbox
                  id="privacy"
                  checked={acceptedPrivacy}
                  onCheckedChange={v => setAcceptedPrivacy(v === true)}
                />
                <label htmlFor="privacy" className="text-xs text-muted-foreground leading-tight cursor-pointer">
                  Acepto el{' '}
                  <Link to="/privacidad" target="_blank" className="text-primary font-medium hover:underline">
                    Aviso de Privacidad
                  </Link>{' '}
                  y el tratamiento de mis datos personales.
                </label>
              </div>
            </div>

            <Button
              type="submit"
              disabled={loading || !otpVerified || !acceptedTerms || !acceptedPrivacy}
              className="w-full"
              size="lg"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Crear mi cuenta
            </Button>

            <p className="text-center text-sm text-muted-foreground">
              ¿Ya tienes cuenta?{' '}
              <Link to="/login" className="text-primary font-medium hover:underline">
                Iniciar sesión
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
