import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Banknote, Building2, CreditCard, Wallet } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useOfflineQuery } from '@/hooks/useOfflineData';
import { useDateFilter } from '@/hooks/useDateFilter';
import DateFilterBar from '@/components/ruta/DateFilterBar';

const METODO_ICONS: Record<string, any> = {
  efectivo: Banknote,
  transferencia: Building2,
  tarjeta: CreditCard,
  otro: Wallet,
};

export default function RutaCobros() {
  const navigate = useNavigate();
  const { empresa, user } = useAuth();

  const today = new Date().toISOString().slice(0, 10);

  const { data: cobros } = useOfflineQuery('cobros', {
    empresa_id: empresa?.id,
    user_id: user?.id,
  }, {
    enabled: !!empresa?.id && !!user?.id,
    orderBy: 'created_at',
    ascending: false,
  });

  const { data: clientes } = useOfflineQuery('clientes', { empresa_id: empresa?.id }, { enabled: !!empresa?.id });
  const clienteMap = new Map((clientes ?? []).map((c: any) => [c.id, c.nombre]));

  const recentCobros = (cobros ?? []).slice(0, 100);
  const todayCobros = recentCobros.filter((c: any) => c.fecha === today);
  const olderCobros = recentCobros.filter((c: any) => c.fecha !== today);
  const totalHoy = todayCobros.reduce((s: number, c: any) => s + (c.monto ?? 0), 0);

  const formatDate = (d: string) => {
    const date = new Date(d + 'T12:00:00');
    return date.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
  };

  const renderCobro = (c: any) => {
    const Icon = METODO_ICONS[c.metodo_pago] || Wallet;
    const clienteNombre = clienteMap.get(c.cliente_id) ?? 'Sin cliente';
    return (
      <div key={c.id} className="rounded-xl px-4 py-3.5 bg-card flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-success/10 flex items-center justify-center shrink-0">
          <Icon className="h-5 w-5 text-success" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{clienteNombre}</p>
          <p className="text-xs text-muted-foreground capitalize">{c.metodo_pago}</p>
        </div>
        <p className="text-sm font-bold text-success shrink-0 tabular-nums">
          +${(c.monto ?? 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
        </p>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 pt-4 pb-2 space-y-3">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-foreground">Cobros</h1>
          <button
            onClick={() => navigate('/ruta/cobros/nuevo')}
            className="bg-primary text-primary-foreground rounded-xl px-4 py-2.5 text-sm font-semibold flex items-center gap-1.5 active:scale-95 transition-transform min-h-[44px]"
          >
            <Plus className="h-4 w-4" />
            Cobrar
          </button>
        </div>

        {todayCobros.length > 0 && (
          <div className="bg-success/8 rounded-xl p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Cobrado hoy</p>
              <p className="text-2xl font-bold text-success tabular-nums">${totalHoy.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</p>
            </div>
            <p className="text-sm text-muted-foreground">{todayCobros.length} cobros</p>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-auto px-4 pb-4">
        {todayCobros.length > 0 && (
          <>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1 py-2">Hoy</p>
            <div className="space-y-1.5">
              {todayCobros.map(renderCobro)}
            </div>
          </>
        )}

        {olderCobros.length > 0 && (
          <>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1 py-2 mt-3">Anteriores</p>
            <div className="space-y-1.5">
              {olderCobros.map((c: any) => {
                const Icon = METODO_ICONS[c.metodo_pago] || Wallet;
                const clienteNombre = clienteMap.get(c.cliente_id) ?? 'Sin cliente';
                return (
                  <div key={c.id} className="rounded-xl px-4 py-3.5 bg-card/60 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                      <Icon className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{clienteNombre}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(c.fecha)} · {c.metodo_pago}</p>
                    </div>
                    <p className="text-sm font-semibold text-foreground shrink-0 tabular-nums">
                      ${(c.monto ?? 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {recentCobros.length === 0 && (
          <div className="text-center py-12">
            <Banknote className="h-12 w-12 mx-auto mb-3 text-muted-foreground/30" />
            <p className="text-muted-foreground text-base">No hay cobros registrados</p>
          </div>
        )}
      </div>
    </div>
  );
}
