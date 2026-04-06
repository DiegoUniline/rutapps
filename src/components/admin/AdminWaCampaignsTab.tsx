import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import {
  Send, Users, Loader2, Eye, Image, MessageCircle,
  Sparkles, AlertTriangle, CheckCircle2, XCircle,
} from 'lucide-react';

const FILTERS = [
  { value: 'all', label: 'Todos los usuarios', icon: '👥', desc: 'Todos los registrados con teléfono' },
  { value: 'trial', label: 'En periodo de prueba', icon: '⏳', desc: 'Usuarios que aún no pagan' },
  { value: 'active_paying', label: 'Clientes activos (pagando)', icon: '💳', desc: 'Con suscripción activa y Stripe' },
  { value: 'suspended', label: 'Suspendidos', icon: '🔴', desc: 'Cuenta suspendida por falta de pago' },
  { value: 'past_due', label: 'En gracia / vencidos', icon: '⚠️', desc: 'Periodo de gracia activo' },
  { value: 'never_paid', label: 'Nunca pagaron (trial expirado)', icon: '😴', desc: 'Terminó su trial sin pagar' },
];

const VARIABLES = [
  { token: '{nombre}', desc: 'Nombre del contacto' },
  { token: '{empresa}', desc: 'Nombre de la empresa' },
];

