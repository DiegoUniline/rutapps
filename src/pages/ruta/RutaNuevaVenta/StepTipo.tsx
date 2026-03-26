import { ShoppingCart, Package, EyeOff } from 'lucide-react';
import type { Step } from './types';

interface Props {
  sinCompra: boolean;
  setSinCompra: (v: boolean) => void;
  setTipoVenta: (v: 'venta_directa' | 'pedido') => void;
  setCondicionPago: (v: 'contado' | 'credito' | 'por_definir') => void;
  setStep: (s: Step) => void;
  urlClienteId: string | null;
}

export function StepTipo({ sinCompra, setSinCompra, setTipoVenta, setCondicionPago, setStep, urlClienteId }: Props) {
  if (sinCompra) return null;
  const nextStep = urlClienteId ? 'devoluciones' : 'cliente';

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 gap-6">
      <div className="text-center">
        <h2 className="text-[18px] font-bold text-foreground mb-1">¿Qué tipo de operación?</h2>
        <p className="text-[12px] text-muted-foreground">Elige antes de continuar</p>
      </div>
      <div className="w-full max-w-xs space-y-3">
        <button onClick={() => { setTipoVenta('venta_directa'); setStep(nextStep as Step); }}
          className="w-full rounded-xl border-2 border-primary bg-primary/5 p-4 text-left active:scale-[0.98] transition-all">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0"><ShoppingCart className="h-5 w-5 text-primary" /></div>
            <div><p className="text-[14px] font-bold text-foreground">Venta inmediata</p><p className="text-[11px] text-muted-foreground mt-0.5">Entrega ahora · Solo productos con stock a bordo</p></div>
          </div>
        </button>
        <button onClick={() => { setTipoVenta('pedido'); setCondicionPago('por_definir'); setStep(nextStep as Step); }}
          className="w-full rounded-xl border-2 border-border bg-card p-4 text-left active:scale-[0.98] transition-all hover:border-primary/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-accent flex items-center justify-center shrink-0"><Package className="h-5 w-5 text-foreground" /></div>
            <div><p className="text-[14px] font-bold text-foreground">Pedido</p><p className="text-[11px] text-muted-foreground mt-0.5">Se entrega después · Todos los productos disponibles</p></div>
          </div>
        </button>
        <button onClick={() => setSinCompra(true)}
          className="w-full rounded-xl border-2 border-border bg-card p-4 text-left active:scale-[0.98] transition-all hover:border-muted-foreground/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-card border border-border flex items-center justify-center shrink-0"><EyeOff className="h-5 w-5 text-muted-foreground" /></div>
            <div><p className="text-[14px] font-bold text-foreground">Sin compra</p><p className="text-[11px] text-muted-foreground mt-0.5">Se visitó pero no compró · Registrar motivo</p></div>
          </div>
        </button>
      </div>
    </div>
  );
}
