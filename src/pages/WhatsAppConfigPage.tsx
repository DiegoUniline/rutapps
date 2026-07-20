import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageCircle, CheckCircle, AlertCircle, Loader2, QrCode, LogOut, Smartphone, RefreshCw } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { toast } from 'sonner';

interface WhatsAppConfig {
  id?: string;
  empresa_id: string;
  provider: 'whatsapi' | 'evolution';
  activo: boolean;
  enviar_recibo_pago: boolean;
  aviso_dia_antes: boolean;
  aviso_vencido: boolean;
  evolution_instance_name?: string | null;
  evolution_status?: 'conectado' | 'esperando_qr' | 'desconectado' | null;
  evolution_phone_number?: string | null;
  evolution_connected_at?: string | null;
}

export default function WhatsAppConfigPage() {
  const { empresa } = useAuth();
  const qc = useQueryClient();

  const { data: config, isLoading, refetch } = useQuery({
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

  const [qrOpen, setQrOpen] = useState(false);
  const [qrImage, setQrImage] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const pollingRef = useRef<number | null>(null);

  const invalidate = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['whatsapp-config'] });
  }, [qc]);

  const callEvo = useCallback(async (action: string) => {
    if (!empresa?.id) return null;
    const { data, error } = await supabase.functions.invoke('whatsapp-evolution', {
      body: { action, empresa_id: empresa.id },
    });
    if (error) throw new Error(error.message);
    return data;
  }, [empresa]);

  const stopPolling = () => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  };

  const startPolling = useCallback(() => {
    stopPolling();
    pollingRef.current = window.setInterval(async () => {
      try {
        const st = await callEvo('status');
        if (st?.state === 'open') {
          setQrOpen(false);
          setQrImage(null);
          stopPolling();
          toast.success('WhatsApp conectado');
          invalidate();
          return;
        }
        // Refresh QR every 25s
        const qr = await callEvo('qr');
        if (qr?.connected) {
          setQrOpen(false);
          setQrImage(null);
          stopPolling();
          toast.success('WhatsApp conectado');
          invalidate();
        } else if (qr?.qr) {
          setQrImage(qr.qr);
        }
      } catch (e: any) {
        console.error('polling error:', e.message);
      }
    }, 3000);
  }, [callEvo, invalidate]);

  useEffect(() => () => stopPolling(), []);

  const handleConnect = async () => {
    if (!empresa?.id) return;
    setQrLoading(true);
    setQrOpen(true);
    try {
      await callEvo('create-instance');
      // small delay so QR is ready
      await new Promise(r => setTimeout(r, 1500));
      const qr = await callEvo('qr');
      if (qr?.connected) {
        setQrOpen(false);
        toast.success('WhatsApp ya estaba conectado');
        invalidate();
        return;
      }
      setQrImage(qr?.qr ?? null);
      startPolling();
    } catch (e: any) {
      toast.error(e.message || 'Error al iniciar conexión');
      setQrOpen(false);
    } finally {
      setQrLoading(false);
    }
  };

  const handleDisconnect = async () => {
    if (!empresa?.id) return;
    if (!confirm('¿Desconectar WhatsApp? Tendrás que volver a escanear el QR.')) return;
    setDisconnecting(true);
    try {
      await callEvo('disconnect');
      toast.success('WhatsApp desconectado');
      invalidate();
    } catch (e: any) {
      toast.error(e.message || 'Error al desconectar');
    } finally {
      setDisconnecting(false);
    }
  };

  const handleRefreshStatus = async () => {
    try {
      await callEvo('status');
      await refetch();
      toast.success('Estado actualizado');
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const updateToggle = async (field: keyof WhatsAppConfig, val: boolean) => {
    if (!empresa?.id) return;
    try {
      if (config?.id) {
        const { error } = await supabase
          .from('whatsapp_config')
          .update({ [field]: val })
          .eq('id', config.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('whatsapp_config')
          .insert({ empresa_id: empresa.id, provider: 'evolution', [field]: val });
        if (error) throw error;
      }
      invalidate();
    } catch (e: any) {
      toast.error(e.message || 'Error al guardar');
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[300px]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const isConnected = config?.provider === 'evolution' && config?.evolution_status === 'conectado';
  const usesLegacy = config?.provider === 'whatsapi';

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-[#25D366]/10 flex items-center justify-center">
          <MessageCircle className="h-5 w-5 text-[#25D366]" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground">WhatsApp</h1>
          <p className="text-sm text-muted-foreground">Conecta tu WhatsApp escaneando un QR — sin tokens</p>
        </div>
      </div>

      {/* Connection card */}
      <div className="bg-card border border-border rounded-xl p-5 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Estado de la conexión</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Vincula el WhatsApp de tu empresa una sola vez.
            </p>
          </div>
          {isConnected ? (
            <span className="flex items-center gap-1.5 text-xs text-[#25D366] font-medium whitespace-nowrap">
              <CheckCircle className="h-4 w-4" /> Conectado
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground whitespace-nowrap">
              <AlertCircle className="h-4 w-4" /> Sin conectar
            </span>
          )}
        </div>

        {isConnected && (
          <div className="flex items-center gap-3 p-3 bg-[#25D366]/5 border border-[#25D366]/20 rounded-lg">
            <Smartphone className="h-5 w-5 text-[#25D366]" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">
                +{config?.evolution_phone_number ?? '—'}
              </p>
              {config?.evolution_connected_at && (
                <p className="text-xs text-muted-foreground">
                  Desde {new Date(config.evolution_connected_at).toLocaleString('es-MX')}
                </p>
              )}
            </div>
            <Button variant="ghost" size="sm" onClick={handleRefreshStatus}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        )}

        <div className="flex gap-2">
          {!isConnected && (
            <Button onClick={handleConnect} className="flex-1 bg-[#25D366] hover:bg-[#20b558] text-white">
              <QrCode className="h-4 w-4 mr-1.5" />
              Conectar WhatsApp
            </Button>
          )}
          {isConnected && (
            <Button variant="outline" onClick={handleDisconnect} disabled={disconnecting} className="flex-1">
              {disconnecting ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <LogOut className="h-4 w-4 mr-1.5" />}
              Desconectar
            </Button>
          )}
        </div>

        {usesLegacy && (
          <div className="text-xs text-muted-foreground p-3 bg-muted rounded-lg">
            Estás usando el proveedor anterior. Al conectar por QR migrarás automáticamente al nuevo sistema.
          </div>
        )}
      </div>

      {/* Automatic sends */}
      <div className="bg-card border border-border rounded-xl p-5 space-y-4">
        <h2 className="text-sm font-semibold text-foreground">Envíos automáticos</h2>

        <div className="flex items-center justify-between py-1">
          <div>
            <p className="text-sm text-foreground">Recibo de pago</p>
            <p className="text-xs text-muted-foreground">Enviar ticket cuando se registre un pago</p>
          </div>
          <Switch
            checked={config?.enviar_recibo_pago ?? true}
            onCheckedChange={v => updateToggle('enviar_recibo_pago', v)}
          />
        </div>

        <div className="flex items-center justify-between py-1">
          <div>
            <p className="text-sm text-foreground">Aviso día antes</p>
            <p className="text-xs text-muted-foreground">Notificar al cliente un día antes de la visita</p>
          </div>
          <Switch
            checked={config?.aviso_dia_antes ?? false}
            onCheckedChange={v => updateToggle('aviso_dia_antes', v)}
          />
        </div>

        <div className="flex items-center justify-between py-1">
          <div>
            <p className="text-sm text-foreground">Aviso vencido</p>
            <p className="text-xs text-muted-foreground">Notificar cuando una factura esté vencida</p>
          </div>
          <Switch
            checked={config?.aviso_vencido ?? false}
            onCheckedChange={v => updateToggle('aviso_vencido', v)}
          />
        </div>
      </div>

      {/* QR modal */}
      <Dialog open={qrOpen} onOpenChange={(o) => { if (!o) { stopPolling(); setQrImage(null); } setQrOpen(o); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Escanea el código QR</DialogTitle>
            <DialogDescription>
              Abre WhatsApp en tu celular → Menú → <strong>Dispositivos vinculados</strong> → <strong>Vincular un dispositivo</strong>.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col items-center justify-center py-4 space-y-3">
            {qrLoading && !qrImage && (
              <div className="h-64 w-64 flex flex-col items-center justify-center bg-muted rounded-lg gap-2">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                <p className="text-xs text-muted-foreground">Generando QR...</p>
              </div>
            )}
            {qrImage && (
              <img
                src={qrImage.startsWith('data:') ? qrImage : `data:image/png;base64,${qrImage}`}
                alt="Código QR"
                className="h-64 w-64 rounded-lg border border-border"
              />
            )}
            <p className="text-xs text-muted-foreground text-center">
              Esperando conexión... El QR se refresca automáticamente.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
