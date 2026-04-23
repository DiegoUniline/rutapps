import { useNavigate } from 'react-router-dom';
import { useRutaSesionActiva } from '@/hooks/useRutaSesion';
import { Play, Truck, CheckCircle2 } from 'lucide-react';

export default function RutaSesionBanner() {
  const nav = useNavigate();
  const { data: sesion, isLoading } = useRutaSesionActiva();

  if (isLoading) return null;

  if (sesion) {
    return (
      <div className="bg-success/10 border border-success/20 rounded-xl p-3 flex items-center gap-3">
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

  return (
    <button
      onClick={() => nav('/ruta/iniciar')}
      className="w-full bg-primary text-primary-foreground rounded-xl p-3 flex items-center gap-3 active:scale-[0.98] transition-transform shadow-md shadow-primary/20"
    >
      <div className="w-9 h-9 rounded-lg bg-primary-foreground/15 flex items-center justify-center shrink-0">
        <Truck className="h-5 w-5" />
      </div>
      <div className="flex-1 text-left">
        <p className="text-[13px] font-bold">Iniciar jornada</p>
        <p className="text-[11px] opacity-90">Registra vehículo, KM y foto del odómetro</p>
      </div>
      <Play className="h-4 w-4" />
    </button>
  );
}
