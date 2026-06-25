import { GiroTemplate } from "@/components/landing/GiroTemplate";
export default function RefresquerasPage() {
  return (
    <GiroTemplate
      slug="refresqueras-y-bebidas"
      giroNombre="refresqueras y bebidas"
      h1="Software de reparto para refresqueras y distribuidores de bebidas"
      subtitulo="Controla envases retornables, descuentos por volumen y rutas en una sola app móvil."
      dolores={[
        { titulo: "Envases que nunca regresan", descripcion: "Pierdes miles al mes por no saber cuántas cajas vacías te debe cada tienda." },
        { titulo: "Promociones mal aplicadas", descripcion: "El vendedor regala descuentos sin autorización y la utilidad se evapora." },
        { titulo: "Reparto sin visibilidad", descripcion: "No sabes en qué tienda anda cada camión ni cuánto ha vendido hoy." },
      ]}
      beneficios={[
        "Control de envases retornables por cliente",
        "Promociones nxm y por volumen blindadas",
        "Mapa en vivo de cada vendedor y ruta",
        "Tickets térmicos con folio fiscal opcional",
        "Cierre de ruta con efectivo esperado vs entregado",
        "Offline real para colonias sin cobertura",
      ]}
      faq={[
        { q: "¿Lleva control de envases retornables?", a: "Sí, suma y resta envases por cliente y te muestra el saldo en cualquier momento." },
        { q: "¿Puedo bloquear que el vendedor regale descuentos?", a: "Sí, permisos por usuario y autorización con PIN para descuentos fuera de regla." },
      ]}
    />
  );
}
