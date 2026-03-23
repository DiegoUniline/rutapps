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
  const { desde, hasta, setDesde, setHasta, filterByDate } = useDateFilter();

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

  const filteredCobros = filterByDate((cobros ?? []) as any[], 'fecha');
  const totalFiltrado = filteredCobros.reduce((s: number, c: any) => s + (c.monto ?? 0), 0);

  const formatDate = (d: string) => {
    const date = new Date(d + 'T12:00:00');
    return date.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
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

        <DateFilterBar desde={desde} hasta={hasta} onDesdeChange={setDesde} onHastaChange={setHasta} />

        {filteredCobros.length > 0 && (
          <div className="bg-success/8 rounded-xl p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total cobrado</p>
              <p className="text-2xl font-bold text-success tabular-nums">${totalFiltrado.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</p>
            </div>
            <p className="text-sm text-muted-foreground">{filteredCobros.length} cobros</p>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-auto px-4 pb-4">
        <div className="space-y-1.5">
          {filteredCobros.map((c: any) => {
            const Icon = METODO_ICONS[c.metodo_pago] || Wallet;
            const clienteNombre = clienteMap.get(c.cliente_id) ?? 'Sin cliente';
            return (
              <div key={c.id} className="rounded-xl px-4 py-3.5 bg-card flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-success/10 flex items-center justify-center shrink-0">
                  <Icon className="h-5 w-5 text-success" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{clienteNombre}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(c.fecha)} · {c.metodo_pago}</p>
                </div>
                <p className="text-sm font-bold text-success shrink-0 tabular-nums">
                  +${(c.monto ?? 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                </p>
              </div>
            );
          })}
        </div>

        {filteredCobros.length === 0 && (
          <div className="text-center py-12">
            <Banknote className="h-12 w-12 mx-auto mb-3 text-muted-foreground/30" />
            <p className="text-muted-foreground text-base">No hay cobros en este rango</p>
          </div>
        )}
      </div>
    </div>
  );
}
