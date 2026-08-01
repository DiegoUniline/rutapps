import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

export interface PendingReprice {
  listaPrecioId: string | null;
  listaNombre: string;
  count: number;
  manualCount: number;
}

interface Props {
  pending: PendingReprice | null;
  onConfirm: () => void;
  onDismiss: () => void;
}

/**
 * Se muestra cuando el cliente elegido usa otra lista de precios y ya hay
 * líneas capturadas. Los precios manuales nunca se recalculan.
 */
export function RepriceListaDialog({ pending, onConfirm, onDismiss }: Props) {
  if (!pending) return null;
  return (
    <AlertDialog open onOpenChange={(o) => { if (!o) onDismiss(); }}>
      <AlertDialogContent className="z-[60] max-h-[90vh] overflow-y-auto">
        <AlertDialogHeader>
          <AlertDialogTitle>Este cliente usa otra lista de precios</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-[13px]">
              <p>
                El cliente seleccionado se cotiza con <strong>{pending.listaNombre}</strong>.
                {pending.count > 0
                  ? ` Hay ${pending.count} línea${pending.count === 1 ? '' : 's'} capturada${pending.count === 1 ? '' : 's'} con los precios anteriores.`
                  : ' No hay líneas con precio automático por actualizar.'}
              </p>
              {pending.manualCount > 0 && (
                <p className="text-muted-foreground">
                  {pending.manualCount} línea{pending.manualCount === 1 ? '' : 's'} tiene{pending.manualCount === 1 ? '' : 'n'} precio manual y
                  <strong> no se modificará{pending.manualCount === 1 ? '' : 'n'}</strong>.
                </p>
              )}
              <p className="text-muted-foreground">¿Actualizo los precios a los de la lista del cliente?</p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onDismiss}>Conservar precios</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Actualizar precios</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
