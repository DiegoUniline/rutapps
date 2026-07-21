import { useLocation } from 'react-router-dom';
import { MessageCircle } from 'lucide-react';

const PHONE = '3171045954';
const PHONE_DISPLAY = '317 104 5954';
const WA_URL = `https://wa.me/52${PHONE}`;

export default function WhatsAppSuspendedBanner() {
  const location = useLocation();
  if (location.pathname.startsWith('/ruta')) return null;

  return (
    <div className="w-full px-4 py-2 text-center text-sm font-medium flex items-center justify-center gap-3 bg-primary text-primary-foreground relative z-[100]">
      <MessageCircle className="h-4 w-4 shrink-0" />
      <span>
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
  );
}
