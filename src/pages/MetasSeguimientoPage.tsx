import TabMetas from './dashboard/sections/TabMetas';
import { fmtMoney } from '@/lib/currency';
import { TrendingUp } from 'lucide-react';

export default function MetasSeguimientoPage() {
  return (
    <div className="p-4 space-y-3 min-h-full">
      <div className="flex items-center gap-2">
        <TrendingUp className="h-5 w-5 text-primary" />
        <h1 className="text-xl font-semibold text-foreground">Seguimiento de metas</h1>
      </div>
      <p className="text-xs text-muted-foreground">Mira el avance del mes vs lo configurado por vendedor y producto, con historial de meses anteriores.</p>
      <TabMetas money={fmtMoney} mode="seguimiento" />
    </div>
  );
}
