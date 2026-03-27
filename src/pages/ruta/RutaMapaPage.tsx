import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Navigation, Phone, ShoppingCart, ExternalLink } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/utils';

const DIAS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
const DIA_HOY = DIAS[new Date().getDay() === 0 ? 6 : new Date().getDay() - 1];

export default function RutaMapaPage() {
  const navigate = useNavigate();
  const { empresa } = useAuth();

  const { data: clientes } = useQuery({
    queryKey: ['ruta-clientes-mapa', empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from('clientes')
        .select('id, nombre, direccion, colonia, telefono, dia_visita, gps_lat, gps_lng, orden')
        .eq('empresa_id', empresa!.id)
        .eq('status', 'activo')
        .order('orden', { ascending: true });
      return (data ?? [])
        .filter(c => c.dia_visita?.some((d: string) => d.toLowerCase() === DIA_HOY.toLowerCase()) && c.gps_lat && c.gps_lng)
        .sort((a, b) => (a.orden ?? 999) - (b.orden ?? 999));
    },
  });

  const openGoogleMapsRoute = () => {
    if (!clientes || clientes.length === 0) return;
    // Build Google Maps directions URL with all waypoints
    const waypoints = clientes.map(c => `${c.gps_lat},${c.gps_lng}`);
    const origin = waypoints[0];
    const destination = waypoints[waypoints.length - 1];
    const middle = waypoints.slice(1, -1).join('|');
    
    let url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}`;
    if (middle) url += `&waypoints=${middle}`;
    url += '&travelmode=driving';
    window.open(url, '_blank');
  };

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-card border-b border-border px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-1 -ml-1">
          <ArrowLeft className="h-5 w-5 text-foreground" />
        </button>
        <div className="flex-1">
          <h1 className="text-[16px] font-bold text-foreground">Mapa de ruta</h1>
          <p className="text-[11px] text-muted-foreground capitalize">{DIA_HOY} · {clientes?.length ?? 0} clientes</p>
        </div>
        {clientes && clientes.length > 0 && (
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => navigate('/ruta/navegacion?modo=clientes')}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary text-primary-foreground text-[12px] font-semibold active:scale-95 transition-transform"
            >
              <Navigation className="h-3.5 w-3.5" /> Guiar
            </button>
            <button
              onClick={openGoogleMapsRoute}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-card border border-border text-foreground text-[12px] font-semibold active:scale-95 transition-transform"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </header>

      {/* Client list for route */}
      <div className="flex-1 overflow-auto p-4 space-y-2">
        {!clientes || clientes.length === 0 ? (
          <div className="text-center py-12">
            <Navigation className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
            <p className="text-muted-foreground text-[13px]">No hay clientes con GPS para hoy</p>
            <p className="text-muted-foreground text-[11px] mt-1">Agrega coordenadas GPS a tus clientes</p>
          </div>
        ) : (
          <>
            <p className="text-[11px] text-muted-foreground mb-1">
              Orden de visita · Toca "Navegar" para abrir la ruta en Google Maps
            </p>

            {clientes.map((c, idx) => (
              <div key={c.id} className="bg-card border border-border rounded-2xl p-3 flex items-center gap-3">
                {/* Number */}
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <span className="text-primary font-bold text-[13px]">{idx + 1}</span>
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-foreground truncate">{c.nombre}</p>
                  {c.direccion && (
                    <p className="text-[11px] text-muted-foreground truncate">{c.direccion}{c.colonia ? `, ${c.colonia}` : ''}</p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex gap-1.5 shrink-0">
                  <button
                    onClick={() => window.open(`https://www.google.com/maps/dir/?api=1&destination=${c.gps_lat},${c.gps_lng}`, '_blank')}
                    className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary active:scale-90 transition-transform"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => navigate(`/ruta/ventas/nueva?clienteId=${c.id}`)}
                    className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary active:scale-90 transition-transform"
                  >
                    <ShoppingCart className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}

            {/* Open full route button */}
            <button
              onClick={openGoogleMapsRoute}
              className="w-full mt-2 bg-card border border-border rounded-2xl py-3.5 text-[13px] font-semibold text-primary flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
            >
              <Navigation className="h-4 w-4" /> Abrir ruta completa en Google Maps
            </button>
          </>
        )}
      </div>
    </div>
  );
}
