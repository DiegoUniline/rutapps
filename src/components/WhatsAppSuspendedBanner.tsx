import { useLocation } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useIsMobile } from '@/hooks/use-mobile';

export default function WhatsAppSuspendedBanner() {
  const location = useLocation();
  const { empresa } = useAuth();
  const isMobile = useIsMobile();
  // En teléfono la licencia va dentro del menú ☰ (barra superior compacta).
  if (location.pathname.startsWith('/ruta') || isMobile) return null;

  const licencia = empresa?.licencia;

  return (
    <div className="relative z-[100] flex w-full items-center justify-center bg-primary px-3 py-1 text-primary-foreground">
      <div className="flex items-center gap-1.5 rounded-full bg-primary-foreground/15 px-2 py-0.5 backdrop-blur-sm">
        <ShieldCheck className="h-3.5 w-3.5" />
        <span className="text-[10px] font-semibold tracking-wide opacity-90">
          Licencia
        </span>
        <span className="font-mono text-xs font-bold">
          {licencia ?? '--------'}
        </span>
      </div>
    </div>
  );
}
