import { useCurrency } from '@/hooks/useCurrency';

export function ReporteUtilidad({ data }: { data: any }) {
  const { fmt } = useCurrency();
  const { totalVentas, costoTotal, totalGastos, utilidadBruta, utilidadNeta, gastosDesglose } = data;
  const margenBruto = totalVentas > 0 ? Math.round((utilidadBruta / totalVentas) * 100) : 0;
  const margenNeto = totalVentas > 0 ? Math.round((utilidadNeta / totalVentas) * 100) : 0;

  const fmt2 = (n: number) => `${n < 0 ? '-' : ''} $ ${Math.abs(n).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;

  return (
    <div className="space-y-4">
      {/* Estado de resultados */}
      <div className="bg-card border border-border rounded-lg p-4">
        <h3 className="text-xs font-bold text-muted-foreground uppercase mb-3 border-b border-border pb-1">Estado de resultados</h3>
        <div className="space-y-1 text-[12px]">
          <div className="flex justify-between font-semibold">
            <span>Ventas totales</span>
            <span>{fmt2(totalVentas)}</span>
          </div>
          <div className="flex justify-between text-muted-foreground">
            <span>(-) Costo de ventas</span>
            <span>{fmt2(-costoTotal)}</span>
          </div>
          <div className="border-t border-border pt-1 mt-1 flex justify-between font-bold">
            <span>= Utilidad bruta</span>
            <span>{fmt2(utilidadBruta)} <span className="text-[10px] text-muted-foreground font-normal">({margenBruto}%)</span></span>
          </div>
          <div className="pt-2 flex justify-between text-muted-foreground">
            <span>(-) Gastos operativos</span>
            <span>{fmt2(-totalGastos)}</span>
          </div>
          <div className="border-t-2 border-border pt-1 mt-1 flex justify-between font-bold">
            <span>= Utilidad neta</span>
            <span>{fmt2(utilidadNeta)} <span className="text-[10px] text-muted-foreground font-normal">({margenNeto}%)</span></span>
          </div>
        </div>
      </div>

      {/* Desglose de gastos */}
      {gastosDesglose.length > 0 && (
        <div className="bg-card border border-border rounded-lg p-4">
          <h3 className="text-xs font-bold text-muted-foreground uppercase mb-3 border-b border-border pb-1">Desglose de gastos</h3>
          <div className="space-y-2">
            {gastosDesglose.map((g: any, i: number) => (
              <div key={i} className="flex items-center justify-between text-[12px]">
                <span>{g.concepto}</span>
                <span className="font-semibold">{fmt(g.monto)}</span>
              </div>
            ))}
            <div className="border-t border-border pt-2 flex items-center justify-between text-[12px] font-bold">
              <span>Total gastos</span>
              <span>{fmt(totalGastos)}</span>
            </div>
          </div>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-card border border-border rounded-lg p-3 text-center">
          <div className="text-[9px] text-muted-foreground uppercase font-semibold">Ventas</div>
          <div className="text-lg font-bold text-foreground">{fmt(totalVentas)}</div>
        </div>
        <div className="bg-card border border-border rounded-lg p-3 text-center">
          <div className="text-[9px] text-muted-foreground uppercase font-semibold">Costo mercancía</div>
          <div className="text-lg font-bold text-foreground">{fmt(costoTotal)}</div>
        </div>
        <div className="bg-card border border-border rounded-lg p-3 text-center">
          <div className="text-[9px] text-muted-foreground uppercase font-semibold">Utilidad bruta</div>
          <div className="text-lg font-bold text-foreground">{fmt(utilidadBruta)}</div>
        </div>
        <div className="bg-card border border-border rounded-lg p-3 text-center">
          <div className="text-[9px] text-muted-foreground uppercase font-semibold">Utilidad neta</div>
          <div className="text-lg font-bold text-foreground">{fmt(utilidadNeta)}</div>
        </div>
      </div>
    </div>
  );
}
