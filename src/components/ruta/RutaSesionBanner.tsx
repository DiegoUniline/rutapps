import { useNavigate } from 'react-router-dom';
import { useRutaSesionActiva } from '@/hooks/useRutaSesion';
import { Play, Truck, CheckCircle2, AlertTriangle } from 'lucide-react';

export default function RutaSesionBanner() {
  const nav = useNavigate();
  const { data: sesion, isLoading } = useRutaSesionActiva();

  if (isLoading) return null;

  if (sesion) {
    return (
      <div className="bg-success/10 border border-success/30 rounded-xl p-3 flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-success/20 flex items-center justify-center shrink-0">
          <CheckCircle2 className="h-5 w-5 text-success" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-semibold text-foreground">Jornada en curso</p>
          <p className="text-[11px] text-muted-foreground truncate">
            {sesion.vehiculos?.alias || 'Vehículo'} · KM inicial {Number(sesion.km_inicio).toLocaleString()}
          </p>
        </div>
      </div>
    );
  }

  // Llamativo: amarillo/naranja pulsante con icono de alerta
  return (
    <button
      onClick={() => nav('/ruta/iniciar')}
      className="w-full rounded-xl p-4 flex items-center gap-3 active:scale-[0.98] transition-transform shadow-lg ring-2 ring-warning/40 animate-pulse-slow"
      style={{
        background: 'linear-gradient(135deg, hsl(38 95% 55%), hsl(20 95% 55%))',
        color: 'hsl(0 0% 100%)',
      }}
    >
      <div className="w-11 h-11 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
        <AlertTriangle className="h-6 w-6" />
      </div>
      <div className="flex-1 text-left">
        <p className="text-[15px] font-extrabold leading-tight">⚠️ Inicia tu jornada</p>
        <p className="text-[11px] opacity-95 mt-0.5">Sin jornada activa no puedes vender ni entregar</p>
      </div>
      <div className="w-9 h-9 rounded-full bg-white/25 flex items-center justify-center shrink-0">
        <Play className="h-4 w-4 fill-current" />
      </div>
    </button>
  );
}
