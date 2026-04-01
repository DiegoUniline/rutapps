import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useOfflineQuery } from '@/hooks/useOfflineData';
import { Truck, ChevronRight, Package, MapPin, Navigation, CheckCircle2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { fmtDate } from '@/lib/utils';

export default function RutaEntregas() {
  const navigate = useNavigate();
  const { empresa, profile } = useAuth();
  const vendedorId = profile?.vendedor_id;

  const { data: allEntregas } = useOfflineQuery('entregas', {
    empresa_id: empresa?.id,
  }, { enabled: !!empresa?.id, orderBy: 'fecha' });

  const { data: clientes } = useOfflineQuery('clientes', { empresa_id: empresa?.id }, { enabled: !!empresa?.id });
  const { data: entregaLineas } = useOfflineQuery('entrega_lineas', {}, { enabled: !!empresa?.id });
  const { data: productos } = useOfflineQuery('productos', { empresa_id: empresa?.id }, { enabled: !!empresa?.id });

  const clienteMap = new Map((clientes ?? []).map((c: any) => [c.id, c]));
  const productoMap = new Map((productos ?? []).map((p: any) => [p.id, p]));

  const entregas = (allEntregas ?? [])
    .filter((e: any) =>
      (e.status === 'cargado' || e.status === 'en_ruta' || e.status === 'hecho') &&
      (e.vendedor_ruta_id === vendedorId || e.vendedor_id === vendedorId)
    )
    .map((e: any) => {
      const cliente = clienteMap.get(e.cliente_id);
      const lineas = (entregaLineas ?? [])
        .filter((l: any) => l.entrega_id === e.id)
        .map((l: any) => ({
          ...l,
          _productoNombre: productoMap.get(l.producto_id)?.nombre ?? '—',
        }));
      const totalPiezas = lineas.reduce((acc: number, l: any) => acc + (l.cantidad_entregada || l.cantidad_pedida || 0), 0);
      return { ...e, _cliente: cliente, _lineas: lineas, _totalPiezas: totalPiezas };
    })
    .sort((a: any, b: any) => {
      // Pendientes primero, entregados al final
      if (a.status === 'hecho' && b.status !== 'hecho') return 1;
      if (a.status !== 'hecho' && b.status === 'hecho') return -1;
      return 0;
    });

  const pendientes = entregas.filter((e: any) => e.status !== 'hecho');
  const entregados = entregas.filter((e: any) => e.status === 'hecho');

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Truck className="h-5 w-5 text-primary" />
        <h1 className="text-[18px] font-bold text-foreground">Por entregar</h1>
        <Badge variant="secondary" className="text-[11px]">{pendientes.length} pendientes</Badge>
        {entregas.length > 0 && (
          <Button
            size="sm"
            variant="outline"
            className="ml-auto rounded-xl gap-1.5 text-[11px]"
            onClick={() => navigate('/ruta/navegacion')}
          >
            <Navigation className="h-3.5 w-3.5" /> Navegar
          </Button>
        )}
      </div>

      {entregas.length === 0 && (
        <div className="text-center py-16">
          <Package className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
          <p className="text-muted-foreground text-sm">No tienes entregas pendientes</p>
        </div>
      )}

      {entregas.map((e: any) => (
        <button key={e.id}
          onClick={() => navigate(`/ruta/entregas/${e.id}`)}
          className="w-full text-left bg-card border border-border rounded-2xl overflow-hidden active:scale-[0.98] transition-transform"
        >
          <div className="p-4 space-y-2">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[11px] font-mono text-muted-foreground">{e.folio}</p>
                <p className="text-[15px] font-semibold text-foreground">{e._cliente?.nombre ?? '—'}</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <Badge variant="outline" className="text-[10px] border-warning text-warning">
                  {e.status === 'en_ruta' ? 'En ruta' : 'Cargado'}
                </Badge>
                <ChevronRight className="h-4 w-4 text-muted-foreground/50" />
              </div>
            </div>

            {(e._cliente?.direccion || e._cliente?.colonia) && (
              <div className="flex items-start gap-1.5 text-[12px] text-muted-foreground">
                <MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>{[e._cliente?.direccion, e._cliente?.colonia].filter(Boolean).join(', ')}</span>
              </div>
            )}

            <div className="flex items-center justify-between">
              <p className="text-[11px] text-muted-foreground">{fmtDate(e.fecha)}</p>
              <p className="text-[12px] font-medium text-foreground">{e._totalPiezas} pza{e._totalPiezas !== 1 ? 's' : ''} · {e._lineas.length} línea{e._lineas.length !== 1 ? 's' : ''}</p>
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}
