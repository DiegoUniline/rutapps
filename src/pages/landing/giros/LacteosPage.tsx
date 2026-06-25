import { GiroTemplate } from "@/components/landing/GiroTemplate";
export default function LacteosPage() {
  return (
    <GiroTemplate
      slug="lacteos-y-cremerias"
      giroNombre="lácteos y cremerías"
      h1="Sistema de reparto para lácteos, quesos y cremerías"
      subtitulo="Caducidades, peso variable y devoluciones diarias bajo control."
      dolores={[
        { titulo: "Caducidades fuera de control", descripcion: "Producto vencido en el camión que se va a merma y nadie reportó." },
        { titulo: "Peso variable mal cobrado", descripcion: "Quesos por kilo cobrados de memoria, pérdidas que no ves." },
        { titulo: "Cobranza diaria desordenada", descripcion: "Tienditas que pagan en abonos y tú sin claridad de cuánto te deben." },
      ]}
      beneficios={[
        "Productos a granel con 3 decimales (kg)",
        "Control de lotes y fechas de caducidad",
        "Devoluciones con motivo y kardex automático",
        "Cobranza FIFO en efectivo o transferencia",
        "Estado de cuenta por cliente con WhatsApp",
        "Funciona offline en pueblos sin señal",
      ]}
    />
  );
}
