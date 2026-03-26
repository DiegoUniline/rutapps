import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { MessageCircle, Save, Eye, EyeOff, CheckCircle2, AlertCircle, Smartphone, Bell, CreditCard, XCircle, Ban, Send } from 'lucide-react';
import { buildBillingTextMessage, sendBillingTicketWhatsApp, type BillingTicketData, type BillingTicketType } from '@/lib/billingTicketImage';

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

const TEMPLATE_META: Record<string, { label: string; icon: typeof Bell; color: string; badgeColor: string }> = {
  pre_cobro: { label: 'Recordatorio', icon: Bell, color: 'text-amber-500', badgeColor: 'bg-amber-100 text-amber-700' },
  cobro_exitoso: { label: 'Pago exitoso', icon: CreditCard, color: 'text-emerald-500', badgeColor: 'bg-emerald-100 text-emerald-700' },
  cobro_fallido: { label: 'Pago fallido', icon: XCircle, color: 'text-red-500', badgeColor: 'bg-red-100 text-red-700' },
  suspension: { label: 'Suspensión', icon: Ban, color: 'text-red-700', badgeColor: 'bg-red-100 text-red-800' },
};

/* ─── Sample data for preview ─── */
function getSampleData(tipo: string, campos: Record<string, boolean>, emoji: string, encabezado: string): BillingTicketData {
  return {
    tipo: tipo as BillingTicketType,
    emoji,
    encabezado,
    campos,
    clienteNombre: 'Juan Pérez García',
    empresaNombre: 'Distribuidora El Sol SA de CV',
    monto: '$900.00 MXN',
    fechaCobro: '1 de abril 2026',
    numUsuarios: 3,
    enlacePago: 'https://invoice.stripe.com/i/acct_xxx/inv_xxx',
    enlaceFacturacion: 'https://rutapp.mx/facturacion',
    fechaVigencia: '1 de mayo 2026',
    diasGracia: 3,
  };
}

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
  const [sendingTest, setSendingTest] = useState<string | null>(null);
  const [sendingAll, setSendingAll] = useState(false);

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
          headers: { Authorization: `Bearer ${accessToken}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
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
    if (!testPhone) { toast.error('Ingresa un número'); return; }
    setTesting(true);
    try {
      const session = await supabase.auth.getSession();
      const accessToken = session.data.session?.access_token;
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-billing?action=test_whatsapp`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
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

  async function sendTestTicket(tipo: string) {
    if (!testPhone) { toast.error('Ingresa un número de teléfono arriba primero'); return; }
    if (!savedToken) { toast.error('Configura el token de WhatsApp primero'); return; }
    setSendingTest(tipo);
    try {
      const tpl = templates.find(t => t.tipo === tipo);
      if (!tpl) throw new Error('Template no encontrado');

      const sampleData = getSampleData(tipo, tpl.campos, tpl.emoji, tpl.encabezado);
      const result = await sendBillingTicketWhatsApp({
        data: sampleData,
        phone: testPhone,
        waToken: savedToken,
        customerEmail: 'test@rutapp.mx',
        textCaption: `${tpl.emoji} ${tpl.encabezado} (PRUEBA)`,
      });

      if (!result.success) throw new Error(result.error || 'Error al enviar');
      toast.success(`Ticket de prueba "${TEMPLATE_META[tipo]?.label}" enviado`);
    } catch (err: any) {
      toast.error(err.message || 'Error al enviar ticket');
    } finally {
      setSendingTest(null);
    }
  }

  async function sendAllTestTickets() {
    if (!testPhone) { toast.error('Ingresa un número de teléfono arriba primero'); return; }
    if (!savedToken) { toast.error('Configura el token de WhatsApp primero'); return; }
    setSendingAll(true);
    const tipos = templates.map(t => t.tipo);
    let sent = 0;
    for (const tipo of tipos) {
      try {
        const tpl = templates.find(t => t.tipo === tipo);
        if (!tpl) continue;
        const sampleData = getSampleData(tipo, tpl.campos, tpl.emoji, tpl.encabezado);
        const result = await sendBillingTicketWhatsApp({
          data: sampleData,
          phone: testPhone,
          waToken: savedToken,
          customerEmail: 'test@rutapp.mx',
          textCaption: `${tpl.emoji} ${tpl.encabezado} (PRUEBA)`,
        });
        if (result.success) sent++;
        else toast.error(`Error en ${TEMPLATE_META[tipo]?.label}: ${result.error}`);
        // Small delay between sends
        await new Promise(r => setTimeout(r, 2000));
      } catch (err: any) {
        toast.error(`Error en ${TEMPLATE_META[tipo]?.label}: ${err.message}`);
      }
    }
    toast.success(`${sent} de ${tipos.length} tickets enviados`);
    setSendingAll(false);
  }

  function toggleCampo(tipo: string, campo: string) {
    setTemplates(prev => prev.map(t => t.tipo === tipo ? { ...t, campos: { ...t.campos, [campo]: !t.campos[campo] } } : t));
  }

  function toggleActivo(tipo: string) {
    setTemplates(prev => prev.map(t => t.tipo === tipo ? { ...t, activo: !t.activo } : t));
  }

  function updateField(tipo: string, field: 'emoji' | 'encabezado', value: string) {
    setTemplates(prev => prev.map(t => t.tipo === tipo ? { ...t, [field]: value } : t));
  }

  async function saveTemplates() {
    setSavingTemplates(true);
    try {
      for (const t of templates) {
        await supabase
          .from('billing_message_templates')
          .update({ campos: t.campos as any, emoji: t.emoji, encabezado: t.encabezado, activo: t.activo, updated_at: new Date().toISOString() })
          .eq('id', t.id);
      }
      toast.success('Plantillas guardadas');
    } catch (err: any) {
      toast.error(err.message || 'Error');
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
              <CardDescription>Configura tu token y personaliza los tickets de notificación.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-medium">Token de WhatsAPI</label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input type={showToken ? 'text' : 'password'} placeholder="Tu token de WhatsAPI..." value={token} onChange={e => setToken(e.target.value)} className="pr-10" />
                <button type="button" onClick={() => setShowToken(!showToken)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <Button onClick={saveConfig} disabled={saving || token === savedToken}>
                <Save className="h-4 w-4 mr-1.5" />{saving ? 'Guardando...' : 'Guardar'}
              </Button>
            </div>
            <div className="flex items-center gap-2 mt-1">
              {savedToken ? (
                <Badge variant="outline" className="text-success border-success/30 bg-success/5"><CheckCircle2 className="h-3 w-3 mr-1" /> Configurado</Badge>
              ) : (
                <Badge variant="outline" className="text-destructive border-destructive/30 bg-destructive/5"><AlertCircle className="h-3 w-3 mr-1" /> Sin configurar</Badge>
              )}
            </div>
          </div>
          <div className="border-t border-border pt-4 space-y-3">
            <label className="text-sm font-medium">Teléfono de prueba</label>
            <div className="flex gap-2">
              <Input placeholder="Número (ej: 523171035768)" value={testPhone} onChange={e => setTestPhone(e.target.value)} />
              <Button variant="outline" onClick={sendTestMessage} disabled={testing || !savedToken}>
                {testing ? 'Enviando...' : 'Enviar texto'}
              </Button>
            </div>
            <Button className="w-full" onClick={sendAllTestTickets} disabled={sendingAll || !savedToken || !testPhone}>
              <Send className="h-4 w-4 mr-1.5" />
              {sendingAll ? 'Enviando los 4 tickets...' : 'Enviar los 4 tickets de prueba'}
            </Button>
            <p className="text-xs text-muted-foreground">Envía los 4 tipos de ticket como imagen al número de arriba.</p>
          </div>
        </CardContent>
      </Card>

      {/* ─── Template Customizer ─── */}
      {templates.length > 0 && (
        <Card className="border border-border/60 shadow-sm">
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Smartphone className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-lg">Tickets de notificación</CardTitle>
                  <CardDescription>Personaliza cada ticket. La imagen se genera y envía como foto por WhatsApp.</CardDescription>
                </div>
              </div>
              <Button onClick={saveTemplates} disabled={savingTemplates}>
                <Save className="h-4 w-4 mr-1.5" />{savingTemplates ? 'Guardando...' : 'Guardar cambios'}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="pre_cobro">
              <TabsList className="bg-card mb-6 flex-wrap h-auto">
                {templates.map(t => {
                  const meta = TEMPLATE_META[t.tipo];
                  if (!meta) return null;
                  const Icon = meta.icon;
                  return (
                    <TabsTrigger key={t.tipo} value={t.tipo} className="gap-1.5 data-[state=active]:bg-background">
                      <Icon className={`h-4 w-4 ${meta.color}`} />{meta.label}
                    </TabsTrigger>
                  );
                })}
              </TabsList>

              {templates.map(t => {
                const fields = FIELD_LABELS[t.tipo] || {};
                const sampleData = getSampleData(t.tipo, t.campos, t.emoji, t.encabezado);
                const previewText = buildBillingTextMessage(sampleData);

                return (
                  <TabsContent key={t.tipo} value={t.tipo}>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      {/* Left: Controls */}
                      <div className="space-y-5">
                        <div className="flex items-center justify-between p-3 rounded-lg bg-card border border-border/40">
                          <div className="flex items-center gap-2">
                            <span className="text-lg">{t.emoji}</span>
                            <span className="font-medium text-sm">Notificación activa</span>
                          </div>
                          <Switch checked={t.activo} onCheckedChange={() => toggleActivo(t.tipo)} />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <label className="text-xs font-medium text-muted-foreground">Emoji</label>
                            <Input value={t.emoji} onChange={e => updateField(t.tipo, 'emoji', e.target.value)} className="text-center text-lg h-10" maxLength={4} />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-xs font-medium text-muted-foreground">Encabezado</label>
                            <Input value={t.encabezado} onChange={e => updateField(t.tipo, 'encabezado', e.target.value)} className="h-10" />
                          </div>
                        </div>

                        <div className="space-y-1">
                          <p className="text-sm font-medium mb-2">Campos incluidos</p>
                          <div className="space-y-2">
                            {Object.entries(fields).map(([key, label]) => (
                              <div key={key} className="flex items-center justify-between py-2 px-3 rounded-md border border-border/40 bg-background hover:bg-card transition-colors">
                                <span className="text-sm">{label}</span>
                                <Switch checked={!!t.campos[key]} onCheckedChange={() => toggleCampo(t.tipo, key)} />
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Send test ticket button */}
                        <Button
                          className="w-full"
                          variant="outline"
                          onClick={() => sendTestTicket(t.tipo)}
                          disabled={!savedToken || !testPhone || sendingTest === t.tipo}
                        >
                          <Send className="h-4 w-4 mr-1.5" />
                          {sendingTest === t.tipo ? 'Enviando...' : `Enviar prueba de este tipo`}
                        </Button>
                        {(!savedToken || !testPhone) && (
                          <p className="text-xs text-muted-foreground text-center">Configura el token y el número de prueba arriba.</p>
                        )}
                      </div>

                      {/* Right: Phone Mockup with text preview */}
                      <div className="flex justify-center">
                        <div className="w-[340px]">
                          <div className="rounded-[2rem] border-[3px] border-foreground/15 bg-background shadow-2xl overflow-hidden">
                            {/* Phone status bar */}
                            <div className="bg-[#075e54] px-4 py-2.5 flex items-center gap-3">
                              <div className="h-8 w-8 rounded-full bg-white/20 flex items-center justify-center">
                                <span className="text-white text-xs font-bold">R</span>
                              </div>
                              <div className="flex-1">
                                <p className="text-white text-sm font-semibold">Rutapp</p>
                                <p className="text-white/60 text-[10px]">en línea</p>
                              </div>
                            </div>
                            {/* Chat background */}
                            <div
                              className="min-h-[420px] p-3 flex flex-col justify-end"
                              style={{ background: 'linear-gradient(180deg, #ece5dd 0%, #d9d2c5 100%)' }}
                            >
                              {/* Message bubble */}
                              <div className="bg-white rounded-lg shadow-sm p-3 max-w-[290px] self-start">
                                <p className="text-[13px] text-gray-800 whitespace-pre-wrap leading-relaxed"
                                   dangerouslySetInnerHTML={{
                                     __html: previewText
                                       .replace(/\*(.*?)\*/g, '<strong>$1</strong>')
                                       .replace(/\n/g, '<br/>')
                                   }}
                                />
                                {/* Timestamp */}
                                <div className="flex justify-end mt-1">
                                  <span className="text-[10px] text-gray-400">
                                    {new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })} ✓✓
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                          <p className="text-center text-xs text-muted-foreground mt-3">
                            Así se verá el mensaje en WhatsApp
                          </p>
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

      {/* Info */}
      <Card className="border border-border/60 shadow-sm max-w-2xl">
        <CardContent className="pt-6">
          <div className="rounded-lg bg-accent/50 p-4 text-sm text-muted-foreground space-y-2">
            <p className="font-medium text-foreground">¿Cómo funciona?</p>
            <ul className="space-y-1 list-disc list-inside">
              <li><strong>1 día antes</strong> del cobro: Se envía ticket de recordatorio como imagen por WhatsApp</li>
              <li><strong>Día del cobro</strong>: Si se cobra exitosamente, se envía ticket de confirmación</li>
              <li><strong>Si falla</strong>: Se envía ticket con enlace de pago directo</li>
              <li><strong>3 días de gracia</strong>: Si no paga, se envía ticket de suspensión</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
