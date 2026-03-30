import { ArrowLeft, Save, Trash2, Ban, CheckCircle2, PackageCheck, AlertTriangle, DollarSign } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { useCurrency } from '@/hooks/useCurrency';

interface Props {
  form: Record<string, any>;
  isNew: boolean;
  isEditable: boolean;
  dirty: boolean;
  totalPagado: number;
  totals: { total: number };
  saldoActual: number;
  confirmDialog: { open: boolean; action: string; title: string; description: string } | null;
  setConfirmDialog: (v: any) => void;
  handleSave: () => void;
  handleDelete: () => void;
  handleStatusChange: (s: string) => void;
  handleCancel: () => void;
  requestPin: (title: string, desc: string, cb: () => void) => void;
  onBack: () => void;
  onRegistrarPago?: () => void;
}

export function CompraHeader(p: Props) {
  const { fmt } = useCurrency();
  return (
    <>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={p.onBack} className="btn-odoo-icon"><ArrowLeft className="h-4 w-4" /></button>
          <div>
            <h1 className="text-xl font-semibold text-foreground">{p.isNew ? 'Nueva compra' : `Compra ${p.form.folio ?? ''}`}</h1>
            {!p.isNew && <p className="text-xs text-muted-foreground">Pagado: {fmt(p.totalPagado)} / Saldo: {fmt(Math.max(0, p.totals.total - p.totalPagado))}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {p.form.status === 'borrador' && !p.isNew && <button onClick={p.handleDelete} className="btn-odoo-icon text-destructive"><Trash2 className="h-4 w-4" /></button>}
          {p.isEditable && <button onClick={p.handleSave} disabled={!p.dirty && !p.isNew} className="btn-odoo-primary gap-1"><Save className="h-3.5 w-3.5" /> Guardar</button>}
        </div>
      </div>
      {!p.isNew && <StatusBar {...p} />}
      <ConfirmDialog {...p} />
    </>
  );
}

function StatusBar({ form, setConfirmDialog, saldoActual }: Props) {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <span className={cn("inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wide",
        form.status === 'borrador' && "bg-card border border-border text-muted-foreground", form.status === 'confirmada' && "bg-blue-500/10 text-blue-600 dark:text-blue-400",
        form.status === 'recibida' && "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400", form.status === 'pagada' && "bg-primary/10 text-primary",
        form.status === 'cancelada' && "bg-destructive/10 text-destructive")}>
        {form.status === 'cancelada' && <Ban className="h-3 w-3" />}{form.status === 'pagada' && <CheckCircle2 className="h-3 w-3" />}{form.status === 'recibida' && <PackageCheck className="h-3 w-3" />}{form.status}
      </span>
      {form.status === 'borrador' && <button onClick={() => setConfirmDialog({ open: true, action: 'confirmada', title: 'Confirmar compra', description: '¿Confirmar esta compra?' })} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 active:scale-95"><CheckCircle2 className="h-4 w-4" />Confirmar</button>}
      {form.status === 'confirmada' && <button onClick={() => setConfirmDialog({ open: true, action: 'recibida', title: 'Marcar como recibida', description: '¿Marcar como recibida? Se sumará stock.' })} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 active:scale-95"><PackageCheck className="h-4 w-4" />Marcar recibida</button>}
      {form.status !== 'cancelada' && form.status !== 'borrador' && <button onClick={() => setConfirmDialog({ open: true, action: 'cancelar', title: 'Cancelar compra', description: '¿Cancelar? Se revertirá stock.' })} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-destructive/10 text-destructive hover:bg-destructive/20 active:scale-95"><Ban className="h-4 w-4" />Cancelar compra</button>}
      {form.status === 'recibida' && saldoActual > 0 && <span className="text-xs text-muted-foreground italic flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Se marca pagada cuando saldo sea $0</span>}
    </div>
  );
}

function ConfirmDialog({ confirmDialog, setConfirmDialog, handleStatusChange, handleCancel, requestPin }: Props) {
  return (
    <AlertDialog open={confirmDialog?.open} onOpenChange={open => { if (!open) setConfirmDialog(null); }}>
      <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{confirmDialog?.title}</AlertDialogTitle><AlertDialogDescription>{confirmDialog?.description}</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel>No, volver</AlertDialogCancel><AlertDialogAction className={cn(confirmDialog?.action === 'cancelar' && "bg-destructive text-destructive-foreground hover:bg-destructive/90")} onClick={() => { if (confirmDialog?.action === 'cancelar') { requestPin('Cancelar compra', 'Ingresa tu PIN', () => handleCancel()); } else if (confirmDialog?.action) { handleStatusChange(confirmDialog.action); } setConfirmDialog(null); }}>Sí, continuar</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
