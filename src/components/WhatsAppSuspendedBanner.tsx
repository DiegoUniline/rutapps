import { useLocation } from 'react-router-dom';
import { MessageCircle, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

const PHONE = '3171045954';
const PHONE_DISPLAY = '317 104 5954';
const WA_URL = `https://wa.me/52${PHONE}`;

export default function WhatsAppSuspendedBanner() {
  const location = useLocation();
  const { empresa } = useAuth();
  if (location.pathname.startsWith('/ruta')) return null;

  const licencia = empresa?.licencia;

  return (
    <div className="w-full px-4 py-2 text-sm font-medium bg-primary text-primary-foreground relative z-[100] flex items-center justify-between gap-3 flex-wrap">
      <div className="flex items-center gap-2 shrink-0 rounded-full bg-primary-foreground/15 px-2.5 py-1 backdrop-blur-sm">
        <ShieldCheck className="h-3.5 w-3.5" />
        <span className="text-xs font-semibold tracking-wide opacity-90">
          Licencia
        </span>
        <span className="font-mono font-bold text-sm">
          {licencia ?? '--------'}
        </span>
      </div>
      <div className="flex items-center gap-2 flex-1 justify-center min-w-0">
        <MessageCircle className="h-4 w-4 shrink-0" />
        <span className="truncate">
          ¿Dudas o necesitas ayuda? Escríbenos a RutApp al{' '}
          <a
            href={WA_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="font-bold underline underline-offset-2 hover:opacity-90"
          >
            {PHONE_DISPLAY}
          </a>
        </span>
      </div>
    </div>
  );
}
