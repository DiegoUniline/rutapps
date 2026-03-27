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
      <div className="border-t border-border pt-6">
        <h3 className="text-sm font-bold text-foreground uppercase tracking-wide mb-4">
          Resumen General de Ventas
        </h3>
      </div>

      {/* Totales principales */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <SummaryCard label="Total Ventas Generales" value={fmt(totalVentas)} />
        <SummaryCard label="Total Ventas de Contado" value={fmt(totalContado)} />
        <SummaryCard label="Total Ventas a Crédito" value={fmt(totalCredito)} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Desglose por Vendedor */}
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <h4 className="text-[12px] font-semibold text-foreground uppercase tracking-wide">Desglose por Vendedor</h4>
          </div>
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-border/50">
                <th className="text-left py-2 px-4 text-[11px] text-muted-foreground font-medium">Vendedor</th>
                <th className="text-right py-2 px-4 text-[11px] text-muted-foreground font-medium">Total</th>
                <th className="text-right py-2 px-4 text-[11px] text-muted-foreground font-medium w-20">%</th>
              </tr>
            </thead>
            <tbody>
              {vendedores.map((v, i) => (
                <tr key={i} className="border-b border-border/30">
                  <td className="py-2 px-4 font-medium text-foreground">{v.nombre}</td>
                  <td className="py-2 px-4 text-right font-semibold text-foreground">{fmt(v.total)}</td>
                  <td className="py-2 px-4 text-right text-muted-foreground">{v.pct.toFixed(1)}%</td>
                </tr>
              ))}
              {vendedores.length === 0 && (
                <tr><td colSpan={3} className="py-4 text-center text-muted-foreground text-[12px]">Sin datos</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Desglose por Método de Pago */}
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <h4 className="text-[12px] font-semibold text-foreground uppercase tracking-wide">Desglose por Método de Pago</h4>
          </div>
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-border/50">
                <th className="text-left py-2 px-4 text-[11px] text-muted-foreground font-medium">Método</th>
                <th className="text-right py-2 px-4 text-[11px] text-muted-foreground font-medium">Total</th>
                <th className="text-right py-2 px-4 text-[11px] text-muted-foreground font-medium w-20">%</th>
              </tr>
            </thead>
            <tbody>
              {metodosPago.map((m, i) => (
                <tr key={i} className="border-b border-border/30">
                  <td className="py-2 px-4 font-medium text-foreground">{metodoPagoLabels[m.metodo] ?? m.metodo}</td>
                  <td className="py-2 px-4 text-right font-semibold text-foreground">{fmt(m.total)}</td>
                  <td className="py-2 px-4 text-right text-muted-foreground">{m.pct.toFixed(1)}%</td>
                </tr>
              ))}
              {metodosPago.length === 0 && (
                <tr><td colSpan={3} className="py-4 text-center text-muted-foreground text-[12px]">Sin datos</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <p className="text-[11px] text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="text-xl font-bold text-foreground mt-1">{value}</p>
    </div>
  );
}
