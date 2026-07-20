import { useLocation } from 'react-router-dom';
import { AlertTriangle, Phone } from 'lucide-react';

const PHONE = '3171297626';
const WA_URL = `https://wa.me/52${PHONE}`;

export default function WhatsAppSuspendedBanner() {
  const location = useLocation();
  if (location.pathname.startsWith('/ruta')) return null;

  return (
    <div className="w-full px-4 py-2.5 text-center text-sm font-semibold flex items-center justify-center gap-3 bg-blue-600 text-white relative z-[100]">
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <span>
        Nuestro WhatsApp fue suspendido temporalmente. Por el momento todas las llamadas y mensajes al{' '}
        <strong>{PHONE}</strong>.
      </span>
      <a
        href={WA_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 px-4 py-1 rounded-full text-xs font-bold bg-white text-blue-700 hover:bg-white/90 transition shadow-sm"
      >
        <Phone className="h-3.5 w-3.5" />
        Contactar por WhatsApp
      </a>
    </div>
  );
}