export default function AdminWaCampaignsTab() {
  const [filter, setFilter] = useState('all');
  const [message, setMessage] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [recipients, setRecipients] = useState<any[]>([]);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ sent: number; failed: number; total: number } | null>(null);

  async function handlePreview() {
    setLoadingPreview(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('wa-campaign', {
        body: { action: 'get_recipients', filter },
      });
      if (error) throw error;
      setRecipients(data.recipients || []);
      toast.success(`${data.count} destinatarios encontrados`);
    } catch (e: any) {
      toast.error(e.message || 'Error al cargar destinatarios');
    } finally {
      setLoadingPreview(false);
    }
  }

  async function handleSend() {
    if (!message.trim() && !imageUrl.trim()) {
      toast.error('Escribe un mensaje o agrega una imagen');
      return;
    }
    if (recipients.length === 0) {
      toast.error('Primero previsualiza los destinatarios');
      return;
    }

    setSending(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('wa-campaign', {
        body: {
          action: 'send_campaign',
          filter,
          message: message.trim(),
          image_url: imageUrl.trim() || undefined,
        },
      });
      if (error) throw error;
      setResult({ sent: data.sent, failed: data.failed, total: data.total });
      if (data.sent > 0) toast.success(`✅ ${data.sent} mensajes enviados`);
      if (data.failed > 0) toast.warning(`⚠️ ${data.failed} fallaron`);
    } catch (e: any) {
      toast.error(e.message || 'Error al enviar campaña');
    } finally {
      setSending(false);
    }
  }

  const previewMessage = message
    .replace(/\{nombre\}/g, 'Juan Pérez')
    .replace(/\{empresa\}/g, 'Mi Empresa SA');

  const selectedFilter = FILTERS.find(f => f.value === filter);

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      {/* Left: Campaign Builder */}
      <div className="lg:col-span-3 space-y-5">
        {/* Filter */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" /> Audiencia
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FILTERS.map(f => (
                  <SelectItem key={f.value} value={f.value}>
                    <span className="flex items-center gap-2">
                      <span>{f.icon}</span>
                      <span>{f.label}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedFilter && (
              <p className="text-xs text-muted-foreground">{selectedFilter.desc}</p>
            )}
            <Button variant="outline" size="sm" onClick={handlePreview} disabled={loadingPreview} className="w-full">
              {loadingPreview ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Eye className="h-4 w-4 mr-1.5" />}
              Previsualizar destinatarios
            </Button>
            {recipients.length > 0 && (
              <Badge variant="secondary" className="text-xs">
                {recipients.length} destinatarios listos
              </Badge>
            )}
          </CardContent>
        </Card>

        {/* Message Composer */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <MessageCircle className="h-4 w-4 text-primary" /> Mensaje
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Variables */}
            <div className="flex flex-wrap gap-2">
              {VARIABLES.map(v => (
                <button
                  key={v.token}
                  type="button"
                  onClick={() => setMessage(prev => prev + v.token)}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-primary/10 text-primary text-xs font-mono hover:bg-primary/20 transition-colors"
                >
                  <Sparkles className="h-3 w-3" /> {v.token}
                  <span className="text-muted-foreground font-sans ml-1">— {v.desc}</span>
                </button>
              ))}
            </div>

            <Textarea
              placeholder="Escribe tu mensaje aquí... Usa {nombre} y {empresa} para personalizar"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={6}
              className="font-mono text-sm"
            />

            <Separator />

            {/* Image */}
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-1.5">
                <Image className="h-4 w-4" /> Imagen (opcional)
              </label>
              <Input
                placeholder="https://... URL pública de la imagen"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
              />
              {imageUrl && (
                <div className="rounded-lg border overflow-hidden max-w-[200px]">
                  <img src={imageUrl} alt="Preview" className="w-full h-auto object-cover" onError={(e) => (e.currentTarget.style.display = 'none')} />
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Si agregas imagen, el mensaje irá como pie de foto (caption).
              </p>
            </div>

            <Separator />

            {/* Send */}
            <div className="flex items-center gap-3">
              <Button
                onClick={handleSend}
                disabled={sending || recipients.length === 0 || (!message.trim() && !imageUrl.trim())}
                className="flex-1"
                size="lg"
              >
                {sending ? (
                  <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Enviando...</>
                ) : (
                  <><Send className="h-4 w-4 mr-2" /> Enviar campaña ({recipients.length})</>
                )}
              </Button>
            </div>

            {result && (
              <div className="flex items-center gap-4 p-3 rounded-lg bg-muted/50">
                <div className="flex items-center gap-1.5 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  <span className="font-medium">{result.sent}</span> enviados
                </div>
                {result.failed > 0 && (
                  <div className="flex items-center gap-1.5 text-sm">
                    <XCircle className="h-4 w-4 text-destructive" />
                    <span className="font-medium">{result.failed}</span> fallidos
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Right: Preview */}
      <div className="lg:col-span-2 space-y-5">
        {/* Phone Preview */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Vista previa</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="bg-[#e5ddd5] rounded-xl p-4 min-h-[300px] space-y-2">
              {imageUrl && (
                <div className="bg-white rounded-lg shadow-sm overflow-hidden max-w-[220px] ml-auto">
                  <img src={imageUrl} alt="" className="w-full h-auto" onError={(e) => (e.currentTarget.style.display = 'none')} />
                  {previewMessage && (
                    <p className="px-2 py-1.5 text-xs whitespace-pre-wrap">{previewMessage}</p>
                  )}
                </div>
              )}
              {!imageUrl && previewMessage && (
                <div className="bg-[#dcf8c6] rounded-lg shadow-sm px-3 py-2 max-w-[85%] ml-auto">
                  <p className="text-sm whitespace-pre-wrap">{previewMessage}</p>
                  <span className="text-[10px] text-muted-foreground float-right mt-1">
                    {new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              )}
              {!previewMessage && !imageUrl && (
                <p className="text-center text-muted-foreground text-xs pt-20">
                  Escribe un mensaje para ver la vista previa
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Recipients List */}
        {recipients.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground flex items-center justify-between">
                <span>Destinatarios</span>
                <Badge variant="outline" className="text-xs">{recipients.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="max-h-[300px] overflow-y-auto space-y-1">
                {recipients.slice(0, 50).map((r: any, i: number) => (
                  <div key={i} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-muted/50 text-xs">
                    <div>
                      <span className="font-medium">{r.nombre}</span>
                      <span className="text-muted-foreground ml-1.5">— {r.empresa_nombre}</span>
                    </div>
                    <Badge variant="outline" className="text-[10px] capitalize">{r.status}</Badge>
                  </div>
                ))}
                {recipients.length > 50 && (
                  <p className="text-xs text-muted-foreground text-center pt-2">
                    ... y {recipients.length - 50} más
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Tips */}
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-4 space-y-2">
            <h4 className="text-sm font-semibold flex items-center gap-1.5">
              <AlertTriangle className="h-4 w-4 text-primary" /> Tips
            </h4>
            <ul className="text-xs text-muted-foreground space-y-1.5">
              <li>• Usa <code className="bg-muted px-1 rounded">{'{nombre}'}</code> y <code className="bg-muted px-1 rounded">{'{empresa}'}</code> para personalizar</li>
              <li>• Si envías imagen + texto, el texto va como pie de foto</li>
              <li>• Los envíos se hacen con pausas automáticas para evitar bloqueos</li>
              <li>• Siempre previsualiza antes de enviar</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
