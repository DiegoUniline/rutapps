import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { MessageCircle, Save, Eye, EyeOff, CheckCircle2, AlertCircle, Smartphone, Bell, CreditCard, XCircle, Ban } from 'lucide-react';

/* ─── Field labels per template type ─── */
const FIELD_LABELS: Record<string, Record<string, string>> = {
  pre_cobro: {
    nombre_cliente: 'Nombre del cliente',
    nombre_empresa: 'Nombre de la empresa',
    monto: 'Monto a cobrar',
    fecha_cobro: 'Fecha de cobro',
    num_usuarios: 'Número de usuarios',
    enlace_facturacion: 'Enlace a facturación',
    mensaje_despedida: 'Mensaje de despedida',
  },
  cobro_exitoso: {
    nombre_cliente: 'Nombre del cliente',
    nombre_empresa: 'Nombre de la empresa',
    monto: 'Monto pagado',
    fecha_vigencia: 'Fecha de vigencia',
    mensaje_despedida: 'Mensaje de despedida',
  },
  cobro_fallido: {
    nombre_cliente: 'Nombre del cliente',
    nombre_empresa: 'Nombre de la empresa',
    monto: 'Monto adeudado',
    dias_gracia: 'Días de gracia',
    enlace_pago: 'Enlace de pago',
    advertencia_suspension: 'Advertencia de suspensión',
  },
  suspension: {
    nombre_cliente: 'Nombre del cliente',
    nombre_empresa: 'Nombre de la empresa',
    enlace_facturacion: 'Enlace a facturación',
    mensaje_contacto: 'Mensaje de contacto',
  },
};

const TEMPLATE_META: Record<string, { label: string; icon: typeof Bell; color: string }> = {
  pre_cobro: { label: 'Recordatorio', icon: Bell, color: 'text-amber-500' },
  cobro_exitoso: { label: 'Pago exitoso', icon: CreditCard, color: 'text-emerald-500' },
  cobro_fallido: { label: 'Pago fallido', icon: XCircle, color: 'text-red-500' },
  suspension: { label: 'Suspensión', icon: Ban, color: 'text-red-700' },
};

/* ─── Build preview message ─── */
function buildPreview(tipo: string, campos: Record<string, boolean>, emoji: string, encabezado: string): string {
  const lines: string[] = [];
  lines.push(`${emoji} *${encabezado}*\n`);

  const name = campos.nombre_cliente ? 'Juan Pérez' : '';
  const empresa = campos.nombre_empresa ? 'Distribuidora MX' : '';
  const greeting = name ? `Hola ${name}` : 'Hola';
  const empresaLine = empresa ? ` de *${empresa}*` : '';

  if (tipo === 'pre_cobro') {
    lines.push(`${greeting}${empresaLine},\n`);
    if (campos.fecha_cobro) lines.push('Mañana *1 de abril* se realizará tu cobro automático');
    if (campos.monto) lines.push(`de *$900 MXN*`);
    if (campos.num_usuarios) lines.push('por *3 usuario(s)*.');
    else lines.push('.');
    if (campos.enlace_facturacion) lines.push('\n💳 Si necesitas actualizar tu método de pago:\nhttps://rutapps.lovable.app/facturacion');
    if (campos.mensaje_despedida) lines.push('\n¡Gracias por confiar en Rutapp! 🚀');
  }

  if (tipo === 'cobro_exitoso') {
    lines.push(`${greeting}${empresaLine},\n`);
    if (campos.monto) lines.push('Tu pago de *$900 MXN* se procesó correctamente.');
    else lines.push('Tu pago se procesó correctamente.');
    if (campos.fecha_vigencia) lines.push('\nTu suscripción está activa hasta el *1 de mayo*.');
    if (campos.mensaje_despedida) lines.push('\n¡Gracias! 🎉');
  }

  if (tipo === 'cobro_fallido') {
    lines.push(`${greeting}${empresaLine},\n`);
    lines.push('No pudimos procesar tu pago.');
    if (campos.monto) lines.push('Monto pendiente: *$900 MXN*.');
    if (campos.dias_gracia) lines.push('Tienes *3 días* para regularizar tu pago.');
    if (campos.enlace_pago) lines.push('\n💳 Paga aquí:\nhttps://invoice.stripe.com/i/ejemplo');
    if (campos.advertencia_suspension) lines.push('\n⚠️ Si no regularizas, tu acceso será suspendido.');
  }

  if (tipo === 'suspension') {
    lines.push(`${greeting}${empresaLine},\n`);
    lines.push('Tu cuenta ha sido *suspendida* por falta de pago.');
    if (campos.enlace_facturacion) lines.push('\nPara reactivar tu acceso:\nhttps://rutapps.lovable.app/facturacion');
    if (campos.mensaje_contacto) lines.push('\nSi tienes dudas, contáctanos.');
  }

  return lines.join('\n');
}

/* ─── Types ─── */
interface TemplateData {
  id: string;
  tipo: string;
  campos: Record<string, boolean>;
  emoji: string;
  encabezado: string;
  activo: boolean;
}

