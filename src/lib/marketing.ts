// Helpers de marketing para la nueva landing.
// Cambia WHATSAPP_NUMBER cuando tengas el número definitivo.
export const WHATSAPP_NUMBER = "52XXXXXXXXXX"; // placeholder

export function waLink(message = "Hola, quiero probar Rutapp para mi negocio") {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}

export const SITE_URL = "https://rutapp.mx";
