import { useState, useEffect } from 'react';
import { Download, Loader2, MessageCircle, Send, Edit2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { sendDocumentWhatsApp } from '@/lib/whatsappDocument';
import { toast } from 'sonner';

interface DocumentPreviewModalProps {
  open: boolean;
  onClose: () => void;
  pdfBlob: Blob | null;
  fileName: string;
  empresaId: string;
  defaultPhone?: string;
  caption?: string;
  tipo?: string;
  referencia_id?: string;
}

export default function DocumentPreviewModal({
  open,
  onClose,
  pdfBlob,
  fileName,
  empresaId,
  defaultPhone,
  caption: initialCaption,
  tipo,
  referencia_id,
}: DocumentPreviewModalProps) {
  const [phone, setPhone] = useState(defaultPhone || '');
  const [caption, setCaption] = useState(initialCaption || '');
  const [sending, setSending] = useState(false);
  const [showSendForm, setShowSendForm] = useState(false);

  // Sync defaults when props change
  useEffect(() => {
    setPhone(defaultPhone || '');
    setCaption(initialCaption || '');
    setShowSendForm(false);
  }, [defaultPhone, initialCaption, open]);

  const pdfUrl = pdfBlob ? URL.createObjectURL(pdfBlob) : null;

  const handleDownload = () => {
    if (!pdfBlob) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(pdfBlob);
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const handleSendWhatsApp = async () => {
    if (!showSendForm) {
      setShowSendForm(true);
      return;
    }
    if (!phone.trim()) {
      toast.error('Ingresa un número de WhatsApp');
      return;
    }
    if (!pdfBlob) return;

    setSending(true);
    try {
      const result = await sendDocumentWhatsApp({
        blob: pdfBlob,
        fileName,
        empresaId,
        phone,
        caption: caption || undefined,
        tipo,
        referencia_id,
      });
      if (result.success) {
        toast.success('Documento enviado por WhatsApp');
        onClose();
      } else {
        toast.error(result.error || 'Error al enviar');
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-base">{fileName}</DialogTitle>
        </DialogHeader>

        {pdfUrl && (
          <iframe
            src={pdfUrl}
            className="flex-1 min-h-[300px] sm:min-h-[400px] w-full rounded-lg border border-border"
            title="Vista previa PDF"
          />
        )}

        {showSendForm && (
          <div className="space-y-2 border border-border rounded-lg p-3 bg-card/50">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Número de WhatsApp</label>
              <Input
                placeholder="Ej: 521234567890"
                value={phone}
                onChange={e => setPhone(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
                <Edit2 className="h-3 w-3" /> Mensaje (editable)
              </label>
              <textarea
                className="w-full rounded-lg border border-border bg-background p-3 text-sm font-mono whitespace-pre-wrap min-h-[80px] focus:outline-none focus:ring-2 focus:ring-primary/30 resize-y"
                value={caption}
                onChange={e => setCaption(e.target.value)}
                placeholder="Mensaje que acompaña el documento..."
              />
            </div>
          </div>
        )}

        <div className="flex gap-2 justify-end pt-2">
          <Button variant="outline" onClick={handleDownload} disabled={!pdfBlob}>
            <Download className="h-4 w-4 mr-1.5" /> Descargar
          </Button>
          <Button
            onClick={handleSendWhatsApp}
            disabled={sending || !pdfBlob}
            className="bg-[#25D366] hover:bg-[#25D366]/90 text-white"
          >
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
            ) : showSendForm ? (
              <Send className="h-4 w-4 mr-1.5" />
            ) : (
              <MessageCircle className="h-4 w-4 mr-1.5" />
            )}
            {showSendForm ? 'Enviar' : 'Enviar por WhatsApp'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