export default function AdminWhatsAppTab() {
  const [token, setToken] = useState('');
  const [savedToken, setSavedToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [testPhone, setTestPhone] = useState('');
  const [testing, setTesting] = useState(false);
  const [templates, setTemplates] = useState<TemplateData[]>([]);
  const [savingTemplates, setSavingTemplates] = useState(false);

  useEffect(() => {
    loadConfig();
    loadTemplates();
  }, []);

  async function loadConfig() {
    try {
      const { data } = await supabase
        .from('whatsapp_config')
        .select('api_token, activo')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (data?.api_token) {
        setToken(data.api_token);
        setSavedToken(data.api_token);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function loadTemplates() {
    const { data } = await supabase
      .from('billing_message_templates')
      .select('*')
      .order('created_at', { ascending: true });
    if (data) {
      setTemplates(data.map((t: any) => ({
        id: t.id,
        tipo: t.tipo,
        campos: t.campos as Record<string, boolean>,
        emoji: t.emoji,
        encabezado: t.encabezado || '',
        activo: t.activo,
      })));
    }
  }

  async function saveConfig() {
    setSaving(true);
    try {
      const session = await supabase.auth.getSession();
      const accessToken = session.data.session?.access_token;
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-billing?action=save_whatsapp_token`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ token }),
        }
      );
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setSavedToken(token);
      toast.success('Token de WhatsApp guardado');
    } catch (err: any) {
      toast.error(err.message || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  }

  async function sendTestMessage() {
    if (!testPhone) { toast.error('Ingresa un número de teléfono'); return; }
    setTesting(true);
    try {
      const session = await supabase.auth.getSession();
      const accessToken = session.data.session?.access_token;
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-billing?action=test_whatsapp`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ phone: testPhone }),
        }
      );
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      toast.success('Mensaje de prueba enviado');
    } catch (err: any) {
      toast.error(err.message || 'Error al enviar');
    } finally {
      setTesting(false);
    }
  }

  function toggleCampo(tipo: string, campo: string) {
    setTemplates(prev =>
      prev.map(t =>
        t.tipo === tipo ? { ...t, campos: { ...t.campos, [campo]: !t.campos[campo] } } : t
      )
    );
  }

  function toggleActivo(tipo: string) {
    setTemplates(prev =>
      prev.map(t => (t.tipo === tipo ? { ...t, activo: !t.activo } : t))
    );
  }

  function updateField(tipo: string, field: 'emoji' | 'encabezado', value: string) {
    setTemplates(prev =>
      prev.map(t => (t.tipo === tipo ? { ...t, [field]: value } : t))
    );
  }

  async function saveTemplates() {
    setSavingTemplates(true);
    try {
      for (const t of templates) {
        await supabase
          .from('billing_message_templates')
          .update({
            campos: t.campos as any,
            emoji: t.emoji,
            encabezado: t.encabezado,
            activo: t.activo,
            updated_at: new Date().toISOString(),
          })
          .eq('id', t.id);
      }
      toast.success('Plantillas guardadas correctamente');
    } catch (err: any) {
      toast.error(err.message || 'Error al guardar plantillas');
    } finally {
      setSavingTemplates(false);
    }
  }

  if (loading) return <div className="text-center py-10 text-muted-foreground">Cargando...</div>;

  return (
    <div className="space-y-6">
      {/* ─── Token Config ─── */}
      <Card className="border border-border/60 shadow-sm max-w-2xl">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-success/10 flex items-center justify-center">
              <MessageCircle className="h-5 w-5 text-success" />
            </div>
            <div>
              <CardTitle className="text-lg">WhatsApp — Notificaciones de cobro</CardTitle>
              <CardDescription>Configura tu token de WhatsAPI y personaliza las plantillas de mensaje.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-medium">Token de WhatsAPI</label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  type={showToken ? 'text' : 'password'}
                  placeholder="Tu token de WhatsAPI..."
                  value={token}
                  onChange={e => setToken(e.target.value)}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowToken(!showToken)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <Button onClick={saveConfig} disabled={saving || token === savedToken}>
                <Save className="h-4 w-4 mr-1.5" />
                {saving ? 'Guardando...' : 'Guardar'}
              </Button>
            </div>
            <div className="flex items-center gap-2 mt-1">
              {savedToken ? (
                <Badge variant="outline" className="text-success border-success/30 bg-success/5">
                  <CheckCircle2 className="h-3 w-3 mr-1" /> Configurado
                </Badge>
              ) : (
                <Badge variant="outline" className="text-destructive border-destructive/30 bg-destructive/5">
                  <AlertCircle className="h-3 w-3 mr-1" /> Sin configurar
                </Badge>
              )}
            </div>
          </div>

          <div className="border-t border-border pt-4 space-y-3">
            <label className="text-sm font-medium">Probar envío</label>
            <div className="flex gap-2">
              <Input
                placeholder="Número de teléfono (ej: 5212345678900)"
                value={testPhone}
                onChange={e => setTestPhone(e.target.value)}
              />
              <Button variant="outline" onClick={sendTestMessage} disabled={testing || !savedToken}>
                {testing ? 'Enviando...' : 'Enviar prueba'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ─── Template Customizer ─── */}
      {templates.length > 0 && (
        <Card className="border border-border/60 shadow-sm">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Smartphone className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-lg">Plantillas de mensaje</CardTitle>
                  <CardDescription>Personaliza los campos y vista previa de cada tipo de notificación.</CardDescription>
                </div>
              </div>
              <Button onClick={saveTemplates} disabled={savingTemplates}>
                <Save className="h-4 w-4 mr-1.5" />
                {savingTemplates ? 'Guardando...' : 'Guardar cambios'}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="pre_cobro">
              <TabsList className="bg-muted/50 mb-6 flex-wrap h-auto">
                {templates.map(t => {
                  const meta = TEMPLATE_META[t.tipo];
                  if (!meta) return null;
                  const Icon = meta.icon;
                  return (
                    <TabsTrigger key={t.tipo} value={t.tipo} className="gap-1.5 data-[state=active]:bg-background">
                      <Icon className={`h-4 w-4 ${meta.color}`} />
                      {meta.label}
                    </TabsTrigger>
                  );
                })}
              </TabsList>

              {templates.map(t => {
                const fields = FIELD_LABELS[t.tipo] || {};
                return (
                  <TabsContent key={t.tipo} value={t.tipo}>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      {/* Left: Config */}
                      <div className="space-y-5">
                        <div className="flex items-center justify-between p-3 rounded-lg bg-muted/40 border border-border/40">
                          <div className="flex items-center gap-2">
                            <span className="text-lg">{t.emoji}</span>
                            <span className="font-medium text-sm">Notificación activa</span>
                          </div>
                          <Switch checked={t.activo} onCheckedChange={() => toggleActivo(t.tipo)} />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <label className="text-xs font-medium text-muted-foreground">Emoji</label>
                            <Input
                              value={t.emoji}
                              onChange={e => updateField(t.tipo, 'emoji', e.target.value)}
                              className="text-center text-lg h-10"
                              maxLength={4}
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-xs font-medium text-muted-foreground">Encabezado</label>
                            <Input
                              value={t.encabezado}
                              onChange={e => updateField(t.tipo, 'encabezado', e.target.value)}
                              className="h-10"
                            />
                          </div>
                        </div>

                        <div className="space-y-1">
                          <p className="text-sm font-medium mb-2">Campos incluidos</p>
                          <div className="space-y-2">
                            {Object.entries(fields).map(([key, label]) => (
                              <div
                                key={key}
                                className="flex items-center justify-between py-2 px-3 rounded-md border border-border/40 bg-background hover:bg-muted/30 transition-colors"
                              >
                                <span className="text-sm">{label}</span>
                                <Switch
                                  checked={!!t.campos[key]}
                                  onCheckedChange={() => toggleCampo(t.tipo, key)}
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Right: Phone Preview */}
                      <div className="flex justify-center">
                        <div className="w-[320px]">
                          <div className="rounded-[2rem] border-4 border-foreground/20 bg-background shadow-xl overflow-hidden">
                            {/* Phone top bar */}
                            <div className="bg-[#075e54] text-white px-4 py-3 flex items-center gap-3">
                              <div className="h-8 w-8 rounded-full bg-white/20 flex items-center justify-center text-xs font-bold">R</div>
                              <div>
                                <p className="text-sm font-semibold">Rutapp</p>
                                <p className="text-[10px] opacity-70">en línea</p>
                              </div>
                            </div>
                            {/* Chat area */}
                            <div className="bg-[#ece5dd] dark:bg-[#0b141a] min-h-[400px] p-3 flex flex-col justify-end">
                              <div className="bg-white dark:bg-[#1f2c34] rounded-lg p-3 shadow-sm max-w-[280px] self-start">
                                <p className="text-[13px] leading-relaxed whitespace-pre-wrap text-foreground">
                                  {buildPreview(t.tipo, t.campos, t.emoji, t.encabezado)}
                                </p>
                                <p className="text-[10px] text-muted-foreground text-right mt-1">
                                  {new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })} ✓✓
                                </p>
                              </div>
                            </div>
                          </div>
                          <p className="text-center text-xs text-muted-foreground mt-3">Vista previa del mensaje</p>
                        </div>
                      </div>
                    </div>
                  </TabsContent>
                );
              })}
            </Tabs>
          </CardContent>
        </Card>
      )}

      {/* Info card */}
      <Card className="border border-border/60 shadow-sm max-w-2xl">
        <CardContent className="pt-6">
          <div className="rounded-lg bg-accent/50 p-4 text-sm text-muted-foreground space-y-2">
            <p className="font-medium text-foreground">¿Cómo funciona?</p>
            <ul className="space-y-1 list-disc list-inside">
              <li><strong>1 día antes</strong> del cobro: Se envía aviso por WhatsApp y correo al cliente</li>
              <li><strong>Día del cobro</strong>: Si se cobra exitosamente, se envía confirmación</li>
              <li><strong>Si falla</strong>: Se notifica al cliente con enlace de pago directo</li>
              <li><strong>3 días de gracia</strong>: Si no paga, se suspende el acceso</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
