import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { MessageCircle, Save, Eye, EyeOff, CheckCircle2, AlertCircle } from 'lucide-react';

export default function AdminWhatsAppTab() {
  const [token, setToken] = useState('');
  const [savedToken, setSavedToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [testPhone, setTestPhone] = useState('');
  const [testing, setTesting] = useState(false);

  useEffect(() => { loadConfig(); }, []);

  async function loadConfig() {
    try {
      // Load the super admin's WhatsApp config
      // We use a special "admin" empresa_id marker or the first whatsapp_config with super admin
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

  async function saveConfig() {
    setSaving(true);
    try {
      // Store the token as a secret for the billing-notify function
      const session = await supabase.auth.getSession();
      const accessToken = session.data.session?.access_token;
      
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-billing?action=save_whatsapp_token`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
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
            'Authorization': `Bearer ${accessToken}`,
            'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
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

  if (loading) return <div className="text-center py-10 text-muted-foreground">Cargando...</div>;

  return (
    <div className="space-y-6 max-w-2xl">
      <Card className="border border-border/60 shadow-sm">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-success/10 flex items-center justify-center">
              <MessageCircle className="h-5 w-5 text-success" />
            </div>
            <div>
              <CardTitle className="text-lg">WhatsApp — Notificaciones de cobro</CardTitle>
              <CardDescription>Configura tu token de WhatsAPI para enviar avisos automáticos de cobro y confirmaciones a los clientes.</CardDescription>
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

          <div className="rounded-lg bg-accent/50 p-4 text-sm text-muted-foreground space-y-2">
            <p className="font-medium text-foreground">¿Cómo funciona?</p>
            <ul className="space-y-1 list-disc list-inside">
              <li><strong>1 día antes</strong> del cobro: Se envía aviso por WhatsApp y correo al cliente</li>
              <li><strong>Día del cobro</strong>: Si se cobra exitosamente, se envía confirmación</li>
              <li><strong>Si falla</strong>: Se notifica al cliente que entre a facturación para actualizar su pago</li>
              <li><strong>3 días de gracia</strong>: Si no paga en 3 días, se suspende el acceso</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
