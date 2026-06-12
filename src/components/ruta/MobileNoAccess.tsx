import { Lock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function MobileNoAccess({ titulo = 'Sin acceso', mensaje }: { titulo?: string; mensaje?: string }) {
  const navigate = useNavigate();
  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center gap-3 p-6 text-center">
      <div className="w-14 h-14 rounded-2xl bg-destructive/10 flex items-center justify-center">
        <Lock className="h-7 w-7 text-destructive" />
      </div>
      <h2 className="text-base font-bold text-foreground">{titulo}</h2>
      <p className="text-sm text-muted-foreground max-w-xs">
        {mensaje ?? 'Tu rol no tiene permiso para esta acción. Contacta a un administrador.'}
      </p>
      <button
        onClick={() => navigate('/ruta')}
        className="mt-2 h-10 px-5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold active:scale-95 transition-transform"
      >
        Volver
      </button>
    </div>
  );
}
