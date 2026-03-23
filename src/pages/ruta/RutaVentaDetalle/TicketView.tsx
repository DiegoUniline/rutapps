import { Check, X } from 'lucide-react';
import { fmtDate } from '@/lib/utils';
import { useCurrency } from '@/hooks/useCurrency';

interface Props {
  ticketData: { monto: number; cambio: number; metodo: string; folio: string; fecha: string };
  clienteNombre: string;
  cuentasPendientes: { id: string; folio: string | null; montoAplicar: number }[];
  lineas: any[];
  ventaTotal: number;
  onDone: () => void;
  fmt: (n: number) => string;
}

export function TicketView({ ticketData, clienteNombre, cuentasPendientes, lineas, ventaTotal, onDone, fmt }: Props) {
  const { symbol: s } = useCurrency();
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="sticky top-0 z-10 bg-background border-b border-border px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] flex items-center gap-3">
        <button onClick={onDone} className="p-1 -ml-1"><X className="h-5 w-5 text-foreground" /></button>
        <h1 className="text-[16px] font-bold text-foreground">Ticket de cobro</h1>
      </div>
      <div className="flex-1 p-4 flex flex-col items-center">
        <div className="w-full max-w-sm bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
          <div className="bg-green-600 dark:bg-green-700 px-5 py-6 text-center">
            <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-3"><Check className="h-7 w-7 text-white" /></div>
            <p className="text-white/80 text-[12px] font-medium">Cobro exitoso</p>
            <p className="text-white text-[32px] font-bold mt-1">{s}{fmt(ticketData.monto)}</p>
            {ticketData.cambio > 0 && <p className="text-white/70 text-[13px] mt-1">Cambio: {s}{fmt(ticketData.cambio)}</p>}
          </div>
          <div className="px-5 py-4 space-y-3">
            <Row label="Folio" value={ticketData.folio} />
            <Row label="Cliente" value={clienteNombre} />
            <Row label="Método" value={ticketData.metodo === 'efectivo' ? 'Efectivo' : ticketData.metodo === 'transferencia' ? 'Transferencia' : 'Tarjeta'} />
            <Row label="Fecha" value={fmtDate(ticketData.fecha)} />
            {cuentasPendientes.filter(c => c.montoAplicar > 0).length > 0 && (
              <div className="border-t border-border pt-3">
                <p className="text-[10px] text-muted-foreground uppercase font-semibold mb-1.5">Aplicado a cuentas anteriores</p>
                {cuentasPendientes.filter(c => c.montoAplicar > 0).map(c => (
                  <div key={c.id} className="flex justify-between text-[12px] py-0.5">
                    <span className="text-muted-foreground">{c.folio ?? '—'}</span>
                    <span className="text-foreground font-medium">{s}{fmt(c.montoAplicar)}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="border-t border-border pt-3">
              <p className="text-[10px] text-muted-foreground uppercase font-semibold mb-1.5">Productos</p>
              {lineas.map((l: any) => (
                <div key={l.id} className="flex justify-between text-[12px] py-0.5">
                  <span className="text-foreground truncate flex-1 mr-2">{l.cantidad}x {l.productos?.nombre ?? l.descripcion ?? '—'}</span>
                  <span className="text-foreground font-medium shrink-0">{s}{fmt(l.total ?? 0)}</span>
                </div>
              ))}
              <div className="flex justify-between text-[13px] font-bold mt-2 pt-2 border-t border-dashed border-border">
                <span className="text-foreground">Total venta</span>
                <span className="text-foreground">{s}{fmt(ventaTotal)}</span>
              </div>
            </div>
          </div>
        </div>
        <div className="w-full max-w-sm mt-5">
          <button onClick={onDone} className="w-full bg-primary text-primary-foreground rounded-xl py-3.5 text-[14px] font-bold active:scale-[0.98] transition-transform">Listo</button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-[12px]">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground font-medium capitalize">{value}</span>
    </div>
  );
}
