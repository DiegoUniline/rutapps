import { useCurrency } from '@/hooks/useCurrency';

interface VendedorBreakdown {
  nombre: string;
  total: number;
  pct: number;
}

interface MetodoPagoBreakdown {
  metodo: string;
  total: number;
  pct: number;
}

interface ResumenProps {
  totalVentas: number;
  totalContado: number;
  totalCredito: number;
  vendedores: VendedorBreakdown[];
  metodosPago: MetodoPagoBreakdown[];
}

const metodoPagoLabels: Record<string, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  tarjeta: 'Tarjeta',
  cheque: 'Cheque',
  deposito: 'Depósito',
  otro: 'Otro',
};

export function ResumenGeneralVentas({ totalVentas, totalContado, totalCredito, vendedores, metodosPago }: ResumenProps) {
  const { fmt } = useCurrency();

  return (
    <div className="space-y-4 print:break-before-page">
      <div className="border-t border-border pt-4">
        <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-3 border-b border-border pb-1">
          Resumen General de Ventas
        </h3>
      </div>

      {/* Totales principales */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-card border border-border rounded-lg p-3 text-center">
          <div className="text-[9px] text-muted-foreground uppercase font-semibold">Total Ventas Generales</div>
          <div className="text-lg font-bold text-foreground mt-1">{fmt(totalVentas)}</div>
        </div>
        <div className="bg-card border border-border rounded-lg p-3 text-center">
          <div className="text-[9px] text-muted-foreground uppercase font-semibold">Total Ventas de Contado</div>
          <div className="text-lg font-bold text-foreground mt-1">{fmt(totalContado)}</div>
        </div>
        <div className="bg-card border border-border rounded-lg p-3 text-center">
          <div className="text-[9px] text-muted-foreground uppercase font-semibold">Total Ventas a Crédito</div>
          <div className="text-lg font-bold text-foreground mt-1">{fmt(totalCredito)}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Desglose por Vendedor */}
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="px-3 py-2 border-b border-border">
            <h4 className="text-[9px] font-bold text-muted-foreground uppercase tracking-wide">Desglose por Vendedor</h4>
          </div>
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-[9px] text-muted-foreground uppercase border-b border-border/50">
                <th className="text-left py-1.5 px-3">Vendedor</th>
                <th className="text-right py-1.5 px-3">Total</th>
                <th className="text-right py-1.5 px-3 w-16">%</th>
              </tr>
            </thead>
            <tbody>
              {vendedores.map((v, i) => (
                <tr key={i} className="border-b border-border/30">
                  <td className="py-1.5 px-3 font-medium">{v.nombre}</td>
                  <td className="py-1.5 px-3 text-right font-semibold">{fmt(v.total)}</td>
                  <td className="py-1.5 px-3 text-right text-muted-foreground">{v.pct.toFixed(1)}%</td>
                </tr>
              ))}
              {vendedores.length === 0 && (
                <tr><td colSpan={3} className="py-4 text-center text-muted-foreground text-[11px]">Sin datos</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Desglose por Método de Pago */}
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="px-3 py-2 border-b border-border">
            <h4 className="text-[9px] font-bold text-muted-foreground uppercase tracking-wide">Desglose por Método de Pago</h4>
          </div>
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-[9px] text-muted-foreground uppercase border-b border-border/50">
                <th className="text-left py-1.5 px-3">Método</th>
                <th className="text-right py-1.5 px-3">Total</th>
                <th className="text-right py-1.5 px-3 w-16">%</th>
              </tr>
            </thead>
            <tbody>
              {metodosPago.map((m, i) => (
                <tr key={i} className="border-b border-border/30">
                  <td className="py-1.5 px-3 font-medium">{metodoPagoLabels[m.metodo] ?? m.metodo}</td>
                  <td className="py-1.5 px-3 text-right font-semibold">{fmt(m.total)}</td>
                  <td className="py-1.5 px-3 text-right text-muted-foreground">{m.pct.toFixed(1)}%</td>
                </tr>
              ))}
              {metodosPago.length === 0 && (
                <tr><td colSpan={3} className="py-4 text-center text-muted-foreground text-[11px]">Sin datos</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
