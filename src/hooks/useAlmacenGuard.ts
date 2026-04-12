import { useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import AlmacenRequeridoDialog from '@/components/AlmacenRequeridoDialog';
import { createElement } from 'react';

export function useAlmacenGuard() {
  const { profile } = useAuth();
  const [open, setOpen] = useState(false);

  const almacenOk = !!profile?.almacen_id;

  const checkAlmacen = useCallback((): boolean => {
    if (profile?.almacen_id) return true;
    setOpen(true);
    return false;
  }, [profile?.almacen_id]);

  const AlmacenDialog = createElement(AlmacenRequeridoDialog, {
    open,
    onClose: () => setOpen(false),
  });

  return { almacenOk, checkAlmacen, AlmacenDialog };
}
