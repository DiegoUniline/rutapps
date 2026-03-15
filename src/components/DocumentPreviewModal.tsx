import { useState } from 'react';
import { X, Download, Send, Loader2, MessageCircle } from 'lucide-react';
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
  caption,
  tipo,
  referencia_id,
}: DocumentPreviewModalProps) {
  const [phone, setPhone] = useState(defaultPhone || '');
  const [sending, setSending] = useState(false);
  const [showPhoneInput, setShowPhoneInput] = useState(false);

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
    if (!phone.trim()) {
      setShowPhoneInput(true);
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
        caption,
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
            className="flex-1 min-h-[400px] w-full rounded-lg border border-border"
            title="Vista previa PDF"
          />
        )}

        {showPhoneInput && (
          <div className="flex gap-2 items-center">
            <Input
              placeholder="Número WhatsApp (ej: 521234567890)"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              className="flex-1"
            />
          </div>
        )}

        <div className="flex gap-2 justify-end pt-2">
          <Button variant="outline" onClick={handleDownload} disabled={!pdfBlob}>
            <Download className="h-4 w-4 mr-1.5" /> Descargar
          </Button>
          <Button onClick={handleSendWhatsApp} disabled={sending || !pdfBlob} className="bg-[#25D366] hover:bg-[#25D366]/90 text-white">
            {sending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <MessageCircle className="h-4 w-4 mr-1.5" />}
            Enviar por WhatsApp
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
