import { useMemo } from 'react';
import { Package, Truck, AlertTriangle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useOfflineQuery } from '@/hooks/useOfflineData';
import { fmtDate } from '@/lib/utils';

export default function RutaMiCarga() {
  const { user, empresa } = useAuth();

  const { data: profiles } = useOfflineQuery('profiles', { user_id: user?.id }, { enabled: !!user?.id });
  const profile = (profiles ?? [])[0] as any;

  const { data: vendedores } = useOfflineQuery('vendedores', { empresa_id: profile?.empresa_id }, { enabled: !!profile?.empresa_id });
  const vendedor = (vendedores ?? []).find((v: any) => v.nombre?.toLowerCase() === profile?.nombre?.toLowerCase()) ?? (vendedores ?? [])[0] as any;

  const { data: cargas } = useOfflineQuery('cargas', { empresa_id: empresa?.id }, { enabled: !!empresa?.id, orderBy: 'fecha', ascending: false });
  const carga = (cargas ?? []).find((c: any) => c.vendedor_id === vendedor?.id && ['pendiente', 'en_ruta'].includes(c.status)) as any;

  const { data: cargaLineas } = useOfflineQuery('carga_lineas', { carga_id: carga?.id }, { enabled: !!carga?.id });
  const { data: productos } = useOfflineQuery('productos', { empresa_id: empresa?.id }, { enabled: !!empresa?.id });
  const productoMap = new Map((productos ?? []).map((p: any) => [p.id, p]));

  const lineas = (cargaLineas ?? []).map((l: any) => ({
    ...l,
    productos: productoMap.get(l.producto_id),
  }));

  const resumen = useMemo(() => {
    let totalCargado = 0, totalDevuelto = 0, totalVendido = 0;
    lineas.forEach((l: any) => {
      totalCargado += l.cantidad_cargada ?? 0;
      totalDevuelto += l.cantidad_devuelta ?? 0;
      totalVendido += l.cantidad_vendida ?? 0;
    });
    return { totalCargado, totalDevuelto, totalVendido, totalEnMano: totalCargado - totalDevuelto - totalVendido };
  }, [lineas]);

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
      <div className="px-4 pt-4 pb-3">
        <h1 className="text-[18px] font-bold text-foreground flex items-center gap-2">
          <Truck className="h-5 w-5 text-primary" /> Mi carga
        </h1>
        <p className="text-[12px] text-muted-foreground mt-0.5">
          {fmtDate(carga.fecha)} · {carga.status === 'pendiente' ? 'Pendiente' : 'En ruta'}
        </p>
      </div>

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

      <div className="px-4">
        <h2 className="text-[13px] font-semibold text-foreground mb-2 flex items-center gap-1.5">
          <Package className="h-4 w-4 text-muted-foreground" /> Productos ({lineas.length})
        </h2>
        <div className="bg-card border border-border rounded-xl divide-y divide-border">
          {lineas.length === 0 && <p className="text-muted-foreground text-[12px] p-4 text-center">Sin productos en la carga</p>}
          {lineas.map((l: any) => {
            const enMano = (l.cantidad_cargada ?? 0) - (l.cantidad_devuelta ?? 0) - (l.cantidad_vendida ?? 0);
            const low = enMano <= 2 && enMano > 0;
            const out = enMano <= 0;
            return (
              <div key={l.id} className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-foreground truncate">{l.productos?.nombre ?? '—'}</p>
                    <p className="text-[10.5px] text-muted-foreground">{l.productos?.codigo}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`text-[16px] font-bold ${out ? 'text-muted-foreground' : low ? 'text-amber-600 dark:text-amber-400' : 'text-foreground'}`}>
                      {enMano}
                    </p>
                    <p className="text-[10px] text-muted-foreground">de {l.cantidad_cargada}</p>
                  </div>
                </div>
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
