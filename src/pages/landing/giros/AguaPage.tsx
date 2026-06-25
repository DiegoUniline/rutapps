import { GiroTemplate } from "@/components/landing/GiroTemplate";
export default function AguaPage() {
  return (
    <GiroTemplate
      slug="agua-purificada"
      giroNombre="agua purificada"
      h1="Sistema de reparto para purificadoras de agua y garrafones"
      subtitulo="Control de garrafones prestados, rutas fijas y cobranza al instante."
      dolores={[
        { titulo: "Garrafones perdidos", descripcion: "No sabes cuántos garrafones tiene cada cliente prestados y los pierdes uno a uno." },
        { titulo: "Cobranza a domicilio sin folio", descripcion: "El repartidor cobra en efectivo y nadie sabe cuánto entró ese día." },
        { titulo: "Rutas fijas mal planeadas", descripcion: "El repartidor olvida casas y los clientes se cambian de proveedor." },
      ]}
      beneficios={[
        "Saldo de garrafones por cliente (vacío y lleno)",
        "Rutas fijas por día de la semana",
        "Cobranza con ticket impreso al momento",
        "Recordatorio de reposición a cliente por WhatsApp",
        "Cierre de ruta con efectivo y vacíos esperados",
        "Funciona offline",
      ]}
    />
  );
}
