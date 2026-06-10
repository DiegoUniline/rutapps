import { createRoot, type Root } from 'react-dom/client';
import { useEffect, useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

let root: Root | null = null;
function getRoot(): Root {
  if (root) return root;
  const el = document.createElement('div');
  el.id = '__confirm_root__';
  document.body.appendChild(el);
  root = createRoot(el);
  return root;
}

export interface ConfirmOptions {
  title?: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
}

interface ConfirmHostProps {
  options: ConfirmOptions;
  resolve: (v: boolean) => void;
}

function ConfirmHost({ options, resolve }: ConfirmHostProps) {
  const [open, setOpen] = useState(true);
  useEffect(() => { if (!open) { setTimeout(() => resolve(false), 0); } }, [open]);
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{options.title || '¿Confirmar acción?'}</AlertDialogTitle>
          {options.description && <AlertDialogDescription className="whitespace-pre-line">{options.description}</AlertDialogDescription>}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => { setOpen(false); resolve(false); }}>{options.cancelText || 'Cancelar'}</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => { setOpen(false); resolve(true); }}
            className={options.destructive ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : ''}
          >
            {options.confirmText || 'Confirmar'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Imperative confirm. Returns true if user accepts. */
export function confirmDialog(message: string, options: Omit<ConfirmOptions, 'description'> = {}): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const r = getRoot();
    const handle = (v: boolean) => {
      resolve(v);
      setTimeout(() => r.render(<></>), 200);
    };
    r.render(<ConfirmHost options={{ description: message, ...options }} resolve={handle} />);
  });
}

export interface PromptOptions {
  title?: string;
  description?: string;
  placeholder?: string;
  defaultValue?: string;
  confirmText?: string;
  cancelText?: string;
}

interface PromptHostProps {
  options: PromptOptions;
  resolve: (v: string | null) => void;
}

function PromptHost({ options, resolve }: PromptHostProps) {
  const [open, setOpen] = useState(true);
  const [value, setValue] = useState(options.defaultValue ?? '');
  const submit = () => { setOpen(false); resolve(value); };
  const cancel = () => { setOpen(false); resolve(null); };
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) cancel(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{options.title || 'Ingresa un valor'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 py-2">
          {options.description && <Label className="text-sm text-muted-foreground whitespace-pre-line">{options.description}</Label>}
          <Input
            autoFocus
            value={value}
            placeholder={options.placeholder}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={cancel}>{options.cancelText || 'Cancelar'}</Button>
          <Button onClick={submit}>{options.confirmText || 'Aceptar'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Imperative prompt. Returns the entered string, or null if cancelled. */
export function promptDialog(message: string, options: Omit<PromptOptions, 'description'> = {}): Promise<string | null> {
  return new Promise<string | null>((resolve) => {
    const r = getRoot();
    const handle = (v: string | null) => {
      resolve(v);
      setTimeout(() => r.render(<></>), 200);
    };
    r.render(<PromptHost options={{ description: message, ...options }} resolve={handle} />);
  });
}
