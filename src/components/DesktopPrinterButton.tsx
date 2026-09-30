import { useEffect, useState } from 'react';
import { Printer } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import DesktopPrinterCard from '@/components/DesktopPrinterCard';
import { getAgentStatus, isDesktop } from '@/lib/desktopPrintAgent';
import { cn } from '@/lib/utils';

export default function DesktopPrinterButton() {
  const [connected, setConnected] = useState<boolean | null>(null);

  useEffect(() => {
    if (isDesktop()) getAgentStatus().then(s => setConnected(!!s?.printer));
  }, []);

  if (!isDesktop()) return null;

  return (
    <Popover onOpenChange={o => { if (!o) getAgentStatus(true).then(s => setConnected(!!s?.printer)); }}>
      <PopoverTrigger asChild>
        <button
          className="relative p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          title={connected ? 'Impresora de escritorio conectada' : 'Descargar agente de impresión'}
        >
          <Printer className="h-4 w-4" />
          {connected !== null && (
            <span className={cn('absolute top-1.5 right-1.5 h-2 w-2 rounded-full', connected ? 'bg-green-500' : 'bg-amber-500')} />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[400px] p-0 border-0 bg-transparent shadow-none">
        <DesktopPrinterCard />
      </PopoverContent>
    </Popover>
  );
}
