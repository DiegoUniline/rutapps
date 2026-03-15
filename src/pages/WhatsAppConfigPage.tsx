import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageCircle, Send, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { useDebounce } from '@/hooks/useDebounce';

interface WhatsAppConfig {
  id?: string;
  empresa_id: string;
  api_url: string;
  api_token: string;
  instance_name: string;
  activo: boolean;
  enviar_recibo_pago: boolean;
  aviso_dia_antes: boolean;
  aviso_vencido: boolean;
}

export default function WhatsAppConfigPage() {
  const { empresa } = useAuth();
  const qc = useQueryClient();

  const { data: config, isLoading } = useQuery({
    queryKey: ['whatsapp-config', empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from('whatsapp_config')
        .select('*')
        .eq('empresa_id', empresa!.id)
        .maybeSingle();
      return data as WhatsAppConfig | null;
    },
  });

  const [form, setForm] = useState<WhatsAppConfig>({
    empresa_id: empresa?.id ?? '',
    api_url: '',
    api_token: '',
    instance_name: '',
    activo: false,
    enviar_recibo_pago: true,
    aviso_dia_antes: false,
    aviso_vencido: false,
  });

  const [testPhone, setTestPhone] = useState('');
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (config) {
      setForm({ ...config });
    } else if (empresa?.id) {
      setForm(prev => ({ ...prev, empresa_id: empresa.id }));
    }
  }, [config, empresa]);

  // Debounced auto-save
  const debouncedForm = useDebounce(form, 800);

  const saveConfig = useCallback(async (data: WhatsAppConfig) => {
    if (!empresa?.id) return;
    setSaving(true);
    try {
      const payload = { ...data, empresa_id: empresa.id };
      if (data.id) {
        await supabase.from('whatsapp_config').update(payload).eq('id', data.id);
      } else {
        const { data: created } = await supabase.from('whatsapp_config').insert(payload).select().single();
        if (created) setForm(prev => ({ ...prev, id: created.id }));
      }
      qc.invalidateQueries({ queryKey: ['whatsapp-config'] });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  }, [empresa, qc]);

  useEffect(() => {
    if (debouncedForm.api_url !== (config?.api_url ?? '') ||
        debouncedForm.api_token !== (config?.api_token ?? '') ||
        debouncedForm.instance_name !== (config?.instance_name ?? '') ||
        debouncedForm.activo !== (config?.activo ?? false) ||
        debouncedForm.enviar_recibo_pago !== (config?.enviar_recibo_pago ?? true) ||
        debouncedForm.aviso_dia_antes !== (config?.aviso_dia_antes ?? false) ||
        debouncedForm.aviso_vencido !== (config?.aviso_vencido ?? false)) {
      saveConfig(debouncedForm);
    }
  }, [debouncedForm, config, saveConfig]);

  const update = (field: keyof WhatsAppConfig, val: any) => {
    setForm(prev => {
      const next = { ...prev, [field]: val };
      // Auto-activate when token is pasted
      if (field === 'api_token' && val && !prev.activo) {
        next.activo = true;
      }
      return next;
    });
  };

  const handleTest = async () => {
    if (!testPhone.trim()) {
      toast.error('Ingresa un número de teléfono');
      return;
    }
    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke('whatsapp-sender', {
        body: {
          action: 'send-text',
          empresa_id: empresa!.id,
          phone: testPhone,
          message: `🔔 Prueba de WhatsApp desde ${empresa?.nombre ?? 'tu empresa'}.\n\n✅ Conexión exitosa.`,
          tipo: 'test',
        },
      });
      if (error) throw new Error(error.message);
      if (data?.success) {
        toast.success('Mensaje de prueba enviado correctamente');
      } else {
        toast.error(data?.error || 'Error al enviar');
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setTesting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[300px]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-[#25D366]/10 flex items-center justify-center">
          <MessageCircle className="h-5 w-5 text-[#25D366]" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground">WhatsApp</h1>
          <p className="text-sm text-muted-foreground">Configura el envío automático de tickets y documentos</p>
        </div>
        {saving && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground ml-auto" />}
        {!saving && form.activo && (
          <span className="ml-auto flex items-center gap-1 text-xs text-[#25D366] font-medium">
            <CheckCircle className="h-3.5 w-3.5" /> Activo
          </span>
        )}
      </div>

      {/* API Connection */}
      <div className="bg-card border border-border rounded-xl p-5 space-y-4">
        <h2 className="text-sm font-semibold text-foreground">Conexión API (WhatsAPI)</h2>

        <div className="space-y-2">
          <Label className="text-xs">Token / API Key</Label>
          <Input
            type="password"
            placeholder="Pega aquí tu token de WhatsAPI"
            value={form.api_token}
            onChange={e => update('api_token', e.target.value)}
          />
        </div>

        <div className="flex items-center justify-between py-2">
          <Label className="text-sm">Servicio activo</Label>
          <Switch checked={form.activo} onCheckedChange={v => update('activo', v)} />
        </div>
      </div>

      {/* Toggles */}
      <div className="bg-card border border-border rounded-xl p-5 space-y-4">
        <h2 className="text-sm font-semibold text-foreground">Envíos automáticos</h2>

        <div className="flex items-center justify-between py-1">
          <div>
            <p className="text-sm text-foreground">Recibo de pago</p>
            <p className="text-xs text-muted-foreground">Enviar ticket cuando se registre un pago</p>
          </div>
          <Switch checked={form.enviar_recibo_pago} onCheckedChange={v => update('enviar_recibo_pago', v)} />
        </div>

        <div className="flex items-center justify-between py-1">
          <div>
            <p className="text-sm text-foreground">Aviso día antes</p>
            <p className="text-xs text-muted-foreground">Notificar al cliente un día antes de la visita</p>
          </div>
          <Switch checked={form.aviso_dia_antes} onCheckedChange={v => update('aviso_dia_antes', v)} />
        </div>

        <div className="flex items-center justify-between py-1">
          <div>
            <p className="text-sm text-foreground">Aviso vencido</p>
            <p className="text-xs text-muted-foreground">Notificar cuando una factura esté vencida</p>
          </div>
          <Switch checked={form.aviso_vencido} onCheckedChange={v => update('aviso_vencido', v)} />
        </div>
      </div>

      {/* Test */}
      <div className="bg-card border border-border rounded-xl p-5 space-y-4">
        <h2 className="text-sm font-semibold text-foreground">Prueba de conexión</h2>
        <div className="flex gap-2">
          <Input
            placeholder="521234567890"
            value={testPhone}
            onChange={e => setTestPhone(e.target.value)}
            className="flex-1"
          />
          <Button onClick={handleTest} disabled={testing || !form.activo} size="sm">
            {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            <span className="ml-1.5">Probar</span>
          </Button>
        </div>
        {!form.activo && (
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <AlertCircle className="h-3.5 w-3.5" /> Activa el servicio para enviar una prueba
          </p>
        )}
      </div>
    </div>
  );
}
