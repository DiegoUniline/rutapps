import TabMetas from './dashboard/sections/TabMetas';
import { fmtMoney } from '@/lib/currency';
import { Target } from 'lucide-react';

export default function MetasConfigPage() {
  return (
    <div className="p-4 space-y-3 min-h-full">
      <div className="flex items-center gap-2">
        <Target className="h-5 w-5 text-primary" />
        <h1 className="text-xl font-semibold text-foreground">Configuración de metas</h1>
      </div>
      <p className="text-xs text-muted-foreground">Define metas mensuales por vendedor, producto o presentación. Duplica las del mes anterior con un clic.</p>
      <TabMetas money={fmtMoney} mode="config" />
    </div>
  );
}
