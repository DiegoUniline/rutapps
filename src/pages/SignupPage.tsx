import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { ArrowLeft, Building2, Phone, Mail, User, Lock, Loader2 } from 'lucide-react';

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

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    const phoneError = validatePhone();
    if (phoneError) {
      toast.error(phoneError);
      return;
    }
    if (form.password.length < 6) {
      toast.error('La contraseña debe tener al menos 6 caracteres');
      return;
    }

    setLoading(true);
    try {
      const fullPhone = form.countryCode + form.telefono.replace(/\D/g, '');

      // 1. Sign up user
      const { data: signupData, error: signupError } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
        options: {
          data: {
            full_name: form.nombre,
            phone: fullPhone,
            empresa_nombre: form.empresa,
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

            <div className="space-y-2">
              <Label className="flex items-center gap-2"><Phone className="h-4 w-4" /> Teléfono</Label>
              <div className="flex gap-2">
                <Select value={form.countryCode} onValueChange={v => setForm(f => ({ ...f, countryCode: v }))}>
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
                  onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))}
                  placeholder={`${'0'.repeat(selectedCountry.digits)}`}
                  maxLength={selectedCountry.digits + 2}
                />
              </div>
              <p className="text-xs text-muted-foreground">{selectedCountry.digits} dígitos para {selectedCountry.country}</p>
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

            <Button type="submit" disabled={loading} className="w-full" size="lg">
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
