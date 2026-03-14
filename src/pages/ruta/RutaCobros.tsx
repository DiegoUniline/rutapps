import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Banknote, Building2, CreditCard, Wallet } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useQuery } from '@tanstack/react-query';

const METODO_ICONS: Record<string, any> = {
  efectivo: Banknote,
  transferencia: Building2,
  tarjeta: CreditCard,
  otro: Wallet,
};

export default function RutaCobros() {
  const navigate = useNavigate();
  const { empresa } = useAuth();
  const [search, setSearch] = useState('');

  const today = new Date().toISOString().slice(0, 10);

  const { data: cobros } = useQuery({
    queryKey: ['ruta-cobros', empresa?.id, today],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from('cobros')
        .select('id, monto, fecha, metodo_pago, created_at, clientes:cliente_id(nombre, codigo)')
        .eq('empresa_id', empresa!.id)
        .order('created_at', { ascending: false })
        .limit(100);
      return data ?? [];
    },
  });

  const todayCobros = cobros?.filter(c => c.fecha === today) ?? [];
  const olderCobros = cobros?.filter(c => c.fecha !== today) ?? [];
  const totalHoy = todayCobros.reduce((s, c) => s + (c.monto ?? 0), 0);

  const formatDate = (d: string) => {
    const date = new Date(d + 'T12:00:00');
    return date.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
  };

  const renderCobro = (c: any) => {
    const Icon = METODO_ICONS[c.metodo_pago] || Wallet;
    const clienteNombre = (c.clientes as any)?.nombre ?? 'Sin cliente';
    return (
      <div key={c.id} className="rounded-lg px-3 py-2.5 bg-card flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-md bg-success/10 flex items-center justify-center shrink-0">
          <Icon className="h-4 w-4 text-success" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[12.5px] font-medium text-foreground truncate">{clienteNombre}</p>
          <p className="text-[10.5px] text-muted-foreground capitalize">{c.metodo_pago}</p>
        </div>
        <p className="text-[13px] font-bold text-success shrink-0 tabular-nums">
          +${(c.monto ?? 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
        </p>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-3 pt-3 pb-2 space-y-2">
        <div className="flex items-center justify-between">
          <h1 className="text-[17px] font-bold text-foreground">Cobros</h1>
          <button
            onClick={() => navigate('/ruta/cobros/nuevo')}
            className="bg-primary text-primary-foreground rounded-lg px-3 py-1.5 text-[12px] font-semibold flex items-center gap-1 active:scale-95 transition-transform"
          >
            <Plus className="h-3.5 w-3.5" />
            Cobrar
          </button>
        </div>

        {/* Today summary */}
        {todayCobros.length > 0 && (
          <div className="bg-success/8 rounded-lg p-3 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Cobrado hoy</p>
              <p className="text-[18px] font-bold text-success tabular-nums">${totalHoy.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</p>
            </div>
            <p className="text-[11px] text-muted-foreground">{todayCobros.length} cobros</p>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-auto px-3 pb-16 space-y-[3px]">
        {todayCobros.length > 0 && (
          <>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-1 py-1.5">Hoy</p>
            {todayCobros.map(renderCobro)}
          </>
        )}

        {olderCobros.length > 0 && (
          <>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-1 py-1.5 mt-2">Anteriores</p>
            {olderCobros.map(c => (
              <div key={c.id} className="rounded-lg px-3 py-2.5 bg-card flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-md bg-accent flex items-center justify-center shrink-0">
                  {(() => { const Icon = METODO_ICONS[c.metodo_pago] || Wallet; return <Icon className="h-4 w-4 text-muted-foreground" />; })()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[12.5px] font-medium text-foreground truncate">{(c.clientes as any)?.nombre ?? 'Sin cliente'}</p>
                  <p className="text-[10.5px] text-muted-foreground">{formatDate(c.fecha)} · {c.metodo_pago}</p>
                </div>
                <p className="text-[13px] font-semibold text-foreground shrink-0 tabular-nums">
                  ${(c.monto ?? 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                </p>
              </div>
            ))}
          </>
        )}

        {cobros?.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 gap-2">
            <Banknote className="h-10 w-10 text-muted-foreground/30" />
            <p className="text-[13px] text-muted-foreground">No hay cobros registrados</p>
            <button
              onClick={() => navigate('/ruta/cobros/nuevo')}
              className="text-[12px] text-primary font-medium mt-1"
            >
              Registrar primer cobro
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
