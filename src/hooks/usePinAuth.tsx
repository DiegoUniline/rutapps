import { useState, useCallback, useRef } from 'react';
import PinAuthDialog from '@/components/PinAuthDialog';

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

  const requestPin = useCallback((t: string, desc: string, action: () => void) => {
    setTitle(t);
    setDescription(desc);
    actionRef.current = action;
    setOpen(true);
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
