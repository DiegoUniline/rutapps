import { Search, Check, ChevronRight } from 'lucide-react';
import type { Step } from './types';

interface Props {
  searchCliente: string;
  setSearchCliente: (v: string) => void;
  filteredClientes: any[] | undefined;
  clienteId: string | null;
  setClienteId: (v: string | null) => void;
  setClienteNombre: (v: string) => void;
  setClienteCredito: (v: { credito: boolean; limite: number; dias: number } | null) => void;
  setCondicionPago: (v: 'contado' | 'credito' | 'por_definir') => void;
  setStep: (s: Step) => void;
}

export function StepCliente(props: Props) {
  const { searchCliente, setSearchCliente, filteredClientes, clienteId, setClienteId, setClienteNombre, setClienteCredito, setCondicionPago, setStep } = props;

  const selectCliente = (id: string | null, nombre: string, credito: { credito: boolean; limite: number; dias: number } | null) => {
    setClienteId(id);
    setClienteNombre(nombre);
    setClienteCredito(credito);
    setCondicionPago('contado');
    setStep('devoluciones');
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-3 pt-2.5 pb-1.5">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input type="text" placeholder="Buscar por nombre o código..."
            className="w-full bg-accent/60 rounded-lg pl-8 pr-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1.5 focus:ring-primary/40"
            value={searchCliente} onChange={e => setSearchCliente(e.target.value)} autoFocus />
        </div>
      </div>
      <div className="flex-1 overflow-auto px-3 pb-4">
        <button onClick={() => selectCliente(null, 'Público general', null)}
          className="w-full mb-1.5 rounded-lg px-3 py-2.5 flex items-center gap-2.5 bg-accent/40 border border-dashed border-primary/25 active:scale-[0.98] transition-transform text-left">
          <div className="w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center shrink-0"><span className="text-primary text-[11px] font-bold">PG</span></div>
          <div className="flex-1 min-w-0"><p className="text-[12.5px] font-medium text-foreground">Público general</p><p className="text-[10.5px] text-muted-foreground">Continuar sin cliente</p></div>
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
        </button>
        <div className="space-y-[3px]">
          {filteredClientes?.map(c => (
            <button key={c.id}
              onClick={() => selectCliente(c.id, c.nombre, { credito: c.credito ?? false, limite: c.limite_credito ?? 0, dias: c.dias_credito ?? 0 })}
              className={`w-full rounded-lg px-3 py-2.5 flex items-center gap-2.5 active:scale-[0.98] transition-all text-left ${clienteId === c.id ? 'bg-primary/8 ring-1.5 ring-primary/40' : 'bg-card hover:bg-accent/30'}`}>
              <div className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${clienteId === c.id ? 'bg-primary text-primary-foreground' : 'bg-accent text-foreground'}`}>
                <span className="text-[11px] font-bold">{c.nombre.charAt(0)}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[12.5px] font-medium text-foreground truncate">{c.nombre}</p>
                {c.codigo && <p className="text-[10.5px] text-muted-foreground">{c.codigo}</p>}
              </div>
              {c.credito && <span className="text-[9px] bg-accent text-muted-foreground px-1.5 py-0.5 rounded font-medium">Crédito</span>}
              {clienteId === c.id && <Check className="h-4 w-4 text-primary shrink-0" />}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
