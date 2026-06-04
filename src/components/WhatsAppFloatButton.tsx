import { MessageCircle } from "lucide-react";

const WHATSAPP_NUMBER = "5213171045954";
const WHATSAPP_URL = `https://wa.me/${WHATSAPP_NUMBER}`;

export function WhatsAppFloatButton() {
  return (
    <a
      href={WHATSAPP_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="fixed bottom-5 right-5 z-[100] flex items-center gap-2 rounded-full bg-[#25D366] px-4 py-3 text-white shadow-lg transition-all hover:scale-105 hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-[#25D366] focus:ring-offset-2"
      aria-label="Soporte por WhatsApp"
      title="Soporte por WhatsApp"
    >
      <MessageCircle className="h-5 w-5 shrink-0" />
      <span className="text-sm font-semibold">Soporte</span>
    </a>
  );
}
