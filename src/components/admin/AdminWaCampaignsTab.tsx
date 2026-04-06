import { useState, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import { Slider } from '@/components/ui/slider';
import { toast } from 'sonner';
import {
  Send, Users, Loader2, Eye, Image, MessageCircle,
  Sparkles, AlertTriangle, CheckCircle2, XCircle,
  Upload, X, Plus, Phone, Clock, SmilePlus, Ban, ShieldX, Youtube,
} from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

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

const COMMON_EMOJIS = [
  '😊', '👋', '🎉', '🔥', '💪', '✅', '❤️', '🚀',
  '💰', '📦', '🛒', '📱', '⭐', '🏆', '💳', '📈',
  '👍', '🙌', '💡', '🎯', '⚡', '🤝', '📢', '🔔',
  '😎', '🥳', '💥', '🌟', '📣', '💬', '🎁', '🔑',
];

export default function AdminWaCampaignsTab() {
  const [selectedFilters, setSelectedFilters] = useState<string[]>(['all']);
  const [message, setMessage] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [uploadingImage, setUploadingImage] = useState(false);
  const [recipients, setRecipients] = useState<any[]>([]);
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ sent: number; failed: number; total: number } | null>(null);
  const [delaySec, setDelaySec] = useState(2);
  const [extraNumbers, setExtraNumbers] = useState<{ phone: string; name: string }[]>([]);
  const [newPhone, setNewPhone] = useState('');
  const [newName, setNewName] = useState('');
  const [optouts, setOptouts] = useState<Set<string>>(new Set());
  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Load optouts on mount
  useEffect(() => {
    supabase.from('wa_optouts').select('telefono').then(({ data }) => {
      if (data) setOptouts(new Set(data.map((r: any) => r.telefono)));
    });
  }, []);

  const toggleFilter = (value: string) => {
    if (value === 'all') {
      // Toggle all on/off
      setSelectedFilters(prev => prev.includes('all') ? [] : ['all']);
    } else {
      setSelectedFilters(prev => {
        const without = prev.filter(f => f !== 'all');
        if (without.includes(value)) {
          return without.filter(f => f !== value);
        }
        return [...without, value];
      });
    }
    setRecipients([]);
    setRemovedIds(new Set());
  };

  const activeRecipients = recipients
    .map((r: any, i: number) => ({ ...r, _idx: i }))
    .filter((r: any) => !removedIds.has(String(r._idx)))
    .filter((r: any) => !r.telefono || !optouts.has(r.telefono.replace(/[\s\-\(\)]/g, '')))
    .sort((a: any, b: any) => (a.nombre || '').localeCompare(b.nombre || '', 'es'));
  const allSendTargets = [
    ...activeRecipients,
    ...extraNumbers.filter(n => n.phone.trim()),
  ];

  async function toggleOptout(telefono: string, nombre: string) {
    const normalized = telefono.replace(/[\s\-\(\)]/g, '');
    if (optouts.has(normalized)) {
      await supabase.from('wa_optouts').delete().eq('telefono', normalized);
      setOptouts(prev => { const n = new Set(prev); n.delete(normalized); return n; });
      toast.success(`${nombre} desbloqueado`);
    } else {
      await supabase.from('wa_optouts').insert({ telefono: normalized, nombre });
      setOptouts(prev => new Set([...prev, normalized]));
      toast.success(`${nombre} marcado como no quiere publicidad`);
    }
  }

  async function handleImageUpload(file: File) {
    setUploadingImage(true);
    try {
      const ext = file.name.split('.').pop() || 'jpg';
      const path = `wa-campaigns/${Date.now()}.${ext}`;
      const { error: uploadErr } = await supabase.storage
        .from('public-assets')
        .upload(path, file, { upsert: true, contentType: file.type });
      if (uploadErr) throw uploadErr;
      const { data: urlData } = supabase.storage.from('public-assets').getPublicUrl(path);
      setImageUrl(urlData.publicUrl);
      toast.success('Imagen subida');
    } catch (e: any) {
      toast.error(e.message || 'Error al subir imagen');
    } finally {
      setUploadingImage(false);
    }
  }

  function insertEmoji(emoji: string) {
    const ta = textareaRef.current;
    if (ta) {
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const newMsg = message.slice(0, start) + emoji + message.slice(end);
      setMessage(newMsg);
      setTimeout(() => {
        ta.focus();
        ta.setSelectionRange(start + emoji.length, start + emoji.length);
      }, 0);
    } else {
      setMessage(prev => prev + emoji);
    }
  }

  async function handlePreview() {
    setLoadingPreview(true);
    setResult(null);
    setRemovedIds(new Set());
    try {
      const { data, error } = await supabase.functions.invoke('wa-campaign', {
        body: { action: 'get_recipients', filters: selectedFilters },
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

  function removeRecipient(index: number) {
    setRemovedIds(prev => new Set([...prev, String(index)]));
  }

  function addExtraNumber() {
    if (!newPhone.trim()) return;
    setExtraNumbers(prev => [...prev, { phone: newPhone.trim(), name: newName.trim() || newPhone.trim() }]);
    setNewPhone('');
    setNewName('');
  }

  function removeExtraNumber(i: number) {
    setExtraNumbers(prev => prev.filter((_, idx) => idx !== i));
  }

  async function handleSend() {
    if (!message.trim() && !imageUrl.trim()) {
      toast.error('Escribe un mensaje o agrega una imagen');
      return;
    }
    if (allSendTargets.length === 0) {
      toast.error('No hay destinatarios');
      return;
    }

    setSending(true);
    setResult(null);
    try {
      const recipientPhones = activeRecipients.map((r: any) => r.telefono);
      const manualRecipients = extraNumbers
        .filter(n => n.phone.trim())
        .map(n => ({ telefono: n.phone, nombre: n.name }));

      const { data, error } = await supabase.functions.invoke('wa-campaign', {
        body: {
          action: 'send_campaign',
          filters: selectedFilters,
          message: message.trim(),
          image_url: imageUrl.trim() || undefined,
          delay_seconds: delaySec,
          recipient_phones: recipientPhones,
          manual_recipients: manualRecipients,
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

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      {/* Left: Campaign Builder */}
      <div className="lg:col-span-3 space-y-5">
        {/* Audience Multi-Select */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" /> Audiencia
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {FILTERS.map(f => (
                <label
                  key={f.value}
                  className={`flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer transition-colors text-sm ${
                    selectedFilters.includes(f.value)
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:bg-muted/50'
                  }`}
                >
                  <Checkbox
                    checked={selectedFilters.includes(f.value)}
                    onCheckedChange={() => toggleFilter(f.value)}
                  />
                  <span>{f.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{f.label}</div>
                    <div className="text-[10px] text-muted-foreground truncate">{f.desc}</div>
                  </div>
                </label>
              ))}
            </div>

            <Button variant="outline" size="sm" onClick={handlePreview} disabled={loadingPreview || selectedFilters.length === 0} className="w-full">
              {loadingPreview ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Eye className="h-4 w-4 mr-1.5" />}
              {selectedFilters.length === 0 ? 'Selecciona al menos una audiencia' : 'Previsualizar destinatarios'}
            </Button>
          </CardContent>
        </Card>

        {/* Manual Numbers */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Phone className="h-4 w-4 text-primary" /> Números adicionales
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Input
                placeholder="52XXXXXXXXXX"
                value={newPhone}
                onChange={e => setNewPhone(e.target.value)}
                className="flex-1"
              />
              <Input
                placeholder="Nombre (opcional)"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                className="flex-1"
              />
              <Button size="icon" variant="outline" onClick={addExtraNumber} disabled={!newPhone.trim()}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {extraNumbers.length > 0 && (
              <div className="space-y-1 max-h-[120px] overflow-y-auto">
                {extraNumbers.map((n, i) => (
                  <div key={i} className="flex items-center justify-between py-1 px-2 rounded bg-muted/50 text-xs">
                    <span>📱 {n.phone} {n.name !== n.phone && <span className="text-muted-foreground">— {n.name}</span>}</span>
                    <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => removeExtraNumber(i)}>
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
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
            {/* Variables + Emojis */}
            <div className="flex flex-wrap items-center gap-2">
              {VARIABLES.map(v => (
                <button
                  key={v.token}
                  type="button"
                  onClick={() => {
                    setMessage(prev => prev + v.token);
                    textareaRef.current?.focus();
                  }}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-primary/10 text-primary text-xs font-mono hover:bg-primary/20 transition-colors"
                >
                  <Sparkles className="h-3 w-3" /> {v.token}
                  <span className="text-muted-foreground font-sans ml-1">— {v.desc}</span>
                </button>
              ))}
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-7 gap-1 text-xs">
                    <SmilePlus className="h-3.5 w-3.5" /> Emojis
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-2" align="start">
                  <div className="grid grid-cols-8 gap-1">
                    {COMMON_EMOJIS.map(e => (
                      <button
                        key={e}
                        type="button"
                        onClick={() => insertEmoji(e)}
                        className="text-lg hover:bg-muted rounded p-1 text-center transition-colors"
                      >
                        {e}
                      </button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1 text-xs"
                onClick={() => {
                  const ytBlock = '\n\n📺 Descubre todo lo que Rutapp puede hacer por tu negocio: https://www.youtube.com/@RutAppMx';
                  setMessage(prev => prev + ytBlock);
                  textareaRef.current?.focus();
                }}
              >
                <Youtube className="h-3.5 w-3.5 text-red-500" /> Incluir canal YouTube
              </Button>
            </div>

            <Textarea
              ref={textareaRef}
              placeholder="Escribe tu mensaje aquí... Usa {nombre} y {empresa} para personalizar 🎉"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={6}
              className="text-sm"
            />

            <Separator />

            {/* Image Upload */}
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-1.5">
                <Image className="h-4 w-4" /> Imagen (opcional)
              </label>
              <div className="flex gap-2">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={e => {
                    const file = e.target.files?.[0];
                    if (file) handleImageUpload(file);
                  }}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploadingImage}
                  className="gap-1.5"
                >
                  {uploadingImage ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  Subir imagen
                </Button>
                {imageUrl && (
                  <Button variant="ghost" size="sm" onClick={() => setImageUrl('')} className="gap-1 text-destructive">
                    <X className="h-3.5 w-3.5" /> Quitar
                  </Button>
                )}
              </div>
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

            {/* Delay Control */}
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-1.5">
                <Clock className="h-4 w-4" /> Pausa entre mensajes: <span className="text-primary font-bold">{delaySec}s</span>
              </label>
              <Slider
                min={1}
                max={15}
                step={1}
                value={[delaySec]}
                onValueChange={([v]) => setDelaySec(v)}
                className="w-full"
              />
              <p className="text-xs text-muted-foreground">
                Más lento = menos riesgo de bloqueo por WhatsApp
              </p>
            </div>

            <Separator />

            {/* Send */}
            <div className="flex items-center gap-3">
              <Button
                onClick={handleSend}
                disabled={sending || allSendTargets.length === 0 || (!message.trim() && !imageUrl.trim())}
                className="flex-1"
                size="lg"
              >
                {sending ? (
                  <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Enviando...</>
                ) : (
                  <><Send className="h-4 w-4 mr-2" /> Enviar campaña ({allSendTargets.length})</>
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

      {/* Right: Preview + Recipients */}
      <div className="lg:col-span-2 space-y-5">
        {/* Phone Preview */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Vista previa</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="bg-[#e5ddd5] rounded-xl p-4 min-h-[250px] space-y-2">
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

        {/* Recipients Table */}
        {(recipients.length > 0 || extraNumbers.length > 0) && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground flex items-center justify-between">
                <span>Destinatarios</span>
                <div className="flex items-center gap-2">
                  {removedIds.size > 0 && (
                    <Button variant="link" size="sm" className="text-[10px] p-0 h-auto" onClick={() => setRemovedIds(new Set())}>
                      Restaurar {removedIds.size}
                    </Button>
                  )}
                  <Badge variant="outline" className="text-xs">{allSendTargets.length}</Badge>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="max-h-[400px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="text-[10px]">
                      <TableHead className="py-1.5 px-2 text-[10px]">Nombre</TableHead>
                      <TableHead className="py-1.5 px-2 text-[10px]">Teléfono</TableHead>
                      <TableHead className="py-1.5 px-2 text-[10px] text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {activeRecipients.map((r: any) => (
                      <TableRow key={r._idx} className="text-xs group">
                        <TableCell className="py-1.5 px-2 font-medium">{r.nombre}</TableCell>
                        <TableCell className="py-1.5 px-2 text-muted-foreground font-mono text-[11px]">{r.telefono}</TableCell>
                        <TableCell className="py-1.5 px-2 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              title="No quiere publicidad"
                              onClick={() => toggleOptout(r.telefono, r.nombre)}
                            >
                              <Ban className="h-3 w-3 text-orange-500" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                              onClick={() => removeRecipient(r._idx)}
                            >
                              <X className="h-3 w-3 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {extraNumbers.map((n, i) => (
                      <TableRow key={`extra-${i}`} className="text-xs bg-primary/5">
                        <TableCell className="py-1.5 px-2 font-medium">📱 {n.name}</TableCell>
                        <TableCell className="py-1.5 px-2 text-muted-foreground font-mono text-[11px]">{n.phone}</TableCell>
                        <TableCell className="py-1.5 px-2 text-right">
                          <Badge variant="secondary" className="text-[10px]">Manual</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Blocked list */}
        {optouts.size > 0 && (
          <Card className="border-orange-200 bg-orange-50/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-1.5">
                <ShieldX className="h-4 w-4 text-orange-500" /> Bloqueados ({optouts.size})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="max-h-[150px] overflow-y-auto">
                <Table>
                  <TableBody>
                    {[...optouts].map(phone => (
                      <TableRow key={phone} className="text-xs">
                        <TableCell className="py-1 px-2 font-mono text-[11px]">{phone}</TableCell>
                        <TableCell className="py-1 px-2 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-5 text-[10px] text-orange-600"
                            onClick={() => toggleOptout(phone, phone)}
                          >
                            Desbloquear
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
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
              <li>• <Ban className="inline h-3 w-3 text-orange-500" /> marca usuarios que no quieren publicidad</li>
              <li>• Los bloqueados se excluyen automáticamente de todos los envíos</li>
              <li>• Ajusta la pausa para evitar bloqueos de WhatsApp</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
