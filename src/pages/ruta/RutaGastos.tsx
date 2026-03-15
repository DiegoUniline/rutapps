import { useState } from 'react';
import { Plus, X, Receipt } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useOfflineQuery, useOfflineMutation } from '@/hooks/useOfflineData';
import { toast } from 'sonner';

export default function RutaGastos() {
  const { empresa, user } = useAuth();
  const queryClient = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);
  const [showForm, setShowForm] = useState(false);
  const [concepto, setConcepto] = useState('');
  const [monto, setMonto] = useState('');

  const { data: gastos, isLoading } = useQuery({
    queryKey: ['ruta-gastos', empresa?.id, today],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from('gastos')
        .select('*')
        .eq('empresa_id', empresa!.id)
        .eq('fecha', today)
        .order('created_at', { ascending: false });
      return data ?? [];
    },
  });

  const saveMut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('gastos').insert({
        empresa_id: empresa!.id,
        user_id: user!.id,
        concepto,
        monto: +monto,
        fecha: today,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Gasto registrado');
      queryClient.invalidateQueries({ queryKey: ['ruta-gastos'] });
      queryClient.invalidateQueries({ queryKey: ['ruta-stats'] });
      setShowForm(false);
      setConcepto('');
      setMonto('');
    },
    onError: (err: any) => toast.error(err.message),
  });

  const totalHoy = gastos?.reduce((s, g) => s + (g.monto ?? 0), 0) ?? 0;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background px-4 pt-4 pb-3">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-[20px] font-bold text-foreground">Gastos</h1>
          <button
            onClick={() => setShowForm(true)}
            className="bg-primary text-primary-foreground rounded-xl px-4 py-2 text-[13px] font-semibold flex items-center gap-1.5 active:scale-95 transition-transform"
          >
            <Plus className="h-4 w-4" /> Registrar
          </button>
        </div>

        {/* Today total */}
        <div className="bg-destructive/5 border border-destructive/20 rounded-xl p-3 flex items-center justify-between">
          <span className="text-[13px] text-muted-foreground">Total hoy</span>
          <span className="text-[18px] font-bold text-destructive">
            $ {totalHoy.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
          </span>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 px-4 space-y-2 pb-4 pt-2">
        {isLoading && <p className="text-center text-muted-foreground text-[13px] py-8">Cargando...</p>}
        {gastos?.map(g => (
          <div key={g.id} className="bg-card border border-border rounded-xl p-3.5 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-destructive/10 flex items-center justify-center shrink-0">
              <Receipt className="h-5 w-5 text-destructive" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold text-foreground truncate">{g.concepto}</p>
              <p className="text-[11px] text-muted-foreground">
                {new Date(g.created_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
            <span className="text-[15px] font-bold text-foreground shrink-0">
              $ {(g.monto ?? 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
            </span>
          </div>
        ))}
        {!isLoading && gastos?.length === 0 && (
          <p className="text-center text-muted-foreground text-[13px] py-8">Sin gastos registrados hoy</p>
        )}
      </div>

      {/* Quick add form — modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end justify-center" onClick={() => setShowForm(false)}>
          <div
            className="bg-card w-full max-w-lg rounded-t-2xl p-5 space-y-4 animate-in slide-in-from-bottom"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-[16px] font-bold">Registrar gasto</h2>
              <button onClick={() => setShowForm(false)} className="text-muted-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div>
              <label className="text-[12px] font-medium text-muted-foreground mb-1 block">Concepto</label>
              <input
                type="text"
                className="w-full bg-background border border-border rounded-xl px-3 py-3 text-[14px] focus:outline-none focus:ring-2 focus:ring-primary/30"
                placeholder="Ej: Gasolina, comida, peaje..."
                value={concepto}
                onChange={e => setConcepto(e.target.value)}
                autoFocus
              />
            </div>
            <div>
              <label className="text-[12px] font-medium text-muted-foreground mb-1 block">Monto</label>
              <input
                type="number"
                className="w-full bg-background border border-border rounded-xl px-3 py-3 text-[18px] font-bold focus:outline-none focus:ring-2 focus:ring-primary/30"
                placeholder="$ 0.00"
                value={monto}
                onChange={e => setMonto(e.target.value)}
                inputMode="decimal"
              />
            </div>
            <button
              onClick={() => saveMut.mutate()}
              disabled={!concepto || !monto || saveMut.isPending}
              className="w-full bg-primary text-primary-foreground rounded-xl py-3.5 text-[15px] font-semibold disabled:opacity-50 active:scale-[0.98] transition-transform"
            >
              {saveMut.isPending ? 'Guardando...' : 'Guardar gasto'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
