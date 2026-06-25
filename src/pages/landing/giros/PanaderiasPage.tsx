import { GiroTemplate } from "@/components/landing/GiroTemplate";
export default function PanaderiasPage() {
  return (
    <GiroTemplate
      slug="panaderias-y-reparto"
      giroNombre="panaderías y reparto"
      h1="App de reparto para panaderías y productos frescos"
      subtitulo="Surte por la mañana, registra devoluciones del día anterior y cobra al instante."
      dolores={[
        { titulo: "Devoluciones que no cuadran", descripcion: "El pan que regresa al final del día no se registra y la merma se come tu margen." },
        { titulo: "Cobranza informal", descripcion: "Cuentas en libreta con cada tienda y nadie sabe cuánto te deben en realidad." },
        { titulo: "Rutas improvisadas", descripcion: "Cada chofer arma su orden y pierdes tiempo y gasolina." },
      ]}
      beneficios={[
        "Carga matutina por ruta con productos frescos",
        "Devoluciones por línea con motivo (merma, caducidad)",
        "Estado de cuenta por cliente en tiempo real",
        "Ruta optimizada en mapa para chofer",
        "Tickets impresos en mini-impresora bluetooth",
        "Cobranza en efectivo, transferencia o tarjeta",
      ]}
      faq={[
        { q: "¿Maneja productos frescos con devolución?", a: "Sí, la app diferencia venta, devolución y merma para que veas tu margen real." },
      ]}
    />
  );
}
