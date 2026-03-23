interface Props {
  clienteNombre: string;
  motivoSinCompra: string;
  setMotivoSinCompra: (v: string) => void;
  notas: string;
  setNotas: (v: string) => void;
  savingSinCompra: boolean;
  setSavingSinCompra: (v: boolean) => void;
  setSinCompra: (v: boolean) => void;
  saveVisita: (tipo: string, opts?: { motivo?: string; notasVisita?: string }) => Promise<void>;
  markVisited: (cId: string) => void;
  clienteId: string | null;
  urlClienteId: string | null;
  navigate: (to: any) => void;
}

const MOTIVOS_SIN_COMPRA = ['No necesita producto', 'No hay stock de lo que pide', 'Cerrado / no encontrado', 'Sin dinero', 'Precio alto', 'Otro'];

export function StepSinCompra(props: Props) {
  const { clienteNombre, motivoSinCompra, setMotivoSinCompra, notas, setNotas, savingSinCompra, setSavingSinCompra, setSinCompra, saveVisita, markVisited, clienteId, urlClienteId, navigate } = props;

  return (
    <div className="flex-1 flex flex-col px-6 pt-8 gap-5">
      <div className="text-center">
        <h2 className="text-[18px] font-bold text-foreground mb-1">¿Por qué no compró?</h2>
        <p className="text-[12px] text-muted-foreground">{clienteNombre || 'Cliente'}</p>
      </div>
      <div className="w-full max-w-xs mx-auto space-y-2">
        {MOTIVOS_SIN_COMPRA.map(m => (
          <button key={m} onClick={() => setMotivoSinCompra(m)}
            className={`w-full rounded-xl border-2 px-4 py-3 text-left text-[13px] font-medium active:scale-[0.98] transition-all ${motivoSinCompra === m ? 'border-primary bg-primary/5 text-foreground' : 'border-border bg-card text-foreground hover:border-primary/30'}`}>
            {m}
          </button>
        ))}
      </div>
      {motivoSinCompra === 'Otro' && (
        <div className="w-full max-w-xs mx-auto">
          <textarea className="w-full bg-accent/40 rounded-lg px-3 py-2 text-[12px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1.5 focus:ring-primary/40 resize-none"
            rows={2} placeholder="Describe el motivo..." value={notas} onChange={e => setNotas(e.target.value)} autoFocus />
        </div>
      )}
      <div className="w-full max-w-xs mx-auto flex gap-2 mt-2">
        <button onClick={() => { setSinCompra(false); setMotivoSinCompra(''); }}
          className="flex-1 bg-card border border-destructive/30 text-destructive rounded-xl py-3 text-[13px] font-semibold active:scale-[0.98] transition-transform">Cancelar</button>
        <button disabled={!motivoSinCompra || savingSinCompra}
          onClick={async () => {
            setSavingSinCompra(true);
            try {
              await saveVisita('sin_compra', { motivo: motivoSinCompra, notasVisita: motivoSinCompra === 'Otro' ? notas : undefined });
              const cId = clienteId || urlClienteId;
              if (cId) markVisited(cId);
              navigate(-1);
            } catch {} finally { setSavingSinCompra(false); }
          }}
          className="flex-1 bg-primary text-primary-foreground rounded-xl py-3 text-[14px] font-bold disabled:opacity-40 active:scale-[0.98] transition-transform shadow-lg shadow-primary/20">
          {savingSinCompra ? 'Guardando...' : 'Guardar'}
        </button>
      </div>
    </div>
  );
}
