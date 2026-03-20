import { useState, useRef, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ShieldCheck, Lock } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title?: string;
  description?: string;
  onSuccess: () => void;
}

export default function PinAuthDialog({ open, onOpenChange, title = 'Autorización requerida', description = 'Ingresa tu PIN de 4 dígitos para continuar.', onSuccess }: Props) {
  const [pin, setPin] = useState(['', '', '', '']);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState('');
  const refs = [useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null)];

  useEffect(() => {
    if (open) {
      setPin(['', '', '', '']);
      setError('');
      setTimeout(() => refs[0].current?.focus(), 100);
    }
  }, [open]);

  const handleChange = (idx: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const digit = value.slice(-1);
    const newPin = [...pin];
    newPin[idx] = digit;
    setPin(newPin);
    setError('');

    if (digit && idx < 3) {
      refs[idx + 1].current?.focus();
    }

    // Auto-verify when all 4 digits entered
    if (digit && idx === 3 && newPin.every(d => d !== '')) {
      verify(newPin.join(''));
    }
  };

  const handleKeyDown = (idx: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !pin[idx] && idx > 0) {
      refs[idx - 1].current?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 4);
    if (pasted.length === 4) {
      const newPin = pasted.split('');
      setPin(newPin);
      refs[3].current?.focus();
      verify(pasted);
    }
  };

  const verify = useCallback(async (code: string) => {
    setVerifying(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No autenticado');

      const { data, error: rpcError } = await supabase.rpc('verify_admin_pin', {
        p_user_id: user.id,
        p_pin: code,
      });

      if (rpcError) throw rpcError;

      if (data === true) {
        onOpenChange(false);
        onSuccess();
      } else {
        setError('PIN incorrecto');
        setPin(['', '', '', '']);
        setTimeout(() => refs[0].current?.focus(), 100);
      }
    } catch (err: any) {
      setError(err.message || 'Error al verificar');
    } finally {
      setVerifying(false);
    }
  }, [onOpenChange, onSuccess]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xs">
        <DialogHeader className="items-center text-center">
          <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-2">
            <ShieldCheck className="h-6 w-6 text-primary" />
          </div>
          <DialogTitle className="text-base">{title}</DialogTitle>
          <DialogDescription className="text-xs">{description}</DialogDescription>
        </DialogHeader>

        <div className="flex justify-center gap-3 py-4" onPaste={handlePaste}>
          {pin.map((digit, idx) => (
            <input
              key={idx}
              ref={refs[idx]}
              type="password"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              onChange={e => handleChange(idx, e.target.value)}
              onKeyDown={e => handleKeyDown(idx, e)}
              disabled={verifying}
              className="w-12 h-14 text-center text-2xl font-bold rounded-lg border-2 border-border bg-background text-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all"
            />
          ))}
        </div>

        {error && (
          <p className="text-center text-xs text-destructive font-medium -mt-2">{error}</p>
        )}

        {verifying && (
          <p className="text-center text-xs text-muted-foreground animate-pulse">Verificando...</p>
        )}

        <p className="text-center text-[11px] text-muted-foreground flex items-center justify-center gap-1">
          <Lock className="h-3 w-3" />
          Tu PIN se configuró en el panel de usuarios
        </p>
      </DialogContent>
    </Dialog>
  );
}
