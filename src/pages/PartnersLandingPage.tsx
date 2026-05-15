import { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { Handshake, DollarSign, Tag, BarChart3, ShieldCheck, CheckCircle2, ArrowRight } from 'lucide-react';

const LADAS = [
  { code: '+52', flag: '🇲🇽', name: 'México' },
  { code: '+1', flag: '🇺🇸', name: 'EE.UU. / Canadá' },
  { code: '+54', flag: '🇦🇷', name: 'Argentina' },
  { code: '+55', flag: '🇧🇷', name: 'Brasil' },
  { code: '+56', flag: '🇨🇱', name: 'Chile' },
  { code: '+57', flag: '🇨🇴', name: 'Colombia' },
  { code: '+506', flag: '🇨🇷', name: 'Costa Rica' },
  { code: '+593', flag: '🇪🇨', name: 'Ecuador' },
  { code: '+503', flag: '🇸🇻', name: 'El Salvador' },
  { code: '+34', flag: '🇪🇸', name: 'España' },
  { code: '+502', flag: '🇬🇹', name: 'Guatemala' },
  { code: '+504', flag: '🇭🇳', name: 'Honduras' },
  { code: '+505', flag: '🇳🇮', name: 'Nicaragua' },
  { code: '+507', flag: '🇵🇦', name: 'Panamá' },
  { code: '+595', flag: '🇵🇾', name: 'Paraguay' },
  { code: '+51', flag: '🇵🇪', name: 'Perú' },
  { code: '+1', flag: '🇩🇴', name: 'Rep. Dominicana' },
  { code: '+598', flag: '🇺🇾', name: 'Uruguay' },
  { code: '+58', flag: '🇻🇪', name: 'Venezuela' },
];

export default function PartnersLandingPage() {
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [lada, setLada] = useState('+52');
  const [form, setForm] = useState({
    nombre: '', email: '', telefono: '', motivo: '', experiencia: '', redes: '',
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nombre.trim() || !form.email.trim()) {
      toast.error('Nombre y correo son obligatorios');
      return;
    }
    setLoading(true);
    const { error } = await supabase.from('partner_solicitudes').insert({
      nombre: form.nombre.trim(),
      email: form.email.trim().toLowerCase(),
      telefono: form.telefono.trim() ? `${lada} ${form.telefono.trim()}` : null,
      motivo: form.motivo.trim() || null,
      experiencia: form.experiencia.trim() || null,
      redes: form.redes.trim() || null,
    });
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    setSent(true);
  };

  return (
    <div className="min-h-screen text-gray-900" style={{ background: 'hsl(25, 100%, 97%)' }}>
      {/* Nav */}
      <nav className="fixed top-0 inset-x-0 z-50 backdrop-blur border-b border-orange-100" style={{ background: 'hsla(25, 100%, 97%, 0.9)' }}>
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <img src="https://res.cloudinary.com/dstcnsu6a/image/upload/v1774544059/Imagen_p4jkid.png" alt="Rutapp" className="h-8 w-8 rounded-lg" />
            <span className="text-xl font-black tracking-tight" style={{ color: 'hsl(230, 55%, 52%)' }}>Rutapp</span>
            <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-semibold">Partners</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link to="/" className="text-sm text-gray-600 hover:text-gray-900">Inicio</Link>
            <Link to="/login" className="text-sm text-gray-600 hover:text-gray-900">Iniciar sesión</Link>
            <a href="#aplicar" className="px-4 py-2 text-sm font-semibold text-white rounded-lg shadow"
               style={{ background: 'hsl(230, 55%, 52%)' }}>Unirme</a>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-32 pb-16 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-50 text-indigo-700 text-xs font-semibold mb-6">
            <Handshake className="h-3.5 w-3.5" /> Programa de Partners Rutapp
          </div>
          <h1 className="text-5xl md:text-6xl font-black tracking-tight leading-[1.05] mb-6">
            Gana <span style={{ color: 'hsl(230, 55%, 52%)' }}>comisiones recurrentes</span><br />refiriendo Rutapp
          </h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto mb-8">
            Recibe un porcentaje de cada pago mensual de las empresas que traigas, mientras sigan activas. Crea tus propios cupones, ten tu link de referido y administra todo desde tu panel.
          </p>
          <a href="#aplicar"
             className="inline-flex items-center gap-2 px-7 py-3.5 text-base font-semibold text-white rounded-xl shadow-lg"
             style={{ background: 'hsl(230, 55%, 52%)' }}>
            Aplicar como Partner <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      </section>

      {/* Beneficios */}
      <section className="py-16 px-6" style={{ background: 'hsl(25, 95%, 94%)' }}>
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-black text-center mb-12">¿Cómo funciona?</h2>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              { icon: DollarSign, title: 'Comisión recurrente', text: 'Ganas un % cada mes que tu cliente referido pague su suscripción. Mientras siga activo, sigues cobrando.' },
              { icon: Tag, title: 'Cupones propios', text: 'Crea cupones de descuento con tu marca. El descuento se resta de tu comisión, así tú decides cuánto regalas.' },
              { icon: BarChart3, title: 'Panel completo', text: 'Dashboard con tus empresas referidas, comisiones generadas, pagadas y pendientes. Transparencia total.' },
            ].map((b, i) => (
              <Card key={i} className="p-6 border-gray-100 hover:shadow-lg transition">
                <div className="h-11 w-11 rounded-xl flex items-center justify-center mb-4"
                     style={{ background: 'hsl(230, 55%, 96%)', color: 'hsl(230, 55%, 52%)' }}>
                  <b.icon className="h-5 w-5" />
                </div>
                <h3 className="font-bold text-lg mb-2">{b.title}</h3>
                <p className="text-sm text-gray-600">{b.text}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Comisión cómo se calcula */}
      <section className="py-16 px-6">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-black text-center mb-4">¿Cómo se calcula tu comisión?</h2>
          <p className="text-center text-gray-600 mb-10">Fórmula simple y transparente:</p>
          <Card className="p-8 bg-gradient-to-br from-indigo-50 to-white border-indigo-100">
            <div className="text-center font-mono text-2xl md:text-3xl font-bold mb-6" style={{ color: 'hsl(230, 55%, 52%)' }}>
              (% Partner − % Cupón) × Monto pagado
            </div>
            <div className="grid md:grid-cols-2 gap-4 text-sm">
              <div className="bg-white p-4 rounded-lg border">
                <div className="font-semibold mb-1">Ejemplo 1 — sin cupón</div>
                <div className="text-gray-600">Tu comisión: <b>20%</b> · Cliente paga <b>$500</b></div>
                <div className="mt-2 text-emerald-700 font-bold">Ganas $100 / mes</div>
              </div>
              <div className="bg-white p-4 rounded-lg border">
                <div className="font-semibold mb-1">Ejemplo 2 — con cupón 5%</div>
                <div className="text-gray-600">Tu comisión: <b>20%</b> · Cupón: <b>5%</b> · Cliente paga <b>$475</b></div>
                <div className="mt-2 text-emerald-700 font-bold">Ganas $71.25 / mes</div>
              </div>
            </div>
          </Card>
        </div>
      </section>

      {/* Políticas */}
      <section className="py-16 px-6" style={{ background: 'hsl(25, 95%, 94%)' }}>
        <div className="max-w-3xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-black text-center mb-10">Políticas del programa</h2>
          <div className="space-y-3">
            {[
              'Atribución por link único de referido o cupón al momento del registro. La empresa queda asignada de forma permanente al partner.',
              'Las comisiones se generan únicamente sobre pagos efectivamente cobrados (suscripción mensual). Pagos cancelados o reembolsados no generan comisión.',
              'El cupón nunca puede ser mayor que tu porcentaje de comisión. Si lo iguala, tu comisión en esa venta es cero.',
              'Los pagos a partners se hacen manualmente vía transferencia, mínimo $500 MXN acumulados, una vez al mes.',
              'Un usuario sólo puede tener un rol: o eres cliente de Rutapp, o eres Partner. No ambos con el mismo correo.',
              'No está permitido aplicar tu propio cupón a una empresa que tú mismo controles (autoreferido). Estas comisiones se cancelan.',
              'Rutapp se reserva el derecho de suspender o dar de baja partners que incumplan estas políticas o realicen prácticas engañosas.',
              'El programa puede cambiar términos con aviso previo de 30 días para partners activos.',
            ].map((p, i) => (
              <div key={i} className="flex gap-3 bg-white p-4 rounded-lg border border-gray-100">
                <CheckCircle2 className="h-5 w-5 flex-shrink-0 mt-0.5" style={{ color: 'hsl(230, 55%, 52%)' }} />
                <p className="text-sm text-gray-700">{p}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Form */}
      <section id="aplicar" className="py-20 px-6">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-10">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl mb-4"
                 style={{ background: 'hsl(230, 55%, 96%)', color: 'hsl(230, 55%, 52%)' }}>
              <ShieldCheck className="h-6 w-6" />
            </div>
            <h2 className="text-3xl md:text-4xl font-black mb-3">Aplica para ser Partner</h2>
            <p className="text-gray-600">Revisamos cada solicitud manualmente. Te avisaremos por correo cuando sea aprobada.</p>
          </div>

          {sent ? (
            <Card className="p-10 text-center border-emerald-200 bg-emerald-50">
              <CheckCircle2 className="h-14 w-14 text-emerald-600 mx-auto mb-4" />
              <h3 className="text-2xl font-bold mb-2">¡Solicitud enviada!</h3>
              <p className="text-gray-700 mb-6">Te enviaremos un correo cuando tu solicitud sea revisada (normalmente en 1-3 días).</p>
              <Link to="/" className="text-sm font-semibold underline" style={{ color: 'hsl(230, 55%, 52%)' }}>Volver al inicio</Link>
            </Card>
          ) : (
            <Card className="p-8">
              <form onSubmit={submit} className="space-y-4">
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <Label>Nombre completo *</Label>
                    <Input value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} required />
                  </div>
                  <div>
                    <Label>Correo electrónico *</Label>
                    <Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required />
                  </div>
                </div>
                <div>
                  <Label>Teléfono / WhatsApp</Label>
                  <div className="flex gap-2">
                    <select
                      value={lada}
                      onChange={e => setLada(e.target.value)}
                      className="h-10 px-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring min-w-[130px]"
                      aria-label="Lada"
                    >
                      {LADAS.map((l, i) => (
                        <option key={`${l.code}-${i}`} value={l.code}>{l.flag} {l.name} ({l.code})</option>
                      ))}
                    </select>
                    <Input
                      type="tel"
                      value={form.telefono}
                      onChange={e => setForm({ ...form, telefono: e.target.value.replace(/[^0-9 ]/g, '') })}
                      placeholder="55 1234 5678"
                      className="flex-1"
                    />
                  </div>
                </div>
                <div>
                  <Label>¿Por qué quieres ser Partner?</Label>
                  <Textarea rows={3} value={form.motivo} onChange={e => setForm({ ...form, motivo: e.target.value })}
                    placeholder="Cuéntanos qué te motiva, a quién planeas referir..." />
                </div>
                <div>
                  <Label>Experiencia previa</Label>
                  <Textarea rows={2} value={form.experiencia} onChange={e => setForm({ ...form, experiencia: e.target.value })}
                    placeholder="¿Vendes software? ¿Eres consultor? ¿Tienes una agencia?" />
                </div>
                <div>
                  <Label>Redes / Sitio web</Label>
                  <Input value={form.redes} onChange={e => setForm({ ...form, redes: e.target.value })} placeholder="@usuario, link, etc." />
                </div>
                <Button type="submit" disabled={loading} className="w-full h-12 text-base font-semibold"
                        style={{ background: 'hsl(230, 55%, 52%)' }}>
                  {loading ? 'Enviando...' : 'Enviar solicitud'}
                </Button>
                <p className="text-xs text-gray-500 text-center">Al enviar aceptas las políticas del programa.</p>
              </form>
            </Card>
          )}
        </div>
      </section>

      <footer className="border-t border-gray-100 py-8 px-6 text-center text-sm text-gray-500">
        © {new Date().getFullYear()} Rutapp · <Link to="/" className="hover:underline">Inicio</Link> · <Link to="/terminos" className="hover:underline">Términos</Link>
      </footer>
    </div>
  );
}
