import { useState } from 'react';
import { MessageCircle, Loader2, X, Edit2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

interface WhatsAppPreviewDialogProps {
  open: boolean;
  onClose: () => void;
  /** Default message to show — user can edit before sending */
  message: string;
  /** Phone number (can be empty, will ask user) */
  phone?: string;
  empresaId: string;
  tipo?: string;
  referencia_id?: string;
}

export default function WhatsAppPreviewDialog({
  open,
  onClose,
  message: initialMessage,
  phone: initialPhone = '',
  empresaId,
  tipo = 'recibo',
  referencia_id,
}: WhatsAppPreviewDialogProps) {
  const [message, setMessage] = useState(initialMessage);
  const [phone, setPhone] = useState(initialPhone);
  const [sending, setSending] = useState(false);

  // Reset state when dialog opens with new data
  const handleOpenChange = (v: boolean) => {
    if (!v) onClose();
  };

  // Sync initial values when they change
  useState(() => {
    setMessage(initialMessage);
    setPhone(initialPhone);
  });

  const handleSend = async () => {
    if (!phone.trim()) {
      toast.error('Ingresa un número de WhatsApp');
      return;
    }
    if (!message.trim()) {
      toast.error('El mensaje no puede estar vacío');
      return;
    }

    setSending(true);
    try {
      const { data: resp, error } = await supabase.functions.invoke('whatsapp-sender', {
        body: {
          action: 'send-text',
          empresa_id: empresaId,
          phone,
          message,
          tipo,
          referencia_id,
        },
      });

      if (error) throw new Error(error.message);
      if (resp && !resp.success) throw new Error(resp.error || 'Error enviando WhatsApp');

      toast.success('Mensaje enviado por WhatsApp');
      onClose();
    } catch (e: any) {
      toast.error(e.message || 'Error al enviar');
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-[#25D366]" />
            Vista previa de WhatsApp
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {/* Phone input */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Número de WhatsApp</label>
            <Input
              placeholder="Ej: 521234567890"
              value={phone}
              onChange={e => setPhone(e.target.value)}
            />
          </div>

          {/* Message preview / edit */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
              <Edit2 className="h-3 w-3" /> Mensaje (editable)
            </label>
            <textarea
              className="w-full rounded-lg border border-border bg-muted/30 p-3 text-sm font-mono whitespace-pre-wrap min-h-[200px] focus:outline-none focus:ring-2 focus:ring-primary/30 resize-y"
              value={message}
              onChange={e => setMessage(e.target.value)}
            />
          </div>

          <div className="flex gap-2 justify-end pt-1">
            <Button variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              onClick={handleSend}
              disabled={sending}
              className="bg-[#25D366] hover:bg-[#25D366]/90 text-white"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Send className="h-4 w-4 mr-1.5" />}
              Enviar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
