import { useState, useCallback, useRef } from 'react';
import PinAuthDialog from '@/components/PinAuthDialog';
import { supabase } from '@/lib/supabase';

/**
 * Hook to require PIN authorization before executing a sensitive action.
 * Usage:
 *   const { requestPin, PinDialog } = usePinAuth();
 *   // Then in your handler:
 *   requestPin('Cancelar venta', 'Ingresa tu PIN para cancelar', async () => { ... });
 *   // Render <PinDialog /> in your JSX
 */
export function usePinAuth() {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const actionRef = useRef<(() => void) | null>(null);

  const requestPin = useCallback(async (t: string, desc: string, action: () => void) => {
    // Si el usuario no tiene PIN configurado, no bloqueamos la acción.
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data, error } = await supabase.rpc('has_admin_pin' as any, { p_user_id: user.id });
        if (!error && data !== true) { action(); return; }
      }
    } catch { /* si falla la verificación, pedimos PIN */ }
    setTitle(t);
    setDescription(desc);
    actionRef.current = action;
    // Esperamos un tick para que cualquier diálogo previo termine de cerrarse
    setTimeout(() => setOpen(true), 120);
  }, []);


  const handleSuccess = useCallback(() => {
    actionRef.current?.();
    actionRef.current = null;
  }, []);

  const PinDialog = useCallback(() => (
    <PinAuthDialog
      open={open}
      onOpenChange={setOpen}
      title={title}
      description={description}
      onSuccess={handleSuccess}
    />
  ), [open, title, description, handleSuccess]);

  return { requestPin, PinDialog };
}
