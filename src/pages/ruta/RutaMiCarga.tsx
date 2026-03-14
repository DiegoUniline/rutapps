import { useMemo } from 'react';
import { Package, Truck, AlertTriangle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useCargaActiva } from '@/hooks/useCargas';
import { supabase } from '@/lib/supabase';
import { fmtDate } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';

export default function RutaMiCarga() {
  const { user } = useAuth();

  // Get vendedor_id linked to this user (by matching profile name to vendedor)
  const { data: profile } = useQuery({
    queryKey: ['my-profile', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('empresa_id, nombre').eq('user_id', user!.id).single();
      return data;
    },
  });

  // Find vendedor matching this user
  const { data: vendedor } = useQuery({
    queryKey: ['my-vendedor', profile?.empresa_id, profile?.nombre],
    enabled: !!profile?.empresa_id,
    queryFn: async () => {
      const { data } = await supabase
        .from('vendedores')
        .select('id, nombre')
        .eq('empresa_id', profile!.empresa_id)
        .limit(10);
      // Try to match by name, fallback to first vendedor
      const match = data?.find(v => v.nombre.toLowerCase() === profile?.nombre?.toLowerCase());
      return match ?? data?.[0] ?? null;
    },
  });

  const { data: carga, isLoading } = useCargaActiva(vendedor?.id);

  const lineas = (carga?.carga_lineas ?? []) as any[];

  const resumen = useMemo(() => {
    let totalCargado = 0, totalDevuelto = 0, totalVendido = 0;
    lineas.forEach(l => {
      totalCargado += l.cantidad_cargada ?? 0;
      totalDevuelto += l.cantidad_devuelta ?? 0;
      totalVendido += l.cantidad_vendida ?? 0;
    });
    const totalEnMano = totalCargado - totalDevuelto - totalVendido;
    return { totalCargado, totalDevuelto, totalVendido, totalEnMano };
  }, [lineas]);

  if (isLoading) {
    return (
      <div className="p-4 flex items-center justify-center min-h-[60vh]">
        <p className="text-muted-foreground text-[13px]">Cargando...</p>
      </div>
    );
  }

  if (!carga) {
    return (
      <div className="p-4 flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center">
          <Truck className="h-7 w-7 text-muted-foreground" />
        </div>
        <p className="text-muted-foreground text-[13px] text-center">No tienes una carga activa asignada</p>
        <p className="text-muted-foreground/60 text-[11px] text-center">Pide al administrador que cree una carga para tu ruta</p>
      </div>
    );
  }

  return (
    <div className="pb-4">
      {/* Header */}
      <div className="px-4 pt-4 pb-3">
        <h1 className="text-[18px] font-bold text-foreground flex items-center gap-2">
          <Truck className="h-5 w-5 text-primary" /> Mi carga
        </h1>
        <p className="text-[12px] text-muted-foreground mt-0.5">
          {fmtDate(carga.fecha)} · {carga.status === 'pendiente' ? 'Pendiente' : 'En ruta'}
        </p>
      </div>

      {/* Summary cards */}
      <div className="px-4 grid grid-cols-4 gap-2 mb-4">
        {[
          { label: 'Cargado', value: resumen.totalCargado, color: 'text-foreground' },
          { label: 'Vendido', value: resumen.totalVendido, color: 'text-primary' },
          { label: 'Devuelto', value: resumen.totalDevuelto, color: 'text-destructive' },
          { label: 'En mano', value: resumen.totalEnMano, color: 'text-green-600 dark:text-green-400' },
        ].map(s => (
          <div key={s.label} className="bg-card border border-border rounded-xl p-2.5 text-center">
            <p className="text-[10px] text-muted-foreground">{s.label}</p>
            <p className={`text-[18px] font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Product list */}
      <div className="px-4">
        <h2 className="text-[13px] font-semibold text-foreground mb-2 flex items-center gap-1.5">
          <Package className="h-4 w-4 text-muted-foreground" />
          Productos ({lineas.length})
        </h2>
        <div className="bg-card border border-border rounded-xl divide-y divide-border">
          {lineas.length === 0 && (
            <p className="text-muted-foreground text-[12px] p-4 text-center">Sin productos en la carga</p>
          )}
          {lineas.map((l: any) => {
            const enMano = (l.cantidad_cargada ?? 0) - (l.cantidad_devuelta ?? 0) - (l.cantidad_vendida ?? 0);
            const low = enMano <= 2 && enMano > 0;
            const out = enMano <= 0;
            return (
              <div key={l.id} className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-foreground truncate">
                      {l.productos?.nombre ?? '—'}
                    </p>
                    <p className="text-[10.5px] text-muted-foreground">
                      {l.productos?.codigo} · {l.productos?.unidades?.abreviatura ?? 'pz'}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`text-[16px] font-bold ${out ? 'text-muted-foreground' : low ? 'text-amber-600 dark:text-amber-400' : 'text-foreground'}`}>
                      {enMano}
                    </p>
                    <p className="text-[10px] text-muted-foreground">de {l.cantidad_cargada}</p>
                  </div>
                </div>
                {/* Progress bar */}
                <div className="mt-1.5 h-1.5 bg-border rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${out ? 'bg-muted-foreground' : low ? 'bg-amber-500' : 'bg-primary'}`}
                    style={{ width: `${Math.max(0, Math.min(100, (enMano / (l.cantidad_cargada || 1)) * 100))}%` }}
                  />
                </div>
                {low && !out && (
                  <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-1 flex items-center gap-0.5">
                    <AlertTriangle className="h-3 w-3" /> Stock bajo
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
